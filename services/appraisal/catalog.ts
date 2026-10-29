import config from './data/catalog.json' with { type: 'json' };
import demo from './data/demo_catalog.json' with { type: 'json' };
import { Decimal } from 'decimal.js';
import { Store } from './store.js';
import { normalizeSearch, runtimeMode } from './auth.js';
import { HttpError } from './errors.js';
import { toVnDate } from './domain.js';
export type CatalogKind = keyof typeof config.CATALOGS;
export function catalogKind(value: string): CatalogKind {
  if (!Object.hasOwn(config.CATALOGS, value)) throw new HttpError(422, 'Danh mục không hợp lệ.');
  return value as CatalogKind;
}
export const canEdit = (store: Store) =>
  runtimeMode() !== 'demo' && ['admin', 'head_of_department'].includes(store.actor.role);
export interface CatalogOptions {
  search?: string;
  category?: string;
  status?: string;
  offset?: number;
  limit?: number;
  sort?: string;
  direction?: string;
}
export async function catalogPage(store: Store, kind: CatalogKind, options: CatalogOptions = {}) {
  const spec = config.CATALOGS[kind];
  const offset = options.offset || 0;
  const limit = options.limit ?? 50;
  if (
    limit < 1 ||
    limit > 100 ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    !Number.isInteger(offset) ||
    (options.search?.length || 0) > 200
  )
    throw new HttpError(422, 'Bộ lọc danh mục không hợp lệ.');
  const sort = spec.fields.split(',').includes(options.sort || '') ? options.sort! : spec.name;
  const direction = options.direction === 'desc' ? 'desc' : 'asc';
  return store.query(runtimeMode() === 'demo', async (q) => {
    if (!q.pg) {
      await q.run('create table if not exists demo_catalog(kind text,id text,payload text,primary key(kind,id))');
      if (!(await q.run('select 1 from demo_catalog limit 1')).rows.length)
        for (const [kind, rows] of Object.entries(demo))
          for (const row of rows)
            await q.run('insert into demo_catalog values(?,?,?)', [kind, row.id, JSON.stringify(row)]);
    }
    const f = (field: string) => (q.pg ? field : `json_extract(payload,'$.${field}')`);
    const table = q.pg ? 'public.' + kind : 'demo_catalog';
    const clauses: string[] = q.pg ? [] : ['kind=?'];
    const values: unknown[] = q.pg ? [] : [kind];
    if (options.search) {
      const search = q.pg
        ? `public.f_unaccent(lower(concat_ws(' ',${spec.search.join(',')})))`
        : 'normalize_search(' + spec.search.map((key) => `coalesce(${f(key)},'')`).join(" || ' ' || ") + ')';
      clauses.push(search + " like ? escape '\\'");
      values.push(
        '%' +
          normalizeSearch(options.search).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') +
          '%',
      );
    }
    const state = kind === 'material_prices' ? 'period' : 'status';
    for (const [column, value] of [
      [spec.category, options.category],
      [state, options.status],
    ])
      if (value && value !== 'all') {
        clauses.push(f(column!) + '=?');
        values.push(value);
      }
    const suffix = clauses.length ? ' where ' + clauses.join(' and ') : '';
    const total = Number((await q.run(`select count(*) as n from ${table}${suffix}`, values)).rows[0].n);
    const rows = (
      await q.run(
        `select ${q.pg ? spec.fields : 'payload'} from ${table}${suffix} order by ${f(sort)} ${direction}${q.pg ? ' nulls last' : ''},id limit ? offset ?`,
        [...values, limit, offset],
      )
    ).rows;
    const items = q.pg ? rows : rows.map((row) => JSON.parse(String(row.payload)) as Record<string, unknown>);
    const choices = async (column: string) =>
      (
        await q.run(
          `select distinct ${f(column)} as value from ${table} where ${q.pg ? '' : 'kind=? and '}${f(column)} is not null order by 1 limit 100`,
          q.pg ? [] : [kind],
        )
      ).rows.map((row) => row.value);
    return {
      items,
      total,
      offset,
      limit,
      canEdit: canEdit(store),
      categories: await choices(spec.category),
      statuses: await choices(state),
      ...(!q.pg ? { mode: 'demo' } : {}),
    };
  });
}
export async function writeCatalog(
  store: Store,
  kind: CatalogKind,
  input: { revision?: number; values: Record<string, unknown> },
  id?: string,
) {
  if (!canEdit(store)) throw new HttpError(403, 'Trưởng phòng hoặc quản trị viên được cập nhật danh mục của tỉnh.');
  const values = { ...input.values };
  const allowed = config.FIELDS[kind] as string[];
  if (Object.keys(values).some((key) => !allowed.includes(key)))
    throw new HttpError(422, 'Có trường không được phép sửa.');
  const required: string[] =
    kind === 'organizations'
      ? ['code', 'name', 'type', 'address', 'status']
      : kind === 'personnel'
        ? [
            'full_name',
            'cert_number',
            'cert_authority',
            'cert_grade',
            'cert_expiry',
            'specialties',
            'status',
            ...(!id ? ['id_card'] : []),
          ]
        : ['code', 'name', 'unit', 'region', 'period', 'standard_price', 'market_price'];
  if (required.some((key) => values[key] === null || values[key] === undefined || values[key] === ''))
    throw new HttpError(422, 'Nhập đầy đủ các trường bắt buộc.');
  for (const [key, value] of Object.entries(values)) {
    if (key === 'specialties') {
      if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > 30 ||
        value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 200)
      )
        throw new HttpError(422, 'Nhập ít nhất một lĩnh vực hành nghề.');
    } else if (['standard_price', 'market_price'].includes(key)) {
      try {
        const number = new Decimal(String(value));
        if (!number.isFinite() || number.lt(0) || number.gt('9000000000000000')) throw new Error('Invalid price');
        values[key] = number.toFixed();
      } catch {
        throw new HttpError(422, 'Giá phải là số không âm hợp lệ.');
      }
    } else if (value !== null) {
      if (typeof value !== 'string' || value.length > 1000) throw new HttpError(422, 'Trường văn bản vượt giới hạn.');
      values[key] = value.trim() || null;
      if (required.includes(key) && !values[key]) throw new HttpError(422, 'Trường bắt buộc không được để trống.');
      if (key === 'cert_expiry' && value) {
        try {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date');
          toVnDate(value);
        } catch {
          throw new HttpError(422, 'Ngày hết hạn chưa hợp lệ.');
        }
      }
    }
  }
  if (kind === 'personnel' && id && !values.id_card) delete values.id_card;
  return store.query(true, async (q) => {
    if (kind === 'personnel') {
      const org = values.org_id
        ? (
            await q.run('select name from public.organizations where id=? and province_code=?', [
              values.org_id,
              store.actor.tenantId,
            ])
          ).rows[0]
        : null;
      if (values.org_id && !org) throw new HttpError(422, 'Đơn vị không thuộc danh mục trong phạm vi quyền.');
      values.org_name = org?.name || null;
    }
    if (!id) values.province_code = store.actor.tenantId;
    const keys = Object.keys(values);
    const fields = config.CATALOGS[kind].fields;
    const row = id
      ? (
          await q.run(
            `update public.${kind} set ${keys.map((key) => key + '=?').join(',')},revision=revision+1 where id=? and revision=? returning ${fields}`,
            [...keys.map((key) => values[key]), id, input.revision],
          )
        ).rows[0]
      : (
          await q.run(
            `insert into public.${kind}(${keys.join(',')}) values(${keys.map(() => '?').join(',')}) returning ${fields}`,
            keys.map((key) => values[key]),
          )
        ).rows[0];
    if (!row) throw new HttpError(409, 'Bản ghi đã thay đổi hoặc nằm ngoài phạm vi quyền. Tải lại trước khi sửa.');
    return row;
  });
}
export async function catalogHistory(store: Store, kind: CatalogKind, id: string, offset: number) {
  if (runtimeMode() === 'demo') throw new HttpError(404, 'Lịch sử danh mục dùng thử không có bản ghi.');
  return store.query(false, async (q) => {
    if (!(await q.run(`select id from public.${kind} where id=?`, [id])).rows.length)
      throw new HttpError(404, 'Không tìm thấy bản ghi trong phạm vi quyền.');
    const items = (
      await q.run(
        "select a.id,a.created_at,a.action,a.changed_fields,coalesce(u.full_name,'Cán bộ hệ thống') as actor from public.audit_logs a left join public.staff_users u on u.id=a.actor_id where a.table_name=? and a.record_id=? order by a.created_at desc,a.id limit 50 offset ?",
        [kind, id, offset],
      )
    ).rows;
    return { items, offset };
  });
}
