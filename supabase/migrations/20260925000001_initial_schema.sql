-- ====================================================================
-- HỆ THỐNG QUẢN LÝ & THẨM ĐỊNH XÂY DỰNG - SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN
-- INITIAL DATABASE SCHEMA MIGRATION FOR SUPABASE (POSTGRESQL 17)
-- ====================================================================

-- 1. KÍCH HOẠT CÁC EXTENSION CẦN THIẾT
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 2. BẢNG HỒ SƠ NGƯỜI DÙNG (PROFILES - LIÊN KẾT AUTH.USERS)
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    full_name text not null,
    avatar_url text,
    email text unique not null,
    phone text,
    department text,
    role text not null default 'officer' check (role in ('admin', 'director', 'head_of_department', 'officer', 'external_consultant', 'investor')),
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 3. BẢNG TỔ CHỨC THAM GIA HOẠT ĐỘNG XÂY DỰNG (ORGANIZATIONS)
create table if not exists public.organizations (
    id text default gen_random_uuid()::text primary key,
    code text unique not null,
    name text not null,
    short_name text,
    type text not null check (type in ('investor', 'consultant_design', 'consultant_audit', 'contractor', 'supervisor')),
    license_number text,
    tax_code text,
    issue_date date,
    address text not null,
    email text,
    phone text,
    legal_rep text,
    representative text,
    cert_number text,
    cert_grade text check (cert_grade in ('I', 'II', 'III', 'Chưa xếp hạng')),
    cert_expiry date,
    cert_scope text[] default '{}',
    status text default 'hieu_luc' check (status in ('hieu_luc', 'sap_het_han', 'het_han', 'tam_dung', 'active', 'suspended')),
    active_projects_count integer default 0,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_org_type on public.organizations(type);
create index if not exists idx_org_code on public.organizations(code);

-- 4. BẢNG CÁ NHÂN HÀNH NGHỀ XÂY DỰNG (PERSONNEL)
create table if not exists public.personnel (
    id text default gen_random_uuid()::text primary key,
    code text,
    full_name text not null,
    id_card text unique not null,
    cert_number text unique not null,
    cert_authority text not null,
    cert_expiry date not null,
    cert_grade text not null check (cert_grade in ('I', 'II', 'III')),
    specialties text[] not null default '{}',
    org_id text references public.organizations(id) on delete set null,
    org_name text,
    email text,
    phone text,
    status text default 'hieu_luc' check (status in ('hieu_luc', 'sap_het_han', 'het_han', 'thu_hoi')),
    active_projects_count integer default 0,
    has_conflict_warning boolean default false,
    conflict_details text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_personnel_org on public.personnel(org_id);
create index if not exists idx_personnel_cert_num on public.personnel(cert_number);
create index if not exists idx_personnel_id_card on public.personnel(id_card);
create index if not exists idx_personnel_status on public.personnel(status);

-- 5. BẢNG DỰ ÁN ĐẦU TƯ XÂY DỰNG & HỒ SƠ THẨM ĐỊNH (PROJECTS)
create table if not exists public.projects (
    id text default gen_random_uuid()::text primary key,
    code text unique not null,
    title text not null,
    field text not null,
    group_type text not null,
    grade text not null,
    investment_cost numeric(18, 2) not null check (investment_cost >= 0),
    investor_id text references public.organizations(id) on delete set null,
    investor_name text,
    designer_id text references public.organizations(id) on delete set null,
    designer_name text,
    auditor_id text references public.organizations(id) on delete set null,
    auditor_name text,
    lead_reviewer_id text references public.personnel(id) on delete set null,
    lead_reviewer_name text,
    procedure_type text not null,
    status text not null default 'Tiếp nhận hồ sơ',
    sla_days integer default 30,
    sla_status text default 'on_time' check (sla_status in ('on_time', 'near_deadline', 'overdue')),
    progress integer default 0 check (progress between 0 and 100),
    submission_date date not null default current_date,
    deadline date not null,
    location_district text not null,
    lat numeric(10, 6),
    lng numeric(10, 6),
    thumbnail_url text,
    description text,
    tt39_data jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_investor on public.projects(investor_id);
create index if not exists idx_projects_deadline on public.projects(deadline);
create index if not exists idx_projects_field on public.projects(field);

-- 6. BẢNG BỘ MÔN CHUYÊN NGÀNH THẨM ĐỊNH (APPRAISAL_DISCIPLINES)
create table if not exists public.appraisal_disciplines (
    id text default gen_random_uuid()::text primary key,
    project_id text references public.projects(id) on delete cascade not null,
    discipline_code text not null check (discipline_code in ('ARCH', 'STRUCT', 'MEP', 'FIRE', 'COST', 'ENV')),
    discipline_name text not null,
    assigned_reviewer_id text references public.personnel(id) on delete set null,
    status text default 'reviewing' check (status in ('pending', 'reviewing', 'approved', 'revision_required')),
    comments_count integer default 0,
    completion_date date,
    report_notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_disciplines_project on public.appraisal_disciplines(project_id);

-- 7. BẢNG CHECKLIST QUY CHUẨN - TIÊU CHUẨN XÂY DỰNG (APPRAISAL_CHECKLISTS)
create table if not exists public.appraisal_checklists (
    id text default gen_random_uuid()::text primary key,
    discipline_id text references public.appraisal_disciplines(id) on delete cascade not null,
    standard_code text not null,
    item_title text not null,
    requirement_description text not null,
    compliance_status text default 'not_evaluated' check (compliance_status in ('compliant', 'non_compliant', 'not_applicable', 'not_evaluated')),
    officer_notes text,
    ai_pre_check_result text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 8. BẢNG CẢNH BÁO TUÂN THỦ & XUNG ĐỘT AI (AI_COMPLIANCE_ALERTS)
create table if not exists public.ai_compliance_alerts (
    id text default gen_random_uuid()::text primary key,
    alert_type text not null,
    severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
    target_personnel_id text references public.personnel(id) on delete set null,
    target_project_id text references public.projects(id) on delete cascade,
    title text not null,
    message text not null,
    is_resolved boolean default false,
    resolved_by uuid references public.profiles(id) on delete set null,
    resolved_at timestamptz,
    created_at timestamptz default now()
);

create index if not exists idx_alerts_personnel on public.ai_compliance_alerts(target_personnel_id);
create index if not exists idx_alerts_project on public.ai_compliance_alerts(target_project_id);
create index if not exists idx_alerts_resolved on public.ai_compliance_alerts(is_resolved);

-- 9. BẢNG TỆP TIN & TÀI LIỆU HỒ SƠ ĐÍNH KÈM (PROJECT_DOCUMENTS)
create table if not exists public.project_documents (
    id text default gen_random_uuid()::text primary key,
    project_id text references public.projects(id) on delete cascade not null,
    category text not null check (category in ('drawing', 'bim', 'estimate', 'legal', 'report', 'other')),
    file_name text not null,
    file_size bigint not null,
    mime_type text not null,
    storage_path text not null,
    version integer default 1,
    uploaded_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz default now()
);

create index if not exists idx_docs_project on public.project_documents(project_id);

-- 10. HÀM TỰ ĐỘNG CẬP NHẬT UPDATED_AT
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger tr_organizations_updated before update on public.organizations for each row execute function public.handle_updated_at();
create trigger tr_personnel_updated before update on public.personnel for each row execute function public.handle_updated_at();
create trigger tr_projects_updated before update on public.projects for each row execute function public.handle_updated_at();
create trigger tr_disciplines_updated before update on public.appraisal_disciplines for each row execute function public.handle_updated_at();

-- 11. THIẾT LẬP ROW LEVEL SECURITY (RLS)
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.personnel enable row level security;
alter table public.projects enable row level security;
alter table public.appraisal_disciplines enable row level security;
alter table public.appraisal_checklists enable row level security;
alter table public.ai_compliance_alerts enable row level security;
alter table public.project_documents enable row level security;

-- Policies đọc cơ bản
create policy "Authenticated users can read organizations"
on public.organizations for select to authenticated using (true);

create policy "Authenticated users can read personnel"
on public.personnel for select to authenticated using (true);

create policy "Authenticated users can read projects"
on public.projects for select to authenticated using (true);

create policy "Authenticated users can read disciplines"
on public.appraisal_disciplines for select to authenticated using (true);

create policy "Authenticated users can read checklists"
on public.appraisal_checklists for select to authenticated using (true);

create policy "Authenticated users can read alerts"
on public.ai_compliance_alerts for select to authenticated using (true);

create policy "Authenticated users can read documents"
on public.project_documents for select to authenticated using (true);

-- Cán bộ Sở được toàn quyền ghi/chỉnh sửa
create policy "Staff manage organizations"
on public.organizations for all to authenticated using (true);

create policy "Staff manage personnel"
on public.personnel for all to authenticated using (true);

create policy "Staff manage projects"
on public.projects for all to authenticated using (true);

create policy "Staff manage disciplines"
on public.appraisal_disciplines for all to authenticated using (true);

create policy "Staff manage checklists"
on public.appraisal_checklists for all to authenticated using (true);
