import type { BimModel } from '../types/bim.types';

type Row = Record<string, any>;
export interface DemoManifest {
  project: { id: string; code: string; title: string };
  scope: { id: string; organizationId: string };
  models: BimModel[];
  elementCount: number;
}
let manifestPromise: Promise<DemoManifest> | undefined;
let enabled = false;
export const isBimStaticDemo = () => enabled;
export function loadBimDemo() {
  return (manifestPromise ??= fetch('/bim/demo/manifest.json')
    .then(async (response) => {
      if (!response.ok || !response.headers.get('content-type')?.includes('json'))
        throw new Error('Chưa có bộ mô hình BIM trong bản triển khai.');
      return response.json() as Promise<DemoManifest>;
    })
    .catch((error) => {
      manifestPromise = undefined;
      throw error;
    }));
}
export function enableBimStaticDemo(value: boolean) {
  enabled = value;
}
const elementFiles = new Map<string, Promise<Row[]>>();
async function elements(ids?: string[]): Promise<Row[]> {
  const manifest = await loadBimDemo();
  return (
    await Promise.all(
      manifest.models
        .filter((m) => !ids || ids.includes(m.id))
        .map((m) => {
          if (!elementFiles.has(m.id))
            elementFiles.set(
              m.id,
              fetch(`/bim/demo/elements/${m.id}.json.gz`)
                .then(async (response) => {
                  if (!response.ok || !response.body) throw new Error('Không tải được thuộc tính mô hình BIM.');
                  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
                })
                .catch((error) => {
                  elementFiles.delete(m.id);
                  throw error;
                }),
            );
          return elementFiles.get(m.id)!;
        }),
    )
  ).flat();
}
function split(expression: string) {
  const parts: string[] = [];
  let depth = 0,
    quote = false,
    start = 0;
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (c === '"' && expression[i - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      parts.push(expression.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, expression.slice(start)];
}
function match(row: Row, expression: string): boolean {
  if (expression.startsWith('and(')) return split(expression.slice(4, -1)).every((e) => match(row, e));
  if (expression.startsWith('or(')) return split(expression.slice(3, -1)).some((e) => match(row, e));
  const [, field, op, raw] = expression.match(/^([\w]+)\.(eq|gt|lt|ilike|is)\.(.*)$/) || [];
  if (!field) return false;
  const value = raw.replace(/^"|"$/g, '').replace(/\\"/g, '"');
  if (op === 'is') return value === 'null' ? row[field] == null : String(row[field]) === value;
  if (op === 'gt') return row[field] > value;
  if (op === 'lt') return row[field] < value;
  if (op === 'ilike')
    return String(row[field] ?? '')
      .toLowerCase()
      .includes(value.replace(/[%*]/g, '').toLowerCase());
  return String(row[field]) === value;
}
const readOnly = { message: 'Bản trình diễn chỉ đọc. Cần kết nối máy chủ để lưu thay đổi BIM.' };
class DemoQuery implements PromiseLike<any> {
  private filters: ((row: Row) => boolean)[] = [];
  private modelIds?: string[];
  private orders: { column: string; ascending: boolean }[] = [];
  private start = 0;
  private end = Infinity;
  private one = false;
  private head = false;
  private write = false;
  constructor(private table: string) {}
  select(_columns?: string, options?: { head?: boolean; count?: string }) {
    this.head = !!options?.head;
    return this;
  }
  eq(column: string, value: unknown) {
    if (column === 'model_id') this.modelIds = [String(value)];
    this.filters.push((r) => r[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    if (column === 'model_id') this.modelIds = values.map(String);
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((r) => (value === null ? r[column] == null : r[column] === value));
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    this.filters.push((r) => (operator === 'is' && value === null ? r[column] != null : r[column] !== value));
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((r) => r[column] !== value);
    return this;
  }
  gt(column: string, value: any) {
    this.filters.push((r) => r[column] > value);
    return this;
  }
  gte(column: string, value: any) {
    this.filters.push((r) => r[column] >= value);
    return this;
  }
  lte(column: string, value: any) {
    this.filters.push((r) => r[column] <= value);
    return this;
  }
  or(expression: string) {
    this.filters.push((r) => split(expression).some((e) => match(r, e)));
    return this;
  }
  ilike(column: string, pattern: string) {
    this.filters.push((r) => match(r, `${column}.ilike.${pattern}`));
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.start = from;
    this.end = to + 1;
    return this;
  }
  limit(limit: number) {
    this.end = this.start + limit;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    return this.single();
  }
  abortSignal(_signal: AbortSignal) {
    return this;
  }
  insert(_data: unknown) {
    this.write = true;
    return this;
  }
  upsert(_data: unknown) {
    this.write = true;
    return this;
  }
  update(_data: unknown) {
    this.write = true;
    return this;
  }
  delete() {
    this.write = true;
    return this;
  }
  async run() {
    if (this.write) return { data: null, error: readOnly };
    const manifest = await loadBimDemo();
    let rows: Row[] =
      this.table === 'bim_models'
        ? manifest.models
        : this.table === 'bim_elements'
          ? await elements(this.modelIds)
          : [];
    rows = rows.filter((row) => this.filters.every((filter) => filter(row)));
    const count = rows.length;
    if (this.orders.length)
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of this.orders) {
          const result = String(a[column] ?? '').localeCompare(String(b[column] ?? ''), 'vi', { numeric: true });
          if (result) return ascending ? result : -result;
        }
        return 0;
      });
    rows = rows.slice(this.start, this.end);
    return { data: this.head ? null : this.one ? (rows[0] ?? null) : rows, count, error: null };
  }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}
export const staticBimClient = {
  from: (table: string) => new DemoQuery(table),
  async rpc(name: string, args: Row = {}) {
    const manifest = await loadBimDemo();
    let data: unknown = [];
    if (name === 'bim_element_index') {
      const rows = await elements(args.p_model_ids);
      data = { rows: rows.slice(0, args.p_limit ?? 50000), total: rows.length };
    } else if (name === 'bim_project_site') data = null;
    else if (name === 'bim_5d_overview') data = { groups: [], element_total: manifest.elementCount, computed_at: null };
    else if (name === 'bim_danh_muc_truong') data = [];
    else if (
      !/^(bim_(workspace_acceptance|model_work_links|hang_doi|nguoi_tham_gia)|.*(_list|_danh_sach|_tong_hop|_chi_so|_lien_ket|_he_so|_muc_tieu|_so_do|_anh_xa|_danh_gia|_thiet_lap|_ke_hoach|_routes|_assets))$/.test(
        name,
      )
    )
      return { data: null, error: readOnly };
    return { data, error: null };
  },
  storage: {
    from: (_bucket: string) => ({
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: new URL(path, location.origin).href },
        error: null,
      }),
      createSignedUrls: async (paths: string[]) => ({
        data: paths.map((path) => ({ path, signedUrl: new URL(path, location.origin).href })),
        error: null,
      }),
      download: async (path: string) => ({ data: await (await fetch(path)).blob(), error: null }),
    }),
  },
};
