import { Router } from 'express';
import { Store } from './store.js';
import { requestStore, integer } from './routes-cases.js';
import { body } from './validation.js';
import { writable, runtimeMode, normalizeSearch } from './auth.js';
import { HttpError } from './errors.js';
import { readGallery, addImage, updateImage, removeImage, imageContent, gallerySchema } from './gallery.js';
import { catalogPage, catalogKind } from './catalog.js';
export async function projectAudit(store: Store, id: string, offset = 0, limit = 50) {
  const project = await store.project(id);
  return store.query(false, async (q) => {
    if (!q.pg) await gallerySchema(q);
    const source = q.pg
      ? `from (
      select a as event,c.payload->>'name' as name,c.id::text as case_id from public.appraisal_cases c
      cross join lateral jsonb_array_elements(c.payload->'audit') a where c.project_id=?
      union all select jsonb_build_object('id',a.id,'at',a.created_at,'actor',coalesce(u.full_name,'Cán bộ hệ thống'),
      'action',case when a.action='INSERT' then 'Tạo dự án' else 'Cập nhật dự án' end,
      'detail',case when 'images'=any(a.changed_fields) then 'Cập nhật thư viện ảnh' else 'Cập nhật thông tin dự án' end),
      ?,null from public.audit_logs a left join public.staff_users u on u.id=a.actor_id where a.table_name='projects' and a.record_id=?) events`
      : `from (
      select a.value as event,json_extract(c.payload,'$.name') as name,c.id as case_id from cases c,json_each(c.payload,'$.audit') a where json_extract(c.payload,'$.projectId')=?
      union all select json_object('id',id,'at',created_at,'actor',json_extract(actor,'$.name'),'action',case when instr(detail,':')>0 then substr(detail,1,instr(detail,':')-1) else 'Bổ sung ảnh' end,'detail',detail),?,null from project_image_audit where project_id=?) events`;
    const values = [id, project.title || project.name || 'Dự án', id];
    const total = Number((await q.run('select count(*) as n ' + source, values)).rows[0].n);
    const rows = (
      await q.run(
        `select event,name,case_id ${source} order by ${q.pg ? "event->>'at' desc,event->>'id'" : "json_extract(event,'$.at') desc,json_extract(event,'$.id')"} limit ? offset ?`,
        [...values, limit, offset],
      )
    ).rows;
    return {
      items: rows.map((row) => ({
        ...(typeof row.event === 'string' ? JSON.parse(row.event) : (row.event as object)),
        caseName: row.name,
        caseId: row.case_id,
      })),
      total,
      offset,
      limit,
    };
  });
}
export function projectsRouter() {
  const router = Router();
  router.get('/projects', async (req, res) =>
    res.json(
      await requestStore(res).projects({
        search: req.query.search as string,
        offset: integer(req.query.offset),
        limit: integer(req.query.limit, 50, 100),
        stage: req.query.stage as string,
        group: req.query.group as string,
        status: req.query.status as string,
        sort: req.query.sort as string,
        direction: req.query.direction as string,
      }),
    ),
  );
  router.get('/projects/:id', async (req, res) => res.json(await requestStore(res).project(req.params.id)));
  router.post('/projects', async (req, res) => {
    const input = body('CreateProject', req.body);
    const store = requestStore(res);
    writable(store.actor);
    if (runtimeMode() === 'demo')
      throw new HttpError(422, 'Tạo dự án cần môi trường cloud và tài khoản được phân quyền.');
    const result = await store.query(
      true,
      async (q) =>
        (await q.run('select public.create_appraisal_project(?::jsonb) as project', [JSON.stringify(input)])).rows[0]
          .project,
    );
    res.json(result);
  });
  router.get('/projects/:id/audit', async (req, res) =>
    res.json(
      await projectAudit(
        requestStore(res),
        req.params.id,
        integer(req.query.offset),
        integer(req.query.limit, 50, 100),
      ),
    ),
  );
  router.get('/projects/:id/images', async (req, res) => res.json(await readGallery(requestStore(res), req.params.id)));
  router.post('/projects/:id/images', async (req, res) =>
    res.json(await addImage(requestStore(res), req.params.id, body('AddProjectImage', req.body))),
  );
  router.patch('/projects/:id/images/:image_id', async (req, res) =>
    res.json(
      await updateImage(requestStore(res), req.params.id, req.params.image_id, body('UpdateProjectImage', req.body)),
    ),
  );
  router.delete('/projects/:id/images/:image_id', async (req, res) =>
    res.json(await removeImage(requestStore(res), req.params.id, req.params.image_id, integer(req.query.revision, 0))),
  );
  router.get('/projects/:id/images/:image_id/content', async (req, res) => {
    const data = await imageContent(requestStore(res), req.params.id, req.params.image_id);
    res
      .set(
        'Content-Type',
        data.subarray(0, 4).toString() === 'RIFF' ? 'image/webp' : data[0] === 137 ? 'image/png' : 'image/jpeg',
      )
      .send(data);
  });
  router.get('/organizations/options', async (req, res) => {
    const store = requestStore(res);
    const search = (req.query.search as string) || '';
    if (runtimeMode() === 'demo') {
      const rows = await catalogPage(store, 'organizations', { search, limit: 50, sort: 'name', direction: 'asc' });
      res.json(rows.items.map((row) => ({ id: row.id, name: row.name })));
      return;
    }
    res.json(
      await store.query(
        false,
        async (q) =>
          (
            await q.run(
              'select id,name from public.organizations where public.f_unaccent(lower(name)) like ? order by name,id limit 50',
              [
                '%' +
                  normalizeSearch(search).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') +
                  '%',
              ],
            )
          ).rows,
      ),
    );
  });
  router.get('/entities/:kind/:id', async (req, res) => {
    const kind =
      req.params.kind === 'organization' ? 'organizations' : req.params.kind === 'personnel' ? 'personnel' : '';
    if (!kind) throw new HttpError(422, 'Loại thực thể không hợp lệ.');
    const store = requestStore(res);
    const row = await store.query(runtimeMode() === 'demo', async (q) => {
      if (q.pg) return (await q.run(`select * from public.${catalogKind(kind)} where id=?`, [req.params.id])).rows[0];
      return null;
    });
    if (runtimeMode() === 'demo') {
      // Seed the same local catalog before reading its JSON payload by exact identifier.
      await catalogPage(store, kind, { limit: 1 });
      const result = await store.query(
        false,
        async (q) =>
          (await q.run('select payload from demo_catalog where kind=? and id=?', [kind, req.params.id])).rows[0],
      );
      if (!result) throw new HttpError(404, 'Không tìm thấy thực thể dùng thử.');
      res.json(JSON.parse(String(result.payload)));
      return;
    }
    if (!row) throw new HttpError(404, 'Không tìm thấy thực thể trong phạm vi quyền.');
    res.json(row);
  });
  return router;
}
