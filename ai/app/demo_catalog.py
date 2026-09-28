"""Explicit local fixtures, queried with SQLite instead of cloud fallback."""

import json
from pathlib import Path
from .store import db, normalize_search, DATA_DIR


def seed(con):
    con.execute('create table if not exists demo_catalog (kind text,id text,payload text,primary key(kind,id))')
    if con.execute('select 1 from demo_catalog limit 1').fetchone():
        return
    catalogs = json.loads((Path(__file__).parent / 'data/demo_catalog.json').read_text(encoding='utf-8'))
    con.executemany(
        'insert into demo_catalog values(?,?,?)',
        [(kind, r['id'], json.dumps(r, ensure_ascii=False)) for kind, rows in catalogs.items() for r in rows],
    )


def page(kind, spec, search, category, status, offset, limit, sort, direction):
    field = lambda name: "json_extract(payload,'$." + name + "')"
    where = ['kind=?']
    values = [kind]
    if search:
        where.append(
            'normalize_search('
            + " || ' ' || ".join('coalesce(' + field(k) + ",'')" for k in spec['search'])
            + ") like ? escape '\\'"
        )
        values.append(
            '%' + normalize_search(search).replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        )
    state = 'period' if kind == 'material_prices' else 'status'
    for column, value in [(spec['category'], category), (state, status)]:
        if value and value != 'all':
            where.append(field(column) + '=?')
            values.append(value)
    condition = ' and '.join(where)
    sort = sort if sort in spec['fields'].split(',') else spec['name']
    direction = 'desc' if direction == 'desc' else 'asc'
    with db() as con:
        seed(con)
        total = con.execute('select count(*) from demo_catalog where ' + condition, values).fetchone()[0]
        rows = [
            json.loads(r[0])
            for r in con.execute(
                'select payload from demo_catalog where '
                + condition
                + ' order by '
                + field(sort)
                + ' '
                + direction
                + ',id limit ? offset ?',
                values + [limit, offset],
            )
        ]
        options = lambda column: [
            r[0]
            for r in con.execute(
                'select distinct '
                + field(column)
                + ' from demo_catalog where kind=? and '
                + field(column)
                + ' is not null order by 1 limit 100',
                (kind,),
            )
        ]
        categories, statuses = options(spec['category']), options(state)
    return {
        'items': rows,
        'total': total,
        'offset': offset,
        'limit': limit,
        'canEdit': False,
        'categories': categories,
        'statuses': statuses,
        'mode': 'demo',
    }


def entity(kind, id):
    from fastapi import HTTPException

    with db() as con:
        seed(con)
        row = con.execute('select payload from demo_catalog where kind=? and id=?', (kind, id)).fetchone()
    if not row:
        raise HTTPException(404, 'Không tìm thấy thực thể dùng thử.')
    return json.loads(row[0])


def dashboard(kind):
    from . import store

    where = " where coalesce(sample,0)=" + ('1' if kind == 'sample' else '0') if kind in ('sample', 'real') else ''
    with db() as con:
        fields = con.execute(
            "select count(*),coalesce(sum(status in ('intake','analyzing','analyzed')),0),coalesce(sum(documentCount),0),coalesce(sum(status='reviewed'),0),coalesce(sum(status='request_supplement'),0),count(distinct dossierId) from case_summaries"
            + where
        ).fetchone()
        procedures = [
            {'id': r[0], 'total': r[1]}
            for r in con.execute("select procedure,count(*) from case_summaries" + where + ' group by 1 order by 1')
        ]
        months = {}
        for month_id, procedure, total in con.execute(
            "select substr(createdAt,1,7),procedure,count(*) from case_summaries" + where + ' group by 1,2 order by 1,2'
        ):
            month = months.setdefault(month_id, {'id': month_id, 'total': 0, 'procedures': {}})
            month['total'] += total
            month['procedures'][procedure] = total
        statuses = [
            {'id': r[0] or 'unknown', 'total': r[1]}
            for r in con.execute("select status,count(*) from case_summaries" + where + ' group by 1 order by 1')
        ]
        project_rows = list(
            con.execute(
                "select projectId,max(projectName),count(*),count(distinct dossierId) from case_summaries"
                + where
                + (" and " if where else " where ")
                + "projectId is not null and projectId<>'' group by 1 order by 3 desc,2,1 limit 6"
            )
        )
        recent = [
            dict(zip(['id', 'name', 'project_name', 'project_id', 'status'], r))
            for r in con.execute(
                "select id,name,projectName,projectId,status from case_summaries"
                + where
                + " order by updatedAt desc,id limit 10"
            )
        ]
    projects = store.DATA_DIR / 'projects.json'
    project_data = json.loads(projects.read_text(encoding='utf-8')) if projects.exists() else []
    names = {row['id']: row['name'] for row in project_data}
    top_projects = [
        {'id': r[0], 'name': names.get(r[0]) or r[1] or 'Dự án chưa đặt tên', 'total': r[2], 'dossiers': r[3]}
        for r in project_rows
    ]
    return {
        'cases': dict(zip(['total', 'in_progress', 'documents', 'reviewed', 'supplements', 'dossiers'], fields)),
        'projects': {'total': len(project_data)},
        'procedures': procedures,
        'months': list(months.values()),
        'statuses': statuses,
        'top_projects': top_projects,
        'recent': recent,
        'mode': 'demo',
    }
