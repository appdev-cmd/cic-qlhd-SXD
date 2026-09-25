/**
 * Kiểu bản ghi CSDL (snake_case) và hàm ánh xạ sang kiểu miền (camelCase).
 * Mọi thay đổi tên cột chỉ cần sửa tại đây.
 */
import type {
  Holiday,
  MaterialPrice,
  Organization,
  Personnel,
  Project,
  StaffUser,
} from '../types/domain';

export interface ProjectRow {
  id: string;
  code: string;
  title: string;
  field: string;
  investment_form: Project['investmentForm'];
  group_type: Project['projectGroup'];
  grade: Project['buildingGrade'];
  investment_cost: number | string;
  investor_id: string | null;
  investor_name: string | null;
  lead_reviewer_name: string | null;
  lead_reviewer_staff_id: string | null;
  procedure_type: Project['procedureType'];
  stage: Project['stage'];
  sla_status: Project['slaStatus'];
  submission_date: string;
  deadline: string;
  location_district: string;
  department: string;
  lat: number | string | null;
  lng: number | string | null;
  thumbnail_url: string | null;
  images: Project['images'] | null;
  contractors: Project['contractors'] | null;
  planning_compliance: boolean;
  standard_compliance: boolean;
  fire_safety_status: Project['fireSafetyStatus'];
  estimated_savings: number | string;
  workflow_state: Project['workflowState'];
  received_date: string | null;
  supplement_count: number;
  extension_count: number;
  is_appendix_iv: boolean;
  decided_by_commune: boolean;
  submitted_documents: string[] | null;
}

export const PROJECT_LIST_COLUMNS = [
  'id', 'code', 'title', 'field', 'investment_form', 'group_type', 'grade', 'investment_cost',
  'investor_id', 'investor_name', 'lead_reviewer_name', 'lead_reviewer_staff_id', 'procedure_type',
  'stage', 'sla_status', 'submission_date', 'deadline', 'location_district', 'department', 'lat', 'lng',
  'thumbnail_url', 'images', 'contractors', 'planning_compliance', 'standard_compliance',
  'fire_safety_status', 'estimated_savings', 'workflow_state', 'received_date', 'supplement_count',
  'extension_count', 'is_appendix_iv', 'decided_by_commune', 'submitted_documents',
].join(',');

const toNumber = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v));

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    code: row.code,
    name: row.title,
    coverImage: row.thumbnail_url ?? undefined,
    images: row.images ?? [],
    investorId: row.investor_id ?? '',
    investorName: row.investor_name ?? '',
    location: row.location_district,
    projectGroup: row.group_type,
    buildingGrade: row.grade,
    totalInvestment: toNumber(row.investment_cost),
    stage: row.stage,
    slaStatus: row.sla_status,
    submissionDate: row.submission_date,
    deadlineDate: row.deadline,
    assignee: row.lead_reviewer_name ?? '',
    assigneeStaffId: row.lead_reviewer_staff_id ?? undefined,
    department: row.department,
    planningCompliance: row.planning_compliance,
    standardCompliance: row.standard_compliance,
    fireSafetyStatus: row.fire_safety_status,
    estimatedSavings: toNumber(row.estimated_savings),
    contractors: row.contractors ?? [],
    investmentForm: row.investment_form,
    field: row.field,
    procedureType: row.procedure_type,
    lat: row.lat == null ? undefined : Number(row.lat),
    lng: row.lng == null ? undefined : Number(row.lng),
    workflowState: row.workflow_state,
    receivedDate: row.received_date ?? undefined,
    supplementCount: row.supplement_count,
    extensionCount: row.extension_count,
    isAppendixIV: row.is_appendix_iv,
    decidedByCommune: row.decided_by_commune,
    submittedDocuments: row.submitted_documents ?? [],
  };
}

export interface OrganizationRow {
  id: string;
  code: string;
  name: string;
  type: Organization['type'];
  tax_code: string | null;
  address: string;
  legal_rep: string | null;
  phone: string | null;
  cert_number: string | null;
  cert_grade: string | null;
  cert_expiry: string | null;
  active_projects_count: number | null;
  status: string;
}

export function mapOrganization(row: OrganizationRow): Organization {
  const grade = row.cert_grade;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    taxCode: row.tax_code ?? '',
    address: row.address,
    representative: row.legal_rep ?? '',
    phone: row.phone ?? '',
    certificateNumber: row.cert_number ?? undefined,
    certificateGrade: grade === 'I' || grade === 'II' || grade === 'III' ? grade : undefined,
    certificateExpiry: row.cert_expiry ?? undefined,
    activeProjectsCount: row.active_projects_count ?? 0,
    status: (['hieu_luc', 'sap_het_han', 'het_han'].includes(row.status) ? row.status : 'hieu_luc') as Organization['status'],
  };
}

export interface PersonnelRow {
  id: string;
  code: string | null;
  full_name: string;
  id_card: string;
  cert_number: string;
  cert_authority: string;
  cert_expiry: string;
  cert_grade: Personnel['certGrade'];
  specialties: string[] | null;
  org_id: string | null;
  org_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  active_projects_count: number | null;
  has_conflict_warning: boolean | null;
}

export function mapPersonnel(row: PersonnelRow): Personnel {
  return {
    id: row.id,
    code: row.code ?? row.id.toUpperCase(),
    fullName: row.full_name,
    idCard: row.id_card,
    phone: row.phone ?? '',
    email: row.email ?? '',
    orgId: row.org_id ?? '',
    orgName: row.org_name ?? '',
    specialties: row.specialties ?? [],
    certNumber: row.cert_number,
    certGrade: row.cert_grade,
    certIssuer: row.cert_authority,
    certExpiry: row.cert_expiry,
    status: (['hieu_luc', 'sap_het_han', 'het_han'].includes(row.status) ? row.status : 'het_han') as Personnel['status'],
    activeProjectsCount: row.active_projects_count ?? 0,
    hasConflictWarning: Boolean(row.has_conflict_warning),
  };
}

export interface MaterialPriceRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  standard_price: number | string;
  market_price: number | string;
  region: string;
  period: string;
  supplier: string | null;
}

export function mapMaterialPrice(row: MaterialPriceRow): MaterialPrice {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    standardPrice: toNumber(row.standard_price),
    marketPrice: toNumber(row.market_price),
    region: row.region,
    period: row.period,
    supplier: row.supplier ?? '',
  };
}

export interface StaffUserRow {
  id: string;
  full_name: string;
  title: string;
  department: string;
  role: StaffUser['role'];
  email: string | null;
  phone: string | null;
}

export function mapStaffUser(row: StaffUserRow): StaffUser {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    department: row.department,
    role: row.role,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
  };
}

export interface HolidayRow {
  holiday_date: string;
  name: string;
  kind: Holiday['kind'];
  is_confirmed: boolean;
  note: string | null;
}

export function mapHoliday(row: HolidayRow): Holiday {
  return {
    date: row.holiday_date,
    name: row.name,
    kind: row.kind,
    isConfirmed: row.is_confirmed,
    note: row.note ?? undefined,
  };
}
