-- ====================================================================
-- SCHEMA V2 (CORE): Chuẩn hóa dữ liệu dự án, tìm kiếm không dấu tại DB,
-- cán bộ Sở, giá vật liệu, lịch nghỉ lễ, nhật ký thay đổi & nhật ký AI,
-- RPC thống kê Dashboard.
-- Migration bổ sung (additive) — không sửa migration khởi tạo.
-- ====================================================================

-- 1. TÌM KIẾM TIẾNG VIỆT KHÔNG DẤU ----------------------------------------
do $do$
declare
    ext_schema text;
begin
    select n.nspname into ext_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'unaccent';

    if ext_schema is null then
        create schema if not exists extensions;
        create extension unaccent schema extensions;
        ext_schema := 'extensions';
    end if;

    execute format(
        $f$create or replace function public.f_unaccent(text) returns text
           language sql immutable parallel safe strict as
           $body$ select replace(replace(%I.unaccent(%L::regdictionary, $1), 'đ', 'd'), 'Đ', 'D') $body$
        $f$,
        ext_schema, ext_schema || '.unaccent'
    );
end $do$;

create or replace function public.f_search_text(variadic parts text[])
returns text language sql immutable parallel safe as $$
    select lower(public.f_unaccent(concat_ws(' ', variadic parts)))
$$;

-- 2. CÁN BỘ SỞ XÂY DỰNG (NGƯỜI DÙNG NỘI BỘ GIAI ĐOẠN PHÁT TRIỂN) -----------
create table if not exists public.staff_users (
    id text primary key,
    full_name text not null,
    title text not null,
    department text not null,
    role text not null check (role in ('officer', 'head_of_department', 'director', 'admin')),
    email text,
    phone text,
    province_code text not null default 'DB',
    is_active boolean not null default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 3. BỔ SUNG CỘT CHO BẢNG DỰ ÁN ------------------------------------------
alter table public.projects
    add column if not exists stage text not null default 'bcnckt',
    add column if not exists investment_form text not null default 'dau_tu_cong',
    add column if not exists department text not null default 'Phòng Quản lý Xây dựng',
    add column if not exists lead_reviewer_staff_id text references public.staff_users(id) on delete set null,
    add column if not exists planning_compliance boolean not null default true,
    add column if not exists standard_compliance boolean not null default true,
    add column if not exists fire_safety_status text not null default 'dat',
    add column if not exists estimated_savings numeric(18, 2) not null default 0,
    add column if not exists images jsonb not null default '[]'::jsonb,
    add column if not exists contractors jsonb not null default '[]'::jsonb,
    add column if not exists appraisal_data jsonb not null default '{}'::jsonb,
    add column if not exists province_code text not null default 'DB',
    add column if not exists search_text text;

alter table public.projects drop constraint if exists projects_sla_status_check;
alter table public.projects drop constraint if exists projects_stage_check;
alter table public.projects drop constraint if exists projects_investment_form_check;
alter table public.projects drop constraint if exists projects_fire_safety_status_check;

alter table public.projects
    add constraint projects_sla_status_check
        check (sla_status in ('tiep_nhan', 'dang_tham_dinh', 'yeu_cau_bo_sung', 'da_tham_dinh', 'qua_han')),
    add constraint projects_stage_check
        check (stage in ('bcnckt', 'gpxd', 'nghiem_thu', 'hoan_thanh')),
    add constraint projects_investment_form_check
        check (investment_form in ('dau_tu_cong', 'ppp', 'kinh_doanh')),
    add constraint projects_fire_safety_status_check
        check (fire_safety_status in ('dat', 'can_bo_sung', 'cho_y_kien_ca'));

create index if not exists idx_projects_stage on public.projects(stage);
create index if not exists idx_projects_sla_status on public.projects(sla_status);
create index if not exists idx_projects_group on public.projects(group_type);
create index if not exists idx_projects_submission on public.projects(submission_date);
create index if not exists idx_projects_province on public.projects(province_code);

alter table public.organizations add column if not exists search_text text;
alter table public.personnel add column if not exists search_text text;

-- Trigger cập nhật search_text
create or replace function public.tg_projects_search_text() returns trigger language plpgsql as $$
begin
    new.search_text := public.f_search_text(
        new.code, new.title, new.investor_name, new.location_district, new.lead_reviewer_name, new.field
    );
    return new;
end $$;

create or replace function public.tg_organizations_search_text() returns trigger language plpgsql as $$
begin
    new.search_text := public.f_search_text(
        new.code, new.name, new.short_name, new.tax_code, new.address, new.legal_rep, new.cert_number
    );
    return new;
end $$;

create or replace function public.tg_personnel_search_text() returns trigger language plpgsql as $$
begin
    new.search_text := public.f_search_text(
        new.code, new.full_name, new.cert_number, new.org_name, array_to_string(new.specialties, ' ')
    );
    return new;
end $$;

drop trigger if exists tr_projects_search_text on public.projects;
create trigger tr_projects_search_text before insert or update on public.projects
    for each row execute function public.tg_projects_search_text();

drop trigger if exists tr_organizations_search_text on public.organizations;
create trigger tr_organizations_search_text before insert or update on public.organizations
    for each row execute function public.tg_organizations_search_text();

drop trigger if exists tr_personnel_search_text on public.personnel;
create trigger tr_personnel_search_text before insert or update on public.personnel
    for each row execute function public.tg_personnel_search_text();

-- 4. GIÁ VẬT LIỆU XÂY DỰNG CÔNG BỐ ---------------------------------------
create table if not exists public.material_prices (
    id text primary key default gen_random_uuid()::text,
    code text unique not null,
    name text not null,
    unit text not null,
    standard_price numeric(18, 2) not null check (standard_price >= 0),
    market_price numeric(18, 2) not null check (market_price >= 0),
    region text not null,
    period text not null,
    supplier text,
    province_code text not null default 'DB',
    search_text text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create or replace function public.tg_material_prices_search_text() returns trigger language plpgsql as $$
begin
    new.search_text := public.f_search_text(new.code, new.name, new.region, new.supplier);
    return new;
end $$;

drop trigger if exists tr_material_prices_search_text on public.material_prices;
create trigger tr_material_prices_search_text before insert or update on public.material_prices
    for each row execute function public.tg_material_prices_search_text();

-- 5. LỊCH NGHỈ LỄ, TẾT (PHỤC VỤ TÍNH NGÀY LÀM VIỆC SLA) ------------------
create table if not exists public.holidays (
    holiday_date date primary key,
    name text not null,
    kind text not null default 'le_tet' check (kind in ('le_tet', 'nghi_bu', 'lam_bu')),
    is_confirmed boolean not null default false,
    note text
);

-- 6. NHẬT KÝ THAY ĐỔI DỮ LIỆU (AUDIT LOG) ---------------------------------
create table if not exists public.audit_logs (
    id bigserial primary key,
    table_name text not null,
    record_id text not null,
    action text not null check (action in ('insert', 'update', 'delete')),
    old_data jsonb,
    new_data jsonb,
    changed_fields text[],
    actor_id text not null default 'system',
    created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_record on public.audit_logs(table_name, record_id, created_at desc);

-- actor_id lấy từ header HTTP "x-actor-id" do Web gửi kèm (PostgREST)
create or replace function public.tg_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_old jsonb;
    v_new jsonb;
    v_changed text[];
    v_actor text;
    v_headers jsonb;
begin
    if coalesce(current_setting('app.skip_audit', true), '') = 'on' then
        return coalesce(new, old);
    end if;

    begin
        v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
        v_headers := null;
    end;
    v_actor := coalesce(v_headers ->> 'x-actor-id', 'system');

    if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old) - 'search_text'; end if;
    if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new) - 'search_text'; end if;

    if tg_op = 'UPDATE' then
        select array_agg(n.key order by n.key) into v_changed
        from jsonb_each(v_new) n
        where n.value is distinct from v_old -> n.key
          and n.key not in ('updated_at', 'created_at');
        if v_changed is null then
            return new;
        end if;
    end if;

    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, actor_id)
    values (
        tg_table_name,
        coalesce(v_new ->> 'id', v_old ->> 'id'),
        lower(tg_op),
        v_old,
        v_new,
        v_changed,
        v_actor
    );
    return coalesce(new, old);
end $$;

do $$
declare
    t text;
begin
    foreach t in array array[
        'projects', 'organizations', 'personnel', 'appraisal_disciplines',
        'appraisal_checklists', 'material_prices', 'staff_users'
    ] loop
        execute format('drop trigger if exists tr_%1$s_audit on public.%1$I', t);
        execute format(
            'create trigger tr_%1$s_audit after insert or update or delete on public.%1$I
             for each row execute function public.tg_audit_log()', t);
    end loop;
end $$;

-- View hiển thị: resolve mã cán bộ -> họ tên, bản ghi -> tên thực thể (không lộ ID thô)
create or replace view public.audit_logs_resolved with (security_invoker = true) as
select
    a.id,
    a.table_name,
    a.record_id,
    a.action,
    a.old_data,
    a.new_data,
    a.changed_fields,
    a.actor_id,
    coalesce(s.full_name, case when a.actor_id = 'system' then 'Hệ thống' else 'Người dùng không xác định' end) as actor_name,
    s.title as actor_title,
    coalesce(
        a.new_data ->> 'title', a.new_data ->> 'name', a.new_data ->> 'full_name', a.new_data ->> 'discipline_name',
        a.old_data ->> 'title', a.old_data ->> 'name', a.old_data ->> 'full_name', a.old_data ->> 'discipline_name',
        a.new_data ->> 'code', a.old_data ->> 'code'
    ) as record_label,
    a.created_at
from public.audit_logs a
left join public.staff_users s on s.id = a.actor_id;

-- 7. NHẬT KÝ AI (AI GOVERNANCE — LUẬT AI 2025) ---------------------------
create table if not exists public.ai_logs (
    id bigserial primary key,
    project_id text references public.projects(id) on delete cascade,
    feature text not null check (feature in ('legal_qa', 'compliance_check', 'cost_check', 'document_draft', 'completeness_check')),
    input_text text not null,
    output_text text,
    citations jsonb not null default '[]'::jsonb,
    model text,
    prompt_version text,
    kb_version text,
    is_demo boolean not null default false,
    officer_decision text check (officer_decision in ('accepted', 'rejected', 'edited')),
    decision_note text,
    actor_id text not null default 'system',
    latency_ms integer,
    created_at timestamptz not null default now()
);

create index if not exists idx_ai_logs_project on public.ai_logs(project_id, created_at desc);

-- 8. RPC THỐNG KÊ DASHBOARD (TỔNG HỢP TẠI DB) ----------------------------
create or replace function public.dashboard_summary(p_province text default 'DB')
returns table (
    total_projects bigint,
    active_appraisals bigint,
    overdue_count bigint,
    completed_count bigint,
    supplement_count bigint,
    on_time_rate numeric,
    total_investment numeric,
    total_savings numeric,
    approaching_deadline_count bigint
) language sql stable as $$
    select
        count(*),
        count(*) filter (where sla_status in ('tiep_nhan', 'dang_tham_dinh', 'yeu_cau_bo_sung')),
        count(*) filter (where sla_status = 'qua_han'),
        count(*) filter (where sla_status = 'da_tham_dinh'),
        count(*) filter (where sla_status = 'yeu_cau_bo_sung'),
        case when count(*) = 0 then 0
             else round(100.0 * count(*) filter (where sla_status <> 'qua_han') / count(*), 1) end,
        coalesce(sum(investment_cost), 0),
        coalesce(sum(estimated_savings), 0),
        count(*) filter (
            where sla_status in ('tiep_nhan', 'dang_tham_dinh')
              and deadline between current_date and current_date + 7
        )
    from public.projects
    where province_code = p_province
$$;

create or replace function public.dashboard_monthly(p_year integer default extract(year from current_date)::int, p_province text default 'DB')
returns table (month_no integer, received bigint, completed bigint, on_time_rate numeric, investment_billion numeric)
language sql stable as $$
    with months as (select generate_series(1, 12) as m),
    agg as (
        select
            extract(month from submission_date)::int as m,
            count(*) as received,
            count(*) filter (where sla_status = 'da_tham_dinh') as completed,
            count(*) filter (where sla_status <> 'qua_han') as on_time,
            sum(investment_cost) as investment
        from public.projects
        where extract(year from submission_date) = p_year and province_code = p_province
        group by 1
    )
    select
        months.m,
        coalesce(agg.received, 0),
        coalesce(agg.completed, 0),
        case when coalesce(agg.received, 0) = 0 then null else round(100.0 * agg.on_time / agg.received, 1) end,
        round(coalesce(agg.investment, 0) / 1e9, 1)
    from months left join agg on agg.m = months.m
    where months.m <= case when p_year = extract(year from current_date) then extract(month from current_date)::int else 12 end
    order by months.m
$$;

create or replace function public.dashboard_by_investment_form(p_province text default 'DB')
returns table (investment_form text, project_count bigint, total_investment numeric)
language sql stable as $$
    select investment_form, count(*), coalesce(sum(investment_cost), 0)
    from public.projects
    where province_code = p_province
    group by investment_form
    order by count(*) desc
$$;

-- 9. TRIGGER UPDATED_AT CHO BẢNG MỚI -------------------------------------
drop trigger if exists tr_staff_users_updated on public.staff_users;
create trigger tr_staff_users_updated before update on public.staff_users
    for each row execute function public.handle_updated_at();

drop trigger if exists tr_material_prices_updated on public.material_prices;
create trigger tr_material_prices_updated before update on public.material_prices
    for each row execute function public.handle_updated_at();

-- 10. RLS CHO BẢNG MỚI ----------------------------------------------------
alter table public.staff_users enable row level security;
alter table public.material_prices enable row level security;
alter table public.holidays enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_logs enable row level security;
