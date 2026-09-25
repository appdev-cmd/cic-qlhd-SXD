/**
 * Danh mục thực thể: Tổ chức, Cá nhân hành nghề, Giá vật liệu, Cán bộ Sở, Lịch nghỉ lễ.
 */
import type { Holiday, MaterialPrice, Organization, Personnel, StaffUser } from '../types/domain';
import { isDemoMode } from '../lib/dataMode';
import { requireSupabase } from '../lib/supabase';
import { loadDemo } from './demoSource';
import {
  mapHoliday,
  mapMaterialPrice,
  mapOrganization,
  mapPersonnel,
  mapStaffUser,
  type HolidayRow,
  type MaterialPriceRow,
  type OrganizationRow,
  type PersonnelRow,
  type StaffUserRow,
} from './rows';
import { applySearch, demoSearch, fetchAllChunked, unwrap } from './query';

const ORGANIZATION_COLUMNS =
  'id,code,name,type,tax_code,address,legal_rep,phone,cert_number,cert_grade,cert_expiry,active_projects_count,status';
const PERSONNEL_COLUMNS =
  'id,code,full_name,id_card,cert_number,cert_authority,cert_expiry,cert_grade,specialties,org_id,org_name,email,phone,status,active_projects_count,has_conflict_warning';
const MATERIAL_PRICE_COLUMNS = 'id,code,name,unit,standard_price,market_price,region,period,supplier';

// ─── Tổ chức ────────────────────────────────────────────────────────────────

export interface OrganizationFilters {
  search?: string;
  type?: Organization['type'];
  status?: Organization['status'];
}

export async function listOrganizations(f: OrganizationFilters = {}): Promise<Organization[]> {
  if (isDemoMode) {
    const { organizations } = await loadDemo();
    return demoSearch(organizations.MOCK_ORGANIZATIONS, f.search, (o) => [o.name, o.code, o.taxCode, o.address]).filter(
      (o) => (!f.type || o.type === f.type) && (!f.status || o.status === f.status)
    );
  }
  const rows = await fetchAllChunked<OrganizationRow>((from, to) => {
    let q = applySearch(requireSupabase().from('organizations').select(ORGANIZATION_COLUMNS), f.search);
    if (f.type) q = q.eq('type', f.type);
    if (f.status) q = q.eq('status', f.status);
    return q.order('name').range(from, to);
  }, 'Không tải được danh sách tổ chức');
  return rows.map(mapOrganization);
}

export async function getOrganization(id: string): Promise<Organization | null> {
  if (isDemoMode) {
    const { organizations } = await loadDemo();
    return organizations.MOCK_ORGANIZATIONS.find((o) => o.id === id) ?? null;
  }
  const row = unwrap(
    await requireSupabase().from('organizations').select(ORGANIZATION_COLUMNS).eq('id', id).maybeSingle(),
    'Không tải được tổ chức'
  ) as OrganizationRow | null;
  return row ? mapOrganization(row) : null;
}

// ─── Cá nhân hành nghề ──────────────────────────────────────────────────────

export interface PersonnelFilters {
  search?: string;
  certGrade?: Personnel['certGrade'];
  status?: Personnel['status'];
  orgId?: string;
}

export async function listPersonnel(f: PersonnelFilters = {}): Promise<Personnel[]> {
  if (isDemoMode) {
    const { personnel } = await loadDemo();
    return demoSearch(personnel.MOCK_PERSONNEL, f.search, (p) => [p.fullName, p.certNumber, p.orgName, p.code]).filter(
      (p) =>
        (!f.certGrade || p.certGrade === f.certGrade) &&
        (!f.status || p.status === f.status) &&
        (!f.orgId || p.orgId === f.orgId)
    );
  }
  const rows = await fetchAllChunked<PersonnelRow>((from, to) => {
    let q = applySearch(requireSupabase().from('personnel').select(PERSONNEL_COLUMNS), f.search);
    if (f.certGrade) q = q.eq('cert_grade', f.certGrade);
    if (f.status) q = q.eq('status', f.status);
    if (f.orgId) q = q.eq('org_id', f.orgId);
    return q.order('full_name').range(from, to);
  }, 'Không tải được danh sách cá nhân hành nghề');
  return rows.map(mapPersonnel);
}

export async function getPersonnel(id: string): Promise<Personnel | null> {
  if (isDemoMode) {
    const { personnel } = await loadDemo();
    return personnel.MOCK_PERSONNEL.find((p) => p.id === id) ?? null;
  }
  const row = unwrap(
    await requireSupabase().from('personnel').select(PERSONNEL_COLUMNS).eq('id', id).maybeSingle(),
    'Không tải được cá nhân hành nghề'
  ) as PersonnelRow | null;
  return row ? mapPersonnel(row) : null;
}

// ─── Giá vật liệu ───────────────────────────────────────────────────────────

export async function listMaterialPrices(search?: string): Promise<MaterialPrice[]> {
  if (isDemoMode) {
    const { mockData } = await loadDemo();
    return demoSearch(mockData.MOCK_MATERIAL_PRICES, search, (m) => [m.name, m.code, m.region, m.supplier]);
  }
  const rows = await fetchAllChunked<MaterialPriceRow>((from, to) => {
    return applySearch(requireSupabase().from('material_prices').select(MATERIAL_PRICE_COLUMNS), search)
      .order('code')
      .range(from, to);
  }, 'Không tải được bảng giá vật liệu');
  return rows.map(mapMaterialPrice);
}

// ─── Cán bộ Sở ──────────────────────────────────────────────────────────────

export async function listStaff(): Promise<StaffUser[]> {
  if (isDemoMode) {
    const { staff } = await loadDemo();
    return staff.MOCK_STAFF;
  }
  const result = await requireSupabase().from('staff_users').select('id,full_name,title,department,role,email,phone').eq('is_active', true).order('id');
  return (unwrap(result, 'Không tải được danh sách cán bộ') as StaffUserRow[]).map(mapStaffUser);
}

// ─── Lịch nghỉ lễ ───────────────────────────────────────────────────────────

export async function listHolidays(): Promise<Holiday[]> {
  if (isDemoMode) {
    const { holidays } = await loadDemo();
    return holidays.VN_HOLIDAYS;
  }
  const result = await requireSupabase().from('holidays').select('holiday_date,name,kind,is_confirmed,note').order('holiday_date');
  return (unwrap(result, 'Không tải được lịch nghỉ lễ') as HolidayRow[]).map(mapHoliday);
}
