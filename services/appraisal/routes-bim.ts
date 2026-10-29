import { Router } from 'express';
import { createHash } from 'node:crypto';
import { requestStore } from './routes-cases.js';
import { Store } from './store.js';
import { type Query } from './query.js';
import { HttpError } from './errors.js';
import { writable, normalizeSearch } from './auth.js';
import { uid, now } from './domain.js';
import { body } from './validation.js';
const decode = (value: any): any => (typeof value === 'string' ? JSON.parse(value) : value);
async function database<T>(store: Store, write: boolean, operation: (q: Query) => Promise<T>) {
  return store.query(write, async (raw) => {
    if (!raw.pg)
      for (const sql of [
        'create table if not exists bim_models(id text primary key,project_id text not null,payload text not null,status text not null,revision integer not null default 1)',
        'create table if not exists bim_files(model_id text,kind text,part integer,data blob not null,primary key(model_id,kind,part))',
        'create table if not exists bim_elements(model_id text,express_id integer,guid text,name text,category text,storey text,material text,payload text not null,primary key(model_id,express_id))',
        'create table if not exists bim_notes(id text primary key,model_id text not null,kind text not null,payload text not null,revision integer not null default 1)',
        'create table if not exists bim_events(id text primary key,project_id text,model_id text,payload text)',
        'create index if not exists bim_project on bim_models(project_id,status)',
        'create index if not exists bim_element_page on bim_elements(model_id,express_id)',
        'create index if not exists bim_event_project on bim_events(project_id)',
      ])
        await raw.run(sql);
    return operation({
      pg: raw.pg,
      run: (sql, values) =>
        raw.run(
          sql.replace(/\bbim_(models|files|elements|notes|events)\b/g, (name) => (raw.pg ? 'appraisal_' + name : name)),
          values,
        ),
    });
  });
}
async function model(q: Query, store: Store, id: string, writing = false) {
  const row = (
    await q.run('select payload,revision from bim_models where id=?' + (q.pg && writing ? ' for update' : ''), [id])
  ).rows[0];
  if (!row) throw new HttpError(404, 'Không tìm thấy mô hình trong phạm vi được phép.');
  const value = decode(row.payload);
  await store.project(value.project_id);
  if (writing) writable(store.actor);
  return { ...value, revision: Number(row.revision) };
}
async function event(q: Query, store: Store, value: any, action: string, detail: string) {
  const item = { id: uid(), at: now(), actor: store.actor.name, action, detail, modelName: value.file_name };
  await q.run('insert into bim_events(id,project_id,model_id,payload) values(?,?,?,?)', [
    item.id,
    value.project_id,
    value.id,
    JSON.stringify(item),
  ]);
}
export function bimRouter() {
  const router = Router();
  router.get('/bim/projects/:project_id/models', async (req, res) => {
    const store = requestStore(res);
    await store.project(req.params.project_id);
    res.json(
      await database(store, false, async (q) =>
        (
          await q.run(
            "select payload,revision from bim_models where project_id=? and status<>'archived' order by id desc limit 1000",
            [req.params.project_id],
          )
        ).rows.map((r) => ({ ...decode(r.payload), revision: Number(r.revision) })),
      ),
    );
  });
  router.post('/bim/projects/:project_id/models', async (req, res) => {
    const input = body('ModelInput', req.body);
    const store = requestStore(res);
    await store.project(req.params.project_id);
    writable(store.actor);
    if (Object.keys(input.files).sort().join(',') !== 'frag,ifc')
      throw new HttpError(422, 'Cần khai báo IFC và Fragments.');
    res.json(
      await database(store, true, async (q) => {
        const previous = input.previous_id ? await model(q, store, input.previous_id, true) : null;
        if (previous && (previous.project_id !== req.params.project_id || previous.status !== 'ready'))
          throw new HttpError(422, 'Phiên bản trước phải thuộc cùng dự án và đã sẵn sàng.');
        const stamp = now();
        const value = {
          id: uid(),
          project_id: req.params.project_id,
          file_name: input.file_name,
          file_size: input.files.ifc.size,
          file_hash: input.files.ifc.sha256,
          ifc_path: 'ifc',
          frag_path: 'frag',
          status: 'uploaded',
          discipline: input.discipline,
          element_count: 0,
          created_at: stamp,
          updated_at: stamp,
          uploaded_by: store.actor.name,
          phien_ban: 1 + (previous?.phien_ban || 0),
          model_goc_id: input.previous_id || null,
          manifest: input.files,
          expected_elements: input.element_count,
          ifc_schema: input.ifc_schema,
          revision: 1,
        };
        await q.run('insert into bim_models(id,project_id,payload,status,revision) values(?,?,?,?,1)', [
          value.id,
          value.project_id,
          JSON.stringify(value),
          'uploaded',
        ]);
        await event(q, store, value, 'Tiếp nhận mô hình', `${value.file_name} · phiên bản ${value.phien_ban}`);
        return value;
      }),
    );
  });
  router.post('/bim/models/:id/files/:kind/:part', async (req, res) => {
    const input = body('Chunk', req.body);
    const store = requestStore(res);
    const { id, kind } = req.params;
    const part = Number(req.params.part);
    if (
      !['ifc', 'frag'].includes(kind) ||
      !Number.isInteger(part) ||
      part < 0 ||
      part >= 200 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data)
    )
      throw new HttpError(422, 'Phần tệp không hợp lệ.');
    const bytes = Buffer.from(input.data, 'base64');
    await database(store, true, async (q) => {
      const value = await model(q, store, id, true);
      if (value.status !== 'uploaded') throw new HttpError(409, 'Mô hình đã hoàn tất hoặc đã lưu trữ.');
      if (!bytes.length || bytes.length !== Math.min(1024 * 1024, value.manifest[kind].size - part * 1024 * 1024))
        throw new HttpError(422, 'Kích thước phần tệp không khớp khai báo.');
      await q.run(
        'insert into bim_files(model_id,kind,part,data) values(?,?,?,?) on conflict(model_id,kind,part) do update set data=excluded.data',
        [id, kind, part, bytes],
      );
    });
    res.json({ ok: true });
  });
  router.post('/bim/models/:id/elements', async (req, res) => {
    const input = body('ElementBatch', req.body);
    const store = requestStore(res);
    await database(store, true, async (q) => {
      const value = await model(q, store, req.params.id, true);
      if (value.status !== 'uploaded') throw new HttpError(409, 'Mô hình đã khóa dữ liệu cấu kiện.');
      for (const r of input.items)
        await q.run(
          'insert into bim_elements(model_id,express_id,guid,name,category,storey,material,payload) values(?,?,?,?,?,?,?,?) on conflict(model_id,express_id) do update set guid=excluded.guid,name=excluded.name,category=excluded.category,storey=excluded.storey,material=excluded.material,payload=excluded.payload',
          [
            value.id,
            r.express_id,
            r.global_id || '',
            r.ten_cau_kien || '',
            r.loai_cau_kien || '',
            r.phan_doan_tang || '',
            r.vat_lieu || '',
            JSON.stringify(r),
          ],
        );
      const total = Number(
        (await q.run('select count(*) as n from bim_elements where model_id=?', [value.id])).rows[0].n,
      );
      if (total > value.expected_elements) throw new HttpError(422, 'Số cấu kiện vượt khai báo.');
    });
    res.json({ ok: true });
  });
  router.post('/bim/models/:id/finalize', async (req, res) => {
    const store = requestStore(res);
    res.json(
      await database(store, true, async (q) => {
        const value = await model(q, store, req.params.id, true);
        if (value.status !== 'uploaded') throw new HttpError(409, 'Mô hình đã được hoàn tất hoặc lưu trữ.');
        for (const [kind, manifest] of Object.entries(value.manifest) as [string, { size: number; sha256: string }][]) {
          const digest = createHash('sha256');
          let size = 0;
          let part = 0;
          for (const row of (
            await q.run('select part,data from bim_files where model_id=? and kind=? order by part', [value.id, kind])
          ).rows) {
            if (Number(row.part) !== part++) throw new HttpError(422, 'Tệp còn thiếu phần tải lên.');
            const data = Buffer.from(row.data as Uint8Array);
            digest.update(data);
            size += data.length;
          }
          if (size !== manifest.size || digest.digest('hex') !== manifest.sha256)
            throw new HttpError(422, 'Tệp chưa đầy đủ hoặc mã SHA-256 không khớp.');
        }
        const count = Number(
          (await q.run('select count(*) as n from bim_elements where model_id=?', [value.id])).rows[0].n,
        );
        if (count !== value.expected_elements) throw new HttpError(422, 'Chưa tải đủ cấu kiện.');
        Object.assign(value, { status: 'ready', element_count: count, updated_at: now() });
        await q.run(
          "update bim_models set status='ready',payload=?,revision=revision+1 where id=? and status='uploaded'",
          [JSON.stringify(value), value.id],
        );
        await event(
          q,
          store,
          value,
          'Hoàn tất chuyển đổi IFC',
          `Đã kiểm tra SHA-256, lưu hình học và ${count} cấu kiện.`,
        );
        return { ...value, revision: value.revision + 1 };
      }),
    );
  });
  router.get('/bim/models/:id/files/:kind', async (req, res) => {
    if (!['ifc', 'frag'].includes(req.params.kind)) throw new HttpError(404, 'Không tìm thấy tệp.');
    const store = requestStore(res);
    const bytes = await database(store, false, async (q) => {
      const value = await model(q, store, req.params.id);
      if (value.status !== 'ready') throw new HttpError(409, 'Mô hình chưa sẵn sàng.');
      return Buffer.concat(
        (
          await q.run('select data from bim_files where model_id=? and kind=? order by part', [
            value.id,
            req.params.kind,
          ])
        ).rows.map((r) => Buffer.from(r.data as Uint8Array)),
      );
    });
    res.type('application/octet-stream').send(bytes);
  });
  router.get('/bim/models/:id/elements', async (req, res) => {
    const store = requestStore(res);
    const { search = '', category = '', storey = '', offset = 0, limit = 100 } = req.query;
    res.json(
      await database(store, false, async (q) => {
        await model(q, store, req.params.id);
        const clauses = ['model_id=?'];
        const args: unknown[] = [req.params.id];
        if (search) {
          const term = '%' + normalizeSearch(String(search)).replace(/[\\%_]/g, '\\$&') + '%';
          clauses.push(
            `(${q.pg ? 'public.f_unaccent(lower(name))' : 'normalize_search(name)'} like ? escape '\\' or lower(guid) like ? escape '\\')`,
          );
          args.push(term, term);
        }
        for (const [column, value] of [
          ['category', category],
          ['storey', storey],
        ])
          if (value) {
            clauses.push(column + '=?');
            args.push(value);
          }
        const where = clauses.join(' and ');
        const total = Number((await q.run('select count(*) as n from bim_elements where ' + where, args)).rows[0].n);
        const rows = (
          await q.run('select payload from bim_elements where ' + where + ' order by express_id limit ? offset ?', [
            ...args,
            Number(limit),
            Number(offset),
          ])
        ).rows;
        return { items: rows.map((r) => decode(r.payload)), total, offset: Number(offset), limit: Number(limit) };
      }),
    );
  });
  router.get('/bim/models/:id/summary', async (req, res) => {
    const store = requestStore(res);
    res.json(
      await database(store, false, async (q) => {
        await model(q, store, req.params.id);
        const number = (key: string) =>
          q.pg ? `cast(payload->>'${key}' as double precision)` : `json_extract(payload,'$.${key}')`;
        return (
          await q.run(
            `select category,storey,count(*) as count,sum(${number('the_tich_be_tong')}) as volume,sum(${number('dien_tich')}) as area,sum(${number('chieu_dai')}) as length,sum(case when ${number('the_tich_be_tong')} is null then 1 else 0 end) as missing_volume from bim_elements where model_id=? group by category,storey order by category,storey`,
            [req.params.id],
          )
        ).rows.map((r) => ({ ...r, count: Number(r.count), missing_volume: Number(r.missing_volume) }));
      }),
    );
  });
  router.get('/bim/models/:id/notes', async (req, res) => {
    const store = requestStore(res);
    res.json(
      await database(store, false, async (q) => {
        await model(q, store, req.params.id);
        return (
          await q.run('select payload,revision from bim_notes where model_id=? order by id limit 1000', [req.params.id])
        ).rows.map((r) => ({ ...decode(r.payload), revision: Number(r.revision) }));
      }),
    );
  });
  router.post('/bim/models/:id/notes', async (req, res) => {
    const input = body('Note', req.body);
    const store = requestStore(res);
    res.json(
      await database(store, true, async (q) => {
        const value = await model(q, store, req.params.id, true);
        if (value.status !== 'ready') throw new HttpError(409, 'Chỉ ghi chú mô hình đã sẵn sàng.');
        const data = {
          id: input.id || uid(),
          kind: input.kind,
          name: input.name,
          description: input.description,
          status: input.status,
          viewpoint: input.viewpoint || null,
          updatedAt: now(),
          actor: store.actor.name,
        };
        if (input.id) {
          if (
            (
              await q.run(
                'update bim_notes set payload=?,revision=revision+1 where id=? and model_id=? and revision=? and kind=?',
                [JSON.stringify(data), data.id, value.id, input.revision, input.kind],
              )
            ).rowCount !== 1
          )
            throw new HttpError(409, 'Ghi chú đã thay đổi. Tải lại trước khi lưu.');
        } else
          await q.run('insert into bim_notes(id,model_id,kind,payload,revision) values(?,?,?,?,1)', [
            data.id,
            value.id,
            data.kind,
            JSON.stringify(data),
          ]);
        await event(q, store, value, input.kind === 'view' ? 'Lưu góc nhìn' : 'Cập nhật vướng mắc', input.name);
        return data;
      }),
    );
  });
  router.post('/bim/models/:id/archive', async (req, res) => {
    const input = body('Revision', req.body);
    const store = requestStore(res);
    await database(store, true, async (q) => {
      const value = await model(q, store, req.params.id, true);
      if (value.revision !== input.revision)
        throw new HttpError(409, 'Mô hình đã thay đổi. Tải lại trước khi lưu trữ.');
      Object.assign(value, { status: 'archived', updated_at: now() });
      if (
        (
          await q.run(
            "update bim_models set status='archived',payload=?,revision=revision+1 where id=? and revision=?",
            [JSON.stringify(value), value.id, input.revision],
          )
        ).rowCount !== 1
      )
        throw new HttpError(409, 'Mô hình vừa thay đổi.');
      await event(q, store, value, 'Lưu trữ mô hình', value.file_name);
    });
    res.json({ ok: true });
  });
  router.get('/bim/projects/:project_id/history', async (req, res) => {
    const store = requestStore(res);
    await store.project(req.params.project_id);
    res.json(
      await database(store, false, async (q) => ({
        items: (
          await q.run(
            `select payload from bim_events where project_id=? order by ${q.pg ? "payload->>'at'" : "json_extract(payload,'$.at')"} desc,id desc limit 50 offset ?`,
            [req.params.project_id, Number(req.query.offset || 0)],
          )
        ).rows.map((r) => decode(r.payload)),
        total: Number(
          (await q.run('select count(*) as n from bim_events where project_id=?', [req.params.project_id])).rows[0].n,
        ),
      })),
    );
  });
  return router;
}
