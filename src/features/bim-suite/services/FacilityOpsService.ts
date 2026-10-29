// Asset operations (ACC Build › Assets): work orders, my work, parts, preventive maintenance plans, floors/spaces,
// asset register from IFC/CSV, handover items, QR inspection routes, KPI and fault diagnoses. Permissions are enforced
// by RLS and the facility_* RPCs of migration 20261027150000_bim_assets_operations.sql; the client only calls them.
// Differences to cic-hud: no data_kind (demo/actual) filter, people from bim_nguoi_tham_gia, acceptances from
// bim_nghiem_thu, the work-order part of cic-hud BimWorkflowService lives here, IoT alert writes belong to BimIotService.
import { legacyDb } from '../lib/bimDb';
import { supabase } from '../adapters/supabase';
import { readAllRows } from '../lib/readAllRows';
import { BimService } from './BimService';
import {
  pickAssetPatch,
  type FacilityAsset,
  type FacilityAssetUpdate,
  type FacilityDocument,
} from './facilityAssetService';

export type { FacilityDocument } from './facilityAssetService';

const db = legacyDb;
function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}
const BUCKET = 'bim-facility-documents';
export const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

export type OrderPriority = 'low' | 'normal' | 'high' | 'critical';
export type OrderWorkType = 'sua_chua' | 'dinh_ky' | 'kiem_tra';
export type OrderStatus = 'open' | 'assigned' | 'in_progress' | 'review' | 'completed' | 'cancelled';
/** Completion confirmation; the server stamps the actor and time (no hand-drawn signature). */
export interface OrderSignature {
  url?: string | null;
  confirmed?: boolean;
  name?: string | null;
  signed_by?: string | null;
  signed_at?: string;
}
export interface MaintenanceOrder {
  id: string;
  project_id: string;
  asset_id: string;
  title: string;
  status: OrderStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string;
  started_at: string | null;
  completed_on: string | null;
  confirmed_by: string | null;
  result: string | null;
  cost: number | null;
  checklist: { label: string; done: boolean }[];
  attachments: FacilityDocument[];
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  priority?: OrderPriority;
  work_type?: OrderWorkType;
  sla_due_at?: string | null;
  labor_hours?: number | null;
  failure_code?: string | null;
  downtime_minutes?: number | null;
  reopened_from?: string | null;
  pm_plan_id?: string | null;
  pm_due_on?: string | null;
  completed_at?: string | null;
  signature?: OrderSignature | null;
  /** Set when the order was raised from an IoT alert. */
  iot_source_alert_id?: string | null;
}
/** Fields a project writer may change through facility_save_work_order. */
export const ORDER_PATCH_KEYS = [
  'status',
  'title',
  'assignee_id',
  'assignee_name',
  'due_date',
  'result',
  'cost',
  'checklist',
  'attachments',
  'completed_on',
  'priority',
  'work_type',
  'sla_due_at',
  'labor_hours',
  'failure_code',
  'downtime_minutes',
  'signature',
] as const;
export type OrderPatch = Partial<Pick<MaintenanceOrder, (typeof ORDER_PATCH_KEYS)[number]>>;
/** Fields the assignee may change through facility_assignee_save_work_order. */
export type AssigneePatch = Partial<
  Pick<
    MaintenanceOrder,
    | 'status'
    | 'result'
    | 'checklist'
    | 'attachments'
    | 'completed_on'
    | 'labor_hours'
    | 'failure_code'
    | 'downtime_minutes'
    | 'signature'
  >
>;
export interface FacilityEvent {
  id: number;
  actor_id: string | null;
  action?: string;
  reason?: string;
  created_at: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown>;
}
export interface FacilityPerson {
  id: string;
  name: string;
}

export interface WorkOrderPart {
  id: string;
  project_id: string;
  order_id: string;
  part_code: string | null;
  part_name: string;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  total_cost: number;
  created_at: string;
}
export interface PmPlan {
  id: string;
  project_id: string;
  name: string;
  asset_id: string | null;
  asset_category: string | null;
  cycle_days: number;
  lead_days: number;
  start_on: string;
  checklist_template: string[];
  default_assignee_id: string | null;
  priority: OrderPriority;
  active: boolean;
  version: number;
  created_by: string;
  created_at: string;
}
export type PmPlanDraft = Omit<PmPlan, 'id' | 'version' | 'created_by' | 'created_at'>;
export interface FacilityFloor {
  project_id: string;
  floor_key: string;
  building: string | null;
  level: number | null;
  name: string;
  elevation_m: number | null;
  source: 'ifc' | 'manual';
}
export interface FacilitySpace {
  project_id: string;
  space_code: string;
  floor_key: string;
  name: string | null;
  source: 'ifc' | 'manual';
}
export interface IfcAssetCandidate {
  model_id: string;
  model_name: string;
  global_id: string;
  ifc_class: string;
  name: string;
  type_name: string | null;
  manufacturer: string | null;
  model_label: string | null;
  serial_number: string | null;
  system_code: string | null;
  system_name: string | null;
  floor_key: string | null;
  floor_label: string | null;
  space_code: string | null;
  space_name: string | null;
  suggested_code: string;
  suggested_category: string;
  existing_asset_id: string | null;
  existing_asset_code: string | null;
  match: 'guid' | 'guid_other_model' | 'code' | null;
}
export interface ImportResult {
  them_moi: number;
  bo_qua: { global_id: string; ly_do: string }[];
}
export interface CsvImportResult {
  da_ghi: boolean;
  them_moi: number;
  cap_nhat: number;
  loi: { dong: number; ma: string | null; loi: string }[];
}
export interface HandoverItem {
  id: string;
  project_id: string;
  system_name: string;
  asset_id: string | null;
  label: string;
  kind: 'check' | 'acceptance' | 'document';
  required: boolean;
  seq: number;
  acceptance_id: string | null;
  document: FacilityDocument | null;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  note: string | null;
  version: number;
}
export interface AcceptanceRecord {
  ma_nghiem_thu: string;
  ten_nghiem_thu: string | null;
  ket_luan: string | null;
  ngay_nghiem_thu: string | null;
  bim_guid: string | null;
}
export interface InspectionRoute {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  checklist_template: string[];
  active: boolean;
  created_at: string;
}
export interface InspectionStep {
  project_id: string;
  route_id: string;
  seq: number;
  asset_id: string;
  note: string | null;
}
export interface InspectionRound {
  id: string;
  project_id: string;
  route_id: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  started_by: string;
  started_at: string;
  completed_at: string | null;
}
export interface InspectionScan {
  id: number;
  project_id: string;
  round_id: string;
  seq: number;
  asset_id: string;
  scanned_by: string;
  scanned_at: string;
  method: 'qr' | 'manual';
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  checklist: { label: string; done: boolean }[];
  result: 'ok' | 'issue';
  note: string | null;
  order_id: string | null;
}
export interface KpiMonth {
  project_id: string;
  month: string;
  created: number;
  completed: number;
  failures: number;
  mttr_hours: number | null;
  mtbf_hours: number | null;
  downtime_hours: number;
  backlog: number;
  pm_due: number;
  pm_on_time: number;
  pm_compliance_pct: number | null;
  on_time: number;
  on_time_pct: number | null;
  sla_total: number;
  sla_met: number;
  sla_met_pct: number | null;
  cost_total: number;
  labor_hours: number;
  asset_count: number;
}
/** Open IoT alert as read by the operations side panel (writes go through BimIotService). */
export interface OpenIotAlert {
  id: string;
  project_id: string;
  asset_id: string | null;
  name: string;
  severity: string;
  status: 'open' | 'acknowledged' | 'suppressed' | 'closed';
  opened_at: string;
}
/** Fault diagnosis (facility_fault_diagnoses): cause, repair method, parts, location. */
export interface FaultDiagnosis {
  id: string;
  project_id: string;
  asset_id: string;
  failure_code: string;
  ten_su_co: string;
  muc_do: 'thap' | 'trung_binh' | 'cao' | 'nghiem_trong';
  phat_hien_luc: string;
  nguon_phat_hien: string | null;
  trieu_chung: string;
  bang_chung: { chi_so: string; gia_tri: number | string; nguong: string; don_vi: string; danh_gia: string }[];
  nguyen_nhan_chinh: string;
  nguyen_nhan_phu: string[];
  do_tin_cay: number | null;
  cach_kiem_tra: string[];
  phuong_an: string;
  cac_buoc: { thu_tu: number; buoc: string }[];
  vat_tu: { ten: string; so_luong: number; don_vi: string; don_gia: number }[];
  vi_tri: Record<string, string | number>;
  duong_tiep_can: string | null;
  an_toan: string[];
  anh_huong: string | null;
  can_ngung_he_thong: boolean;
  doi_xu_ly: string | null;
  uoc_tinh_gio: number | null;
  uoc_tinh_chi_phi: number | null;
  uu_tien: OrderPriority;
  trang_thai: 'cho_xu_ly' | 'dang_xu_ly' | 'da_xu_ly' | 'huy';
  work_order_id: string | null;
  created_at: string;
  updated_at: string;
}
export type FaultDiagnosisDraft = Pick<
  FaultDiagnosis,
  'asset_id' | 'failure_code' | 'ten_su_co' | 'muc_do' | 'trieu_chung' | 'nguyen_nhan_chinh' | 'phuong_an' | 'uu_tien'
> &
  Partial<
    Pick<FaultDiagnosis, 'nguon_phat_hien' | 'doi_xu_ly' | 'uoc_tinh_gio' | 'uoc_tinh_chi_phi' | 'can_ngung_he_thong'>
  >;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toKpi = (row: Record<string, unknown>): KpiMonth => ({
  ...(row as unknown as KpiMonth),
  ...Object.fromEntries(
    [
      'created',
      'completed',
      'failures',
      'backlog',
      'pm_due',
      'pm_on_time',
      'on_time',
      'sla_total',
      'sla_met',
      'asset_count',
      'downtime_hours',
      'cost_total',
      'labor_hours',
    ].map((key) => [key, Number(row[key] ?? 0)]),
  ),
  ...Object.fromEntries(
    ['mttr_hours', 'mtbf_hours', 'pm_compliance_pct', 'on_time_pct', 'sla_met_pct'].map((key) => [key, num(row[key])]),
  ),
});
const countOpt = (count: boolean) => (count ? { count: 'exact' as const } : undefined);
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);

export const FacilityOpsService = {
  // ── People (project owner and members) ──
  async people(project: string): Promise<FacilityPerson[]> {
    const rows = await BimService.getProjectPeople(project);
    return rows.map((p) => ({ id: p.id, name: p.ten || p.email || 'Thành viên dự án' }));
  },

  // ── Asset documents (private bucket, folder = project) ──
  async uploadDocument(project: string, asset: string, file: File): Promise<FacilityDocument> {
    if (file.size > 20 * 1024 * 1024) throw new Error('Tệp tối đa 20 MB.');
    if (
      ![
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.type)
    )
      throw new Error('Chỉ nhận PDF, ảnh PNG/JPEG/WebP hoặc Word .docx.');
    const path = `${project}/${asset}/${crypto.randomUUID()}_${safeName(file.name)}`;
    const result = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (result.error) throw new Error(result.error.message);
    return { title: file.name, url: `storage:${path}` };
  },
  async documentUrl(document: FacilityDocument): Promise<string> {
    if (document.url.startsWith('storage:')) {
      const result = await supabase.storage.from(BUCKET).createSignedUrl(document.url.slice(8), 300);
      if (result.error) throw new Error(result.error.message);
      return result.data.signedUrl;
    }
    const url = new URL(document.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Liên kết tài liệu không hợp lệ.');
    return url.href;
  },

  // ── Work orders ──
  orders: (project: string, asset?: string) =>
    readAllRows<MaintenanceOrder>((from, to, count) => {
      let q = db.from('facility_work_orders').select('*', countOpt(count)).eq('project_id', project);
      if (asset) q = q.eq('asset_id', asset);
      return q.order('due_date').order('id').range(from, to);
    }),
  createOrder: async (
    order: Pick<MaintenanceOrder, 'project_id' | 'asset_id' | 'title' | 'due_date' | 'checklist'> &
      Partial<Pick<MaintenanceOrder, 'priority' | 'work_type' | 'sla_due_at'>>,
  ) => unwrap<MaintenanceOrder>(await db.from('facility_work_orders').insert(order).select().single()),
  saveOrder: async (order: MaintenanceOrder, patch: OrderPatch) =>
    unwrap<MaintenanceOrder>(
      await db.rpc('facility_save_work_order', {
        p_id: order.id,
        p_version: order.version,
        // The database rejects unknown fields: send only allowed ones.
        p_patch: Object.fromEntries(
          Object.entries(patch).filter(([key]) => (ORDER_PATCH_KEYS as readonly string[]).includes(key)),
        ),
      }),
    ),
  orderEvents: (project: string, order: string) =>
    readAllRows<FacilityEvent>((from, to, count) =>
      db
        .from('facility_work_order_events')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .eq('order_id', order)
        .order('id', { ascending: false })
        .range(from, to),
    ),
  assetEvents: (project: string, asset: string) =>
    readAllRows<FacilityEvent>((from, to, count) =>
      db
        .from('facility_asset_events')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .eq('asset_id', asset)
        .order('id', { ascending: false })
        .range(from, to),
    ),
  saveAsset: async (asset: FacilityAsset, patch: FacilityAssetUpdate, reason: string) =>
    unwrap<FacilityAsset>(
      await db.rpc('facility_save_asset', {
        p_id: asset.asset_id,
        p_expected: asset.updated_at,
        p_patch: pickAssetPatch(patch),
        p_reason: reason,
      }),
    ),

  // ── My work ──
  myOrders: (project: string, userId: string) =>
    readAllRows<MaintenanceOrder>((from, to, count) =>
      db
        .from('facility_work_orders')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .eq('assignee_id', userId)
        .order('due_date')
        .order('id')
        .range(from, to),
    ),
  assigneeSave: async (order: MaintenanceOrder, patch: AssigneePatch) =>
    unwrap<MaintenanceOrder>(
      await db.rpc('facility_assignee_save_work_order', { p_id: order.id, p_version: order.version, p_patch: patch }),
    ),
  reopen: async (order: MaintenanceOrder, reason: string, due?: string) =>
    unwrap<MaintenanceOrder>(
      await db.rpc('facility_reopen_work_order', { p_id: order.id, p_reason: reason, p_due: due || null }),
    ),
  /** Work-order photo: {project}/{asset}/wo-{order}/… in the private asset document bucket. */
  async uploadOrderFile(
    order: Pick<MaintenanceOrder, 'id' | 'project_id' | 'asset_id'>,
    file: Blob,
    title: string,
    gps?: string | null,
  ): Promise<FacilityDocument> {
    if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh tối đa 10 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Chỉ nhận ảnh PNG/JPEG/WebP.');
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${order.project_id}/${order.asset_id}/wo-${order.id}/photo-${crypto.randomUUID()}.${ext}`;
    const result = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (result.error) throw new Error(result.error.message);
    return { title, url: `storage:${path}`, kind: 'photo', gps: gps ?? null, taken_at: new Date().toISOString() };
  },

  // ── Parts ──
  parts: (order: string) =>
    readAllRows<WorkOrderPart>((from, to, count) =>
      db
        .from('facility_work_order_parts')
        .select('*', countOpt(count))
        .eq('order_id', order)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
  addPart: async (
    order: Pick<MaintenanceOrder, 'id' | 'project_id'>,
    part: Pick<WorkOrderPart, 'part_name' | 'part_code' | 'quantity' | 'unit' | 'unit_cost'>,
  ) =>
    unwrap<WorkOrderPart>(
      await db
        .from('facility_work_order_parts')
        .insert({ ...part, project_id: order.project_id, order_id: order.id })
        .select()
        .single(),
    ),
  removePart: async (id: string) => {
    const { error } = await db.from('facility_work_order_parts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Preventive maintenance ──
  plans: (project: string) =>
    readAllRows<PmPlan>((from, to, count) =>
      db
        .from('facility_pm_plans')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
  async savePlan(plan: PmPlanDraft & { id?: string; version?: number }): Promise<PmPlan> {
    const { id, version, ...fields } = plan;
    if (!id) return unwrap<PmPlan>(await db.from('facility_pm_plans').insert(fields).select().single());
    const { data, error } = await db
      .from('facility_pm_plans')
      .update(fields)
      .eq('id', id)
      .eq('version', version)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Kế hoạch đã được người khác cập nhật. Hãy tải lại.');
    return data as PmPlan;
  },
  async deletePlan(id: string) {
    const { error } = await db.from('facility_pm_plans').delete().eq('id', id);
    if (error)
      throw new Error(
        /foreign key|violates/i.test(error.message)
          ? 'Kế hoạch đã sinh phiếu: chỉ tạm dừng, không xóa.'
          : error.message,
      );
  },
  generatePm: async (project: string) =>
    unwrap<{
      phieu_moi: number;
      da_giao: number;
      loi: { ke_hoach: string; thiet_bi: string; loi: string }[];
      ngay: string;
    }>(await db.rpc('facility_generate_pm_orders', { p_project: project })),

  // ── Floors / spaces ──
  floors: (project: string) =>
    readAllRows<FacilityFloor>((from, to, count) =>
      db
        .from('facility_floors')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .order('building')
        .order('level')
        .order('floor_key')
        .range(from, to),
    ),
  spaces: (project: string) =>
    readAllRows<FacilitySpace>((from, to, count) =>
      db
        .from('facility_spaces')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .order('floor_key')
        .order('space_code')
        .range(from, to),
    ),
  syncLocations: async (project: string) =>
    unwrap<{ tang: number; khong_gian: number; tai_san: number }>(
      await db.rpc('facility_sync_locations', { p_project: project }),
    ),

  // ── Asset register from IFC / CSV ──
  ifcCandidates: (project: string, model?: string | null, classes?: string[] | null) =>
    readAllRows<IfcAssetCandidate>((from, to, count) =>
      db
        .rpc(
          'facility_ifc_asset_rows',
          { p_project: project, p_model: model || null, p_classes: classes?.length ? classes : null, p_guids: null },
          countOpt(count),
        )
        .order('model_id')
        .order('global_id')
        .range(from, to),
    ),
  importIfc: async (
    project: string,
    items: {
      model_id: string;
      global_id: string;
      asset_code?: string;
      category?: string;
      cycle_days?: number | null;
    }[],
  ) => unwrap<ImportResult>(await db.rpc('facility_import_ifc_assets', { p_project: project, p_items: items })),
  importCsv: async (project: string, rows: Record<string, string | number | null>[], reason: string, dryRun: boolean) =>
    unwrap<CsvImportResult>(
      await db.rpc('facility_import_assets_csv', {
        p_project: project,
        p_rows: rows,
        p_reason: reason,
        p_dry_run: dryRun,
      }),
    ),

  // ── Handover items (used by the handover panel) ──
  handoverItems: (project: string) =>
    readAllRows<HandoverItem>((from, to, count) =>
      db
        .from('facility_handover_items')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .order('system_name')
        .order('seq')
        .order('id')
        .range(from, to),
    ),
  addHandoverItems: async (
    items: Pick<HandoverItem, 'project_id' | 'system_name' | 'asset_id' | 'label' | 'kind' | 'required' | 'seq'>[],
  ) => unwrap<HandoverItem[]>(await db.from('facility_handover_items').insert(items).select()),
  async updateHandoverItem(
    item: HandoverItem,
    patch: Partial<Pick<HandoverItem, 'done' | 'acceptance_id' | 'document' | 'note' | 'label' | 'required'>>,
  ) {
    const { data, error } = await db
      .from('facility_handover_items')
      .update(patch)
      .eq('id', item.id)
      .eq('version', item.version)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Mục bàn giao đã thay đổi. Hãy tải lại.');
    return data as HandoverItem;
  },
  async removeHandoverItem(id: string) {
    const { error } = await db.from('facility_handover_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
  /** Acceptance records of the BIM module (bim_nghiem_thu, B3). */
  acceptanceRecords: async (project: string) =>
    unwrap<AcceptanceRecord[]>(
      await db
        .from('bim_nghiem_thu')
        .select('ma_nghiem_thu,ten_nghiem_thu,ket_luan,ngay_nghiem_thu,bim_guid')
        .eq('ma_du_an', project)
        .order('tao_luc', { ascending: false })
        .limit(500),
    ),

  // ── QR inspection routes ──
  routes: (project: string) =>
    readAllRows<InspectionRoute>((from, to, count) =>
      db
        .from('facility_inspection_routes')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
  steps: (route: string) =>
    readAllRows<InspectionStep>((from, to, count) =>
      db
        .from('facility_inspection_route_steps')
        .select('*', countOpt(count))
        .eq('route_id', route)
        .order('seq')
        .range(from, to),
    ),
  async saveRoute(
    route: Pick<InspectionRoute, 'project_id' | 'name' | 'description' | 'checklist_template' | 'active'> & {
      id?: string;
    },
    assetIds: string[],
  ) {
    const { id, ...fields } = route;
    const saved = id
      ? unwrap<InspectionRoute>(
          await db.from('facility_inspection_routes').update(fields).eq('id', id).select().single(),
        )
      : unwrap<InspectionRoute>(await db.from('facility_inspection_routes').insert(fields).select().single());
    const del = await db.from('facility_inspection_route_steps').delete().eq('route_id', saved.id);
    if (del.error) throw new Error(del.error.message);
    if (assetIds.length) {
      const ins = await db
        .from('facility_inspection_route_steps')
        .insert(
          assetIds.map((asset_id, i) => ({ project_id: saved.project_id, route_id: saved.id, seq: i + 1, asset_id })),
        );
      if (ins.error) throw new Error(ins.error.message);
    }
    return saved;
  },
  rounds: (project: string, route?: string) =>
    readAllRows<InspectionRound>((from, to, count) => {
      let q = db.from('facility_inspection_rounds').select('*', countOpt(count)).eq('project_id', project);
      if (route) q = q.eq('route_id', route);
      return q.order('started_at', { ascending: false }).order('id').range(from, to);
    }),
  scans: (round: string) =>
    readAllRows<InspectionScan>((from, to, count) =>
      db
        .from('facility_inspection_scans')
        .select('*', countOpt(count))
        .eq('round_id', round)
        .order('seq')
        .range(from, to),
    ),
  startRound: async (route: string) =>
    unwrap<InspectionRound>(await db.rpc('facility_start_inspection_round', { p_route: route })),
  logScan: async (
    round: string,
    asset: string,
    input: {
      method: 'qr' | 'manual';
      checklist: { label: string; done: boolean }[];
      result: 'ok' | 'issue';
      note?: string;
      lat?: number | null;
      lng?: number | null;
      accuracy?: number | null;
      createOrder?: boolean;
    },
  ) =>
    unwrap<InspectionScan>(
      await db.rpc('facility_log_inspection_scan', {
        p_round: round,
        p_asset: asset,
        p_method: input.method,
        p_checklist: input.checklist,
        p_result: input.result,
        p_note: input.note || null,
        p_lat: input.lat ?? null,
        p_lng: input.lng ?? null,
        p_accuracy: input.accuracy ?? null,
        p_create_order: !!input.createOrder,
      }),
    ),
  closeRound: async (round: string, abandon = false) =>
    unwrap<InspectionRound>(await db.rpc('facility_close_inspection_round', { p_round: round, p_abandon: abandon })),

  // ── KPI ──
  async kpis(project: string): Promise<KpiMonth[]> {
    const rows = unwrap<Record<string, unknown>[]>(
      await db
        .from('facility_kpi_monthly')
        .select('*')
        .eq('project_id', project)
        .order('month', { ascending: false })
        .limit(13),
    );
    return (rows || []).map(toKpi);
  },
  /** Operations summary of a period (new/completed orders, PM, alerts, rounds). */
  summary: async (project: string, from: string, to: string) =>
    unwrap<Record<string, unknown>>(
      await db.rpc('facility_ops_summary', { p_project: project, p_from: from, p_to: to }),
    ),
  async actorNames(project: string, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();
    const rows = unwrap<{ id: string; name: string }[]>(
      await db.rpc('facility_actor_names', { p_project: project, p_ids: unique }),
    );
    return new Map((rows || []).map((row) => [row.id, row.name]));
  },

  // ── Read-only lists (side panel, assistant) ──
  openAlerts: (project: string) =>
    readAllRows<OpenIotAlert>((from, to, count) =>
      db
        .from('bim_iot_alerts')
        .select('id,project_id,asset_id,name,severity,status,opened_at', countOpt(count))
        .eq('project_id', project)
        .in('status', ['open', 'acknowledged'])
        .order('opened_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
  overduePm: (project: string, today = vnToday()) =>
    readAllRows<MaintenanceOrder>((from, to, count) =>
      db
        .from('facility_work_orders')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .eq('work_type', 'dinh_ky')
        .not('status', 'in', '("completed","cancelled")')
        .lt('due_date', today)
        .order('due_date')
        .order('id')
        .range(from, to),
    ),
  overdueAssets: (project: string, today = vnToday()) =>
    readAllRows<FacilityAsset>((from, to, count) =>
      db
        .from('bim_assets')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .lt('next_maintenance_on', today)
        .neq('status', 'Retired')
        .order('next_maintenance_on')
        .order('asset_id')
        .range(from, to),
    ),
  warrantyExpiring: (project: string, until: string, today = vnToday()) =>
    readAllRows<FacilityAsset>((from, to, count) =>
      db
        .from('bim_assets')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .gte('warranty_expiry_on', today)
        .lte('warranty_expiry_on', until)
        .order('warranty_expiry_on')
        .order('asset_id')
        .range(from, to),
    ),

  // ── Fault diagnoses ──
  /** Diagnoses not cancelled, newest first; filtered by asset when given. */
  faultDiagnoses: (project: string, assetIds?: string[]) =>
    readAllRows<FaultDiagnosis>((from, to, count) => {
      let query = db
        .from('facility_fault_diagnoses')
        .select('*', countOpt(count))
        .eq('project_id', project)
        .neq('trang_thai', 'huy');
      if (assetIds?.length) query = query.in('asset_id', assetIds);
      return query.order('phat_hien_luc', { ascending: false }).order('id').range(from, to);
    }),
  createDiagnosis: async (project: string, draft: FaultDiagnosisDraft) =>
    unwrap<FaultDiagnosis>(
      await db
        .from('facility_fault_diagnoses')
        .insert({
          project_id: project,
          ...draft,
          trang_thai: 'cho_xu_ly',
        })
        .select()
        .single(),
    ),
  setDiagnosisStatus: async (id: string, trang_thai: FaultDiagnosis['trang_thai']) =>
    unwrap<FaultDiagnosis>(
      await db.from('facility_fault_diagnoses').update({ trang_thai }).eq('id', id).select().single(),
    ),
};
