"""Project-scoped BIM repository shared by demo SQLite and cloud PostgreSQL."""

import base64
import hashlib
import json
from contextlib import contextmanager
from uuid import uuid4
from fastapi import HTTPException
from psycopg.types.json import Jsonb
from . import store as storage
from .database import connection
from .domain import now

MAX_FILE = 200 * 1024 * 1024
CHUNK = 1024 * 1024


@contextmanager
def database(s):
    if storage.MODE == 'demo':
        with storage.db() as con:
            con.row_factory = __import__('sqlite3').Row
            con.executescript('''
              CREATE TABLE IF NOT EXISTS bim_models(id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
                payload TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
              CREATE TABLE IF NOT EXISTS bim_files(model_id TEXT, kind TEXT, part INTEGER, data BLOB NOT NULL,
                PRIMARY KEY(model_id,kind,part));
              CREATE TABLE IF NOT EXISTS bim_elements(model_id TEXT, express_id INTEGER, guid TEXT,
                name TEXT, category TEXT, storey TEXT, material TEXT, payload TEXT NOT NULL,
                PRIMARY KEY(model_id,express_id));
              CREATE TABLE IF NOT EXISTS bim_notes(id TEXT PRIMARY KEY, model_id TEXT NOT NULL,
                kind TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
              CREATE TABLE IF NOT EXISTS bim_events(id TEXT PRIMARY KEY,project_id TEXT,model_id TEXT,payload TEXT);
              CREATE INDEX IF NOT EXISTS bim_project ON bim_models(project_id,status);
              CREATE INDEX IF NOT EXISTS bim_element_page ON bim_elements(model_id,express_id);
              CREATE INDEX IF NOT EXISTS bim_note_page ON bim_notes(model_id,kind);
              CREATE INDEX IF NOT EXISTS bim_event_project ON bim_events(project_id);
            ''')
            yield Query(con, False)
    else:
        with connection(s.actor['id']) as con:
            yield Query(con, True)


class Query:
    def __init__(self, con, pg):
        self.con, self.pg = con, pg

    def run(self, sql, values=()):
        if self.pg:
            import re

            sql = re.sub(r'\bbim_(models|files|elements|notes|events)\b', r'appraisal_bim_\1', sql)
        return self.con.execute(sql.replace('?', '%s') if self.pg else sql, values)

    def encode(self, value):
        return Jsonb(value) if self.pg else json.dumps(value, ensure_ascii=False)

    def decode(self, value):
        return value if isinstance(value, (dict, list)) else json.loads(value)


def model(q, s, id, writing=False):
    row = q.run('SELECT * FROM bim_models WHERE id=?', (id,)).fetchone()
    if not row:
        raise HTTPException(404, 'Không tìm thấy mô hình trong phạm vi được phép.')
    s.project(row['project_id'])
    if writing and s.actor['role'] not in ('officer', 'head_of_department', 'director', 'admin'):
        raise HTTPException(403, 'Không có quyền cập nhật mô hình.')
    result = q.decode(row['payload'])
    result['revision'] = row['revision']
    return result


def event(q, s, m, action, detail):
    row = dict(id=str(uuid4()), at=now(), actor=s.actor['name'], action=action, detail=detail, modelName=m['file_name'])
    q.run(
        'INSERT INTO bim_events(id,project_id,model_id,payload) VALUES(?,?,?,?)',
        (row['id'], m['project_id'], m['id'], q.encode(row)),
    )


def list_models(s, project_id):
    s.project(project_id)
    with database(s) as q:
        rows = q.run(
            "SELECT payload,revision FROM bim_models WHERE project_id=? AND status<>'archived' ORDER BY id DESC LIMIT 1000",
            (project_id,),
        ).fetchall()
        return [{**q.decode(r['payload']), 'revision': r['revision']} for r in rows]


def create(s, project_id, body):
    s.project(project_id)
    if s.actor['role'] not in ('officer', 'head_of_department', 'director', 'admin'):
        raise HTTPException(403, 'Không có quyền tải mô hình.')
    with database(s) as q:
        previous = model(q, s, body.previous_id, True) if body.previous_id else None
        if previous and (previous['project_id'] != project_id or previous['status'] != 'ready'):
            raise HTTPException(422, 'Phiên bản trước phải thuộc cùng dự án và đã sẵn sàng.')
        stamp, id = now(), str(uuid4())
        data = dict(
            id=id,
            project_id=project_id,
            file_name=body.file_name,
            file_size=body.files['ifc'].size,
            file_hash=body.files['ifc'].sha256,
            ifc_path='ifc',
            frag_path='frag',
            status='uploaded',
            discipline=body.discipline,
            element_count=0,
            created_at=stamp,
            updated_at=stamp,
            uploaded_by=s.actor['name'],
            phien_ban=1 + (previous.get('phien_ban', 1) if previous else 0),
            model_goc_id=body.previous_id,
            manifest={k: v.model_dump() for k, v in body.files.items()},
            expected_elements=body.element_count,
            ifc_schema=body.ifc_schema,
            revision=1,
        )
        q.run(
            'INSERT INTO bim_models(id,project_id,payload,status,revision) VALUES(?,?,?,?,1)',
            (id, project_id, q.encode(data), 'uploaded'),
        )
        event(q, s, data, 'Tiếp nhận mô hình', f"{body.file_name} · phiên bản {data['phien_ban']}")
        return data


def put_chunk(s, id, kind, part, data):
    if kind not in ('ifc', 'frag') or not 0 <= part < 200:
        raise HTTPException(422, 'Phần tệp không hợp lệ.')
    try:
        blob = base64.b64decode(data, validate=True)
    except ValueError:
        raise HTTPException(422, 'Dữ liệu tệp không hợp lệ.') from None
    with database(s) as q:
        m = model(q, s, id, True)
        if m['status'] != 'uploaded':
            raise HTTPException(409, 'Mô hình đã hoàn tất hoặc đã lưu trữ.')
        size = m['manifest'][kind]['size']
        if len(blob) != min(CHUNK, size - part * CHUNK) or not blob:
            raise HTTPException(422, 'Kích thước phần tệp không khớp khai báo.')
        q.run(
            'INSERT INTO bim_files(model_id,kind,part,data) VALUES(?,?,?,?) ON CONFLICT(model_id,kind,part) DO UPDATE SET data=excluded.data',
            (id, kind, part, blob),
        )


def put_elements(s, id, rows):
    with database(s) as q:
        m = model(q, s, id, True)
        if m['status'] != 'uploaded':
            raise HTTPException(409, 'Mô hình đã khóa dữ liệu cấu kiện.')
        for r in rows:
            q.run(
                '''INSERT INTO bim_elements(model_id,express_id,guid,name,category,storey,material,payload)
                     VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(model_id,express_id) DO UPDATE SET
                     guid=excluded.guid,name=excluded.name,category=excluded.category,storey=excluded.storey,
                     material=excluded.material,payload=excluded.payload''',
                (
                    id,
                    r['express_id'],
                    r.get('global_id', ''),
                    r.get('ten_cau_kien') or '',
                    r.get('loai_cau_kien', ''),
                    r.get('phan_doan_tang') or '',
                    r.get('vat_lieu') or '',
                    q.encode(r),
                ),
            )
        total = q.run('SELECT count(*) AS n FROM bim_elements WHERE model_id=?', (id,)).fetchone()['n']
        if total > m['expected_elements']:
            raise HTTPException(422, 'Số cấu kiện vượt khai báo.')


def finalize(s, id):
    with database(s) as q:
        m = model(q, s, id, True)
        if m['status'] != 'uploaded':
            raise HTTPException(409, 'Mô hình đã được hoàn tất hoặc lưu trữ.')
        for kind, manifest in m['manifest'].items():
            rows = q.run(
                'SELECT part,data FROM bim_files WHERE model_id=? AND kind=? ORDER BY part', (id, kind)
            ).fetchall()
            digest, total = hashlib.sha256(), 0
            for index, r in enumerate(rows):
                if r['part'] != index:
                    raise HTTPException(422, 'Tệp còn thiếu phần tải lên.')
                digest.update(bytes(r['data']))
                total += len(r['data'])
            if total != manifest['size'] or digest.hexdigest() != manifest['sha256']:
                raise HTTPException(422, 'Tệp chưa đầy đủ hoặc mã SHA-256 không khớp.')
        n = q.run('SELECT count(*) AS n FROM bim_elements WHERE model_id=?', (id,)).fetchone()['n']
        if n != m['expected_elements']:
            raise HTTPException(422, 'Chưa tải đủ cấu kiện.')
        m.update(status='ready', element_count=n, updated_at=now())
        cur = q.run(
            "UPDATE bim_models SET status='ready',payload=?,revision=revision+1 WHERE id=? AND status='uploaded'",
            (q.encode(m), id),
        )
        if cur.rowcount != 1:
            raise HTTPException(409, 'Mô hình vừa thay đổi. Hãy tải lại.')
        event(q, s, m, 'Hoàn tất chuyển đổi IFC', f"Đã kiểm tra SHA-256, lưu hình học và {n} cấu kiện.")
        return {**m, 'revision': m['revision'] + 1}


def file_content(s, id, kind):
    if kind not in ('ifc', 'frag'):
        raise HTTPException(404, 'Không tìm thấy tệp.')
    with database(s) as q:
        m = model(q, s, id)
        if m['status'] != 'ready':
            raise HTTPException(409, 'Mô hình chưa sẵn sàng.')
        return b''.join(
            bytes(r['data'])
            for r in q.run(
                'SELECT data FROM bim_files WHERE model_id=? AND kind=? ORDER BY part', (id, kind)
            ).fetchall()
        )


def elements(s, id, search='', category='', storey='', offset=0, limit=100):
    with database(s) as q:
        model(q, s, id)
        clauses, args = ['model_id=?'], [id]
        if search:
            # Accent-insensitive search in both backends, with wildcard escaping.
            term = (
                '%'
                + storage.normalize_search(search).replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
                + '%'
            )
            normalized_name = 'public.f_unaccent(lower(name))' if q.pg else 'normalize_search(name)'
            clauses.append(f"({normalized_name} LIKE ? ESCAPE '\\' OR lower(guid) LIKE ? ESCAPE '\\')")
            args.extend([term, term])
        for col, val in [('category', category), ('storey', storey)]:
            if val:
                clauses.append(col + '=?')
                args.append(val)
        where = ' AND '.join(clauses)
        total = q.run('SELECT count(*) AS n FROM bim_elements WHERE ' + where, args).fetchone()['n']
        rows = q.run(
            'SELECT payload FROM bim_elements WHERE ' + where + ' ORDER BY express_id LIMIT ? OFFSET ?',
            (*args, limit, offset),
        ).fetchall()
        return dict(items=[q.decode(r['payload']) for r in rows], total=total, offset=offset, limit=limit)


def summary(s, id):
    with database(s) as q:
        model(q, s, id)

        def num(key):
            return f"cast(payload->>'{key}' AS double precision)" if q.pg else f"json_extract(payload,'$.{key}')"

        rows = q.run(
            f'''SELECT category,storey,count(*) AS count,sum({num('the_tich_be_tong')}) AS volume,
          sum({num('dien_tich')}) AS area,sum({num('chieu_dai')}) AS length,
          sum(CASE WHEN {num('the_tich_be_tong')} IS NULL THEN 1 ELSE 0 END) AS missing_volume
          FROM bim_elements WHERE model_id=? GROUP BY category,storey ORDER BY category,storey''',
            (id,),
        ).fetchall()
        return [dict(r) for r in rows]


def notes(s, id):
    with database(s) as q:
        model(q, s, id)
        return [
            {**q.decode(r['payload']), 'revision': r['revision']}
            for r in q.run(
                'SELECT payload,revision FROM bim_notes WHERE model_id=? ORDER BY id LIMIT 1000', (id,)
            ).fetchall()
        ]


def save_note(s, id, body):
    with database(s) as q:
        m = model(q, s, id, True)
        if m['status'] != 'ready':
            raise HTTPException(409, 'Chỉ ghi chú mô hình đã sẵn sàng.')
        note_id = body.id or str(uuid4())
        data = dict(
            id=note_id,
            kind=body.kind,
            name=body.name,
            description=body.description,
            status=body.status,
            viewpoint=body.viewpoint,
            updatedAt=now(),
            actor=s.actor['name'],
        )
        if body.id:
            cur = q.run(
                'UPDATE bim_notes SET payload=?,revision=revision+1 WHERE id=? AND model_id=? AND revision=? AND kind=?',
                (q.encode(data), note_id, id, body.revision, body.kind),
            )
            if cur.rowcount != 1:
                raise HTTPException(409, 'Ghi chú đã thay đổi. Tải lại trước khi lưu.')
        else:
            q.run(
                'INSERT INTO bim_notes(id,model_id,kind,payload,revision) VALUES(?,?,?,?,1)',
                (note_id, id, body.kind, q.encode(data)),
            )
        event(q, s, m, 'Lưu góc nhìn' if body.kind == 'view' else 'Cập nhật vướng mắc', body.name)
        return data


def archive(s, id, revision):
    with database(s) as q:
        m = model(q, s, id, True)
        if m['revision'] != revision:
            raise HTTPException(409, 'Mô hình đã thay đổi. Tải lại trước khi lưu trữ.')
        m.update(status='archived', updated_at=now())
        q.run(
            "UPDATE bim_models SET status='archived',payload=?,revision=revision+1 WHERE id=? AND revision=?",
            (q.encode(m), id, revision),
        )
        event(q, s, m, 'Lưu trữ mô hình', m['file_name'])


def history(s, project_id, offset=0):
    s.project(project_id)
    with database(s) as q:
        total = q.run('SELECT count(*) AS n FROM bim_events WHERE project_id=?', (project_id,)).fetchone()['n']
        at = "payload->>'at'" if q.pg else "json_extract(payload,'$.at')"
        rows = q.run(
            f'SELECT payload FROM bim_events WHERE project_id=? ORDER BY {at} DESC,id DESC LIMIT 50 OFFSET ?',
            (project_id, offset),
        ).fetchall()
        return dict(items=[q.decode(r['payload']) for r in rows], total=total)
