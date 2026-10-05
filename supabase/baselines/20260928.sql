-- Baseline schema cloud 28/09/2026; không chứa dữ liệu/credential.

-- Chỉ áp vào database Supabase trống. Database hiện hữu dùng migration tăng dần.

begin;

set local check_function_bodies=off;

create schema if not exists extensions;

create extension if not exists "uuid-ossp" with schema extensions;

create extension if not exists pgcrypto with schema extensions;

create extension if not exists unaccent with schema extensions;

do $$ begin if not exists(select 1 from pg_roles where rolname='appraisal_backend') then create role appraisal_backend nologin inherit nosuperuser nocreatedb nocreaterole nobypassrls; end if; end $$;

grant authenticated to appraisal_backend;

grant usage on schema public to authenticated,appraisal_backend;

create sequence public."ai_logs_id_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public."audit_logs_id_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence public."workflow_transitions_id_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create table public."ai_compliance_alerts" (
  "id" text default (gen_random_uuid())::text not null,
  "alert_type" text not null,
  "severity" text default 'warning'::text not null,
  "target_personnel_id" text,
  "target_project_id" text,
  "title" text not null,
  "message" text not null,
  "is_resolved" boolean default false,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone default now()
);

create table public."ai_logs" (
  "id" bigint default nextval('ai_logs_id_seq'::regclass) not null,
  "project_id" text,
  "feature" text not null,
  "input_text" text not null,
  "output_text" text,
  "citations" jsonb default '[]'::jsonb not null,
  "model" text,
  "prompt_version" text,
  "kb_version" text,
  "is_demo" boolean default false not null,
  "officer_decision" text,
  "decision_note" text,
  "actor_id" text default 'system'::text not null,
  "latency_ms" integer,
  "created_at" timestamp with time zone default now() not null
);

create table public."appraisal_ai_logs" (
  "id" bigint generated always as identity not null,
  "case_id" uuid not null,
  "actor_id" uuid not null,
  "run_id" text not null,
  "run" jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."appraisal_audit_logs" (
  "id" bigint generated always as identity not null,
  "case_id" uuid not null,
  "actor_id" uuid not null,
  "actor_name" text not null,
  "revision" integer not null,
  "event" jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."appraisal_cases" (
  "id" uuid not null,
  "province_id" text not null,
  "department" text not null,
  "revision" integer not null,
  "payload" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "project_id" text,
  "procedure" text default 'bcnckt'::text not null,
  "previous_submission_id" uuid,
  "dossier_id" uuid not null,
  "submission_round" integer not null
);

create table public."appraisal_checklists" (
  "id" text default (gen_random_uuid())::text not null,
  "discipline_id" text not null,
  "standard_code" text not null,
  "item_title" text not null,
  "requirement_description" text not null,
  "compliance_status" text default 'not_evaluated'::text,
  "officer_notes" text,
  "ai_pre_check_result" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

create table public."appraisal_disciplines" (
  "id" text default (gen_random_uuid())::text not null,
  "project_id" text not null,
  "discipline_code" text not null,
  "discipline_name" text not null,
  "assigned_reviewer_id" text,
  "status" text default 'reviewing'::text,
  "comments_count" integer default 0,
  "completion_date" date,
  "report_notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

create table public."appraisal_dossiers" (
  "id" uuid not null,
  "project_id" text,
  "province_id" text not null,
  "department" text not null,
  "procedure" text not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."appraisal_jobs" (
  "id" uuid not null,
  "case_id" uuid not null,
  "actor_id" uuid not null,
  "snapshot" jsonb not null,
  "state" text default 'queued'::text not null,
  "attempts" integer default 0 not null,
  "lease_owner" text,
  "lease_until" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "error_code" text
);

create table public."appraisal_upload_sessions" (
  "id" uuid not null,
  "case_id" uuid not null,
  "actor_id" uuid not null,
  "expected_revision" integer not null,
  "requirement_id" text not null,
  "file_name" text not null,
  "file_size" bigint not null,
  "sha256" text not null,
  "file_role" text not null,
  "state" text default 'pending'::text not null,
  "expires_at" timestamp with time zone default (now() + '02:00:00'::interval) not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."audit_logs" (
  "id" bigint default nextval('audit_logs_id_seq'::regclass) not null,
  "table_name" text not null,
  "record_id" text not null,
  "action" text not null,
  "old_data" jsonb,
  "new_data" jsonb,
  "changed_fields" text[],
  "actor_id" text default 'system'::text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."holidays" (
  "holiday_date" date not null,
  "name" text not null,
  "kind" text default 'le_tet'::text not null,
  "is_confirmed" boolean default false not null,
  "note" text
);

create table public."legal_assistant_logs" (
  "id" uuid default gen_random_uuid() not null,
  "actor_id" uuid not null,
  "question_hash" text not null,
  "result" jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."material_prices" (
  "id" text default (gen_random_uuid())::text not null,
  "code" text not null,
  "name" text not null,
  "unit" text not null,
  "standard_price" numeric(18,2) not null,
  "market_price" numeric(18,2) not null,
  "region" text not null,
  "period" text not null,
  "supplier" text,
  "province_code" text default 'DB'::text not null,
  "search_text" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "revision" integer default 1 not null
);

create table public."organizations" (
  "id" text default (gen_random_uuid())::text not null,
  "code" text not null,
  "name" text not null,
  "short_name" text,
  "type" text not null,
  "license_number" text,
  "tax_code" text,
  "issue_date" date,
  "address" text not null,
  "email" text,
  "phone" text,
  "legal_rep" text,
  "representative" text,
  "cert_number" text,
  "cert_grade" text,
  "cert_expiry" date,
  "cert_scope" text[] default '{}'::text[],
  "status" text default 'hieu_luc'::text,
  "active_projects_count" integer default 0,
  "metadata" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "search_text" text,
  "province_code" text,
  "revision" integer default 1 not null
);

create table public."personnel" (
  "id" text default (gen_random_uuid())::text not null,
  "code" text,
  "full_name" text not null,
  "id_card" text not null,
  "cert_number" text not null,
  "cert_authority" text not null,
  "cert_expiry" date not null,
  "cert_grade" text not null,
  "specialties" text[] default '{}'::text[] not null,
  "org_id" text,
  "org_name" text,
  "email" text,
  "phone" text,
  "status" text default 'hieu_luc'::text,
  "active_projects_count" integer default 0,
  "has_conflict_warning" boolean default false,
  "conflict_details" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "search_text" text,
  "province_code" text,
  "revision" integer default 1 not null
);

create table public."profiles" (
  "id" uuid not null,
  "full_name" text not null,
  "avatar_url" text,
  "email" text not null,
  "phone" text,
  "department" text,
  "role" text default 'officer'::text not null,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "province_id" text
);

create table public."project_documents" (
  "id" text default (gen_random_uuid())::text not null,
  "project_id" text not null,
  "category" text not null,
  "file_name" text not null,
  "file_size" bigint not null,
  "mime_type" text not null,
  "storage_path" text not null,
  "version" integer default 1,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone default now()
);

create table public."projects" (
  "id" text default (gen_random_uuid())::text not null,
  "code" text not null,
  "title" text not null,
  "field" text not null,
  "group_type" text not null,
  "grade" text not null,
  "investment_cost" numeric(18,2) not null,
  "investor_id" text,
  "investor_name" text,
  "designer_id" text,
  "designer_name" text,
  "auditor_id" text,
  "auditor_name" text,
  "lead_reviewer_id" text,
  "lead_reviewer_name" text,
  "procedure_type" text not null,
  "status" text default 'Tiếp nhận hồ sơ'::text not null,
  "sla_days" integer default 30,
  "sla_status" text default 'on_time'::text,
  "progress" integer default 0,
  "submission_date" date default CURRENT_DATE not null,
  "deadline" date,
  "location_district" text not null,
  "lat" numeric(10,6),
  "lng" numeric(10,6),
  "thumbnail_url" text,
  "description" text,
  "tt39_data" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "stage" text default 'bcnckt'::text not null,
  "investment_form" text default 'dau_tu_cong'::text not null,
  "department" text default 'Phòng Quản lý Xây dựng'::text not null,
  "lead_reviewer_staff_id" text,
  "planning_compliance" boolean,
  "standard_compliance" boolean,
  "fire_safety_status" text,
  "estimated_savings" numeric(18,2),
  "images" jsonb default '[]'::jsonb not null,
  "contractors" jsonb default '[]'::jsonb not null,
  "appraisal_data" jsonb default '{}'::jsonb not null,
  "province_code" text default 'DB'::text not null,
  "search_text" text,
  "workflow_state" text default 'tiep_nhan'::text not null,
  "received_date" date,
  "supplement_count" integer default 0 not null,
  "extension_count" integer default 0 not null,
  "paused_at" date,
  "is_appendix_iv" boolean default false not null,
  "decided_by_commune" boolean default false not null,
  "submitted_documents" jsonb default '[]'::jsonb not null,
  "images_revision" integer default 1 not null
);

create table public."schema_migrations" (
  "version" text not null,
  "applied_at" timestamp with time zone default now() not null
);

create table public."staff_users" (
  "id" text not null,
  "full_name" text not null,
  "title" text not null,
  "department" text not null,
  "role" text not null,
  "email" text,
  "phone" text,
  "province_code" text default 'DB'::text not null,
  "is_active" boolean default true not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "auth_user_id" uuid
);

create table public."workflow_transitions" (
  "id" bigint default nextval('workflow_transitions_id_seq'::regclass) not null,
  "project_id" text not null,
  "action" text not null,
  "from_state" text not null,
  "to_state" text not null,
  "note" text,
  "actor_id" text default 'system'::text not null,
  "created_at" timestamp with time zone default now() not null
);

alter sequence public."ai_logs_id_seq" owned by public."ai_logs"."id";

alter sequence public."workflow_transitions_id_seq" owned by public."workflow_transitions"."id";

alter sequence public."audit_logs_id_seq" owned by public."audit_logs"."id";

CREATE OR REPLACE FUNCTION public.add_working_days(p_start date, p_days integer)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    d date := p_start;
    remaining integer := p_days;
begin
    while remaining > 0 loop
        d := d + 1;
        if public.is_working_day(d) then
            remaining := remaining - 1;
        end if;
    end loop;
    return d;
end $function$;

CREATE OR REPLACE FUNCTION public.app_actor_scope()
 RETURNS TABLE(province_id text, department text, is_admin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.province_id, p.department, p.role = 'admin'
  from public.profiles p
  where p.id = auth.uid() and p.is_active is true
    and p.role in ('admin','director','head_of_department','officer')
$function$;

CREATE OR REPLACE FUNCTION public.app_has_scope(p_province text, p_department text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.is_active is true and p.province_id=p_province
    and p.role in ('admin','director','head_of_department','officer')
    and (p_department is null or p.department=p_department or p.role='admin'));
$function$;

CREATE OR REPLACE FUNCTION public.appraisal_has_scope(p_province text, p_department text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.app_has_scope(p_province,p_department);
$function$;

CREATE OR REPLACE FUNCTION public.appraisal_reviewers(case_id uuid)
 RETURNS TABLE(id uuid, full_name text, role text, department text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p.id,p.full_name,p.role,p.department from public.profiles p
 join public.appraisal_cases c on c.id=case_id
 where public.app_has_scope(c.province_id,c.department)
 and p.is_active and p.province_id=c.province_id and p.department=c.department
 and p.role in ('officer','head_of_department','director') order by p.full_name,p.id
$function$;

CREATE OR REPLACE FUNCTION public.appraisal_upload_access(object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.appraisal_upload_sessions u join public.appraisal_cases c on c.id=u.case_id
   where object_name=c.id::text||'/'||u.id::text and u.actor_id=auth.uid()
     and u.state='pending' and u.expires_at>now() and public.appraisal_has_scope(c.province_id,c.department));
$function$;

CREATE OR REPLACE FUNCTION public.catalog_can_write(province text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active
   and p.province_id=province and p.role in ('admin','head_of_department'))
$function$;

CREATE OR REPLACE FUNCTION public.claim_appraisal_job(worker_id text)
 RETURNS SETOF appraisal_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 return query update public.appraisal_jobs set state='running',attempts=attempts+1,
   lease_owner=worker_id,lease_until=now()+interval '3 minutes',updated_at=now()
   where id=(select id from public.appraisal_jobs where
     (state='queued' or (state='running' and lease_until<now())) and attempts<3
     order by created_at for update skip locked limit 1) returning *;
 update public.appraisal_jobs set state='failed',error_code='lease_exhausted',updated_at=now()
   where state='running' and lease_until<now() and attempts>=3;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_appraisal_project(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.profiles; investor public.organizations; result public.projects;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active is true;
 if actor.id is null or actor.role not in ('admin','head_of_department','officer')
   or coalesce(actor.province_id,'')='' or coalesce(actor.department,'')='' then
   raise exception 'Forbidden' using errcode='42501'; end if;
 if length(coalesce(input->>'title','')) not between 3 and 500
   or length(coalesce(input->>'code','')) not between 3 and 100
   or coalesce(input->>'group_type','') not in ('A','B','C','QG')
   or coalesce(input->>'grade','') not in ('I','II','III','IV','DB')
   or (input->>'investment_cost')::numeric<0 or input->>'investment_cost' is null then
   raise exception 'Invalid project' using errcode='22023'; end if;
 if nullif(input->>'investor_id','') is not null then
   select * into investor from public.organizations where id=input->>'investor_id' and province_code=actor.province_id;
   if investor.id is null then raise exception 'Invalid investor' using errcode='42501'; end if;
 end if;
 insert into public.projects(code,title,field,group_type,grade,investment_cost,investor_id,investor_name,
   location_district,province_code,department,stage,procedure_type,status,sla_status,workflow_state)
 values(input->>'code',input->>'title',input->>'field',input->>'group_type',input->>'grade',
   (input->>'investment_cost')::numeric,investor.id,investor.name,input->>'location',actor.province_id,
   actor.department,'bcnckt','BCNCKT','tiep_nhan','tiep_nhan','tiep_nhan') returning * into result;
 return to_jsonb(result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_by_investment_form(p_province text DEFAULT 'DB'::text)
 RETURNS TABLE(investment_form text, project_count bigint, total_investment numeric)
 LANGUAGE sql
 STABLE
AS $function$
    select investment_form, count(*), coalesce(sum(investment_cost), 0)
    from public.projects
    where province_code = p_province
    group by investment_form
    order by count(*) desc
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_monthly(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer, p_province text DEFAULT 'DB'::text)
 RETURNS TABLE(month_no integer, received bigint, completed bigint, on_time_rate numeric, investment_billion numeric)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_summary(p_province text DEFAULT 'DB'::text)
 RETURNS TABLE(total_projects bigint, active_appraisals bigint, overdue_count bigint, completed_count bigint, supplement_count bigint, on_time_rate numeric, total_investment numeric, total_savings numeric, approaching_deadline_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.derive_sla_status(p_state text, p_deadline date)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
    select case
        when p_state = 'tiep_nhan' then 'tiep_nhan'
        when p_state = 'yeu_cau_bo_sung' then 'yeu_cau_bo_sung'
        when p_state = 'da_phat_hanh' then 'da_tham_dinh'
        when p_state = 'tra_ho_so' then 'tra_ho_so'
        when p_deadline < current_date then 'qua_han'
        else 'dang_tham_dinh'
    end
$function$;

CREATE OR REPLACE FUNCTION public.f_search_text(VARIADIC parts text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    select lower(public.f_unaccent(concat_ws(' ', variadic parts)))
$function$;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$ select replace(replace(extensions.unaccent('extensions.unaccent'::regdictionary, $1), 'đ', 'd'), 'Đ', 'D') $function$;

CREATE OR REPLACE FUNCTION public.finish_appraisal_job(job_id uuid, worker_id text, new_state text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new_state not in ('completed','failed','stale','cancelled') then
   raise exception 'Invalid job state'; end if;
 update public.appraisal_jobs set state=new_state,lease_until=null,updated_at=now()
   where id=job_id and lease_owner=worker_id and state='running';
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_working_day(p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    select extract(isodow from p_date) < 6
       and not exists (select 1 from public.holidays h where h.holiday_date = p_date and h.kind <> 'lam_bu')
$function$;

CREATE OR REPLACE FUNCTION public.persist_appraisal_case(case_id uuid, expected_revision integer, new_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.profiles; previous public.appraisal_cases; linked public.projects;
  old_events integer:=0; event jsonb; next_payload jsonb:=new_payload; job jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active is true;
 if actor.id is null or actor.role not in ('officer','head_of_department','director','admin') then
   raise exception 'Forbidden' using errcode='42501'; end if;
 if new_payload->>'id' is distinct from case_id::text
   or new_payload->>'tenantId' is distinct from actor.province_id
   or not public.app_has_scope(actor.province_id,new_payload->>'department')
   or coalesce(new_payload->>'department','')='' then
   raise exception 'Scope mismatch' using errcode='42501'; end if;
 if jsonb_typeof(new_payload->'audit') is distinct from 'array'
   or jsonb_typeof(new_payload->'runs') is distinct from 'array'
   or jsonb_typeof(new_payload->'documents') is distinct from 'array'
   or jsonb_typeof(new_payload->'requirements') is distinct from 'array'
   or new_payload->>'procedure' not in ('bcnckt','gpxd','nghiem_thu')
   or new_payload->>'revision' is null then
   raise exception 'Invalid payload' using errcode='22023'; end if;
 if new_payload->>'projectId' is not null then
   select * into linked from public.projects where id=new_payload->>'projectId';
   if linked.id is null or linked.province_code is distinct from actor.province_id
     or linked.department is distinct from new_payload->>'department'
     or not public.app_has_scope(linked.province_code,linked.department) then
     raise exception 'Invalid project scope' using errcode='42501'; end if;
   next_payload:=next_payload || jsonb_build_object('projectName',linked.title,'projectCode',linked.code);
 elsif coalesce((new_payload->>'sample')::boolean,false) is not true then
   raise exception 'Project required' using errcode='22023';
 end if;
 if expected_revision is null then
   if (new_payload->>'revision')::integer<>1
      or coalesce(new_payload->'finalReview','null'::jsonb)<>'null'::jsonb then
      raise exception 'Invalid initial state' using errcode='22023'; end if;
 else
   select * into previous from public.appraisal_cases where id=case_id for update;
   if previous.id is null or not public.app_has_scope(previous.province_id,previous.department) then
     raise exception 'Forbidden' using errcode='42501'; end if;
   if previous.revision<>expected_revision or (new_payload->>'revision')::integer<>expected_revision+1 then
     raise exception 'Revision conflict' using errcode='40001'; end if;
   if previous.payload->'finalReview' is distinct from new_payload->'finalReview'
      and actor.role not in ('head_of_department','director')
      and (coalesce(previous.payload->'finalReview','null'::jsonb)<>'null'::jsonb
        or coalesce(new_payload->'finalReview','null'::jsonb)<>'null'::jsonb) then
     raise exception 'Leadership review required' using errcode='42501'; end if;
   old_events:=jsonb_array_length(previous.payload->'audit');
   if exists(select 1 from jsonb_array_elements(previous.payload->'audit') with ordinality e(value,n)
      where new_payload->'audit'->((e.n-1)::integer) is distinct from e.value) then
     raise exception 'Immutable audit history' using errcode='42501'; end if;
 end if;
 if jsonb_array_length(new_payload->'audit')<>old_events+1 then
   raise exception 'Exactly one server audit event is required' using errcode='22023'; end if;
 event:=(new_payload->'audit'->old_events) || jsonb_build_object('actor',actor.full_name,'at',now());
 next_payload:=jsonb_set(next_payload,array['audit',old_events::text],event);
 if expected_revision is null then
   insert into public.appraisal_cases(id,province_id,department,revision,payload,project_id,procedure)
    values(case_id,actor.province_id,next_payload->>'department',1,next_payload,
      next_payload->>'projectId',coalesce(next_payload->>'procedure','bcnckt'));
 else
   update public.appraisal_cases set payload=next_payload,revision=(next_payload->>'revision')::integer,
     project_id=next_payload->>'projectId',department=next_payload->>'department',updated_at=now()
     where id=case_id;
 end if;
 select payload into next_payload from public.appraisal_cases where id=case_id;
 insert into public.appraisal_audit_logs(case_id,actor_id,actor_name,revision,event)
   values(case_id,actor.id,actor.full_name,(next_payload->>'revision')::integer,event);
 insert into public.appraisal_ai_logs(case_id,actor_id,run_id,run)
   select case_id,actor.id,r->>'id',r from jsonb_array_elements(next_payload->'runs') r
   on conflict do nothing;
 job:=next_payload->'job';
 if job->>'status'='running' and job->>'id' is distinct from previous.payload->'job'->>'id' then
   insert into public.appraisal_jobs(id,case_id,actor_id,snapshot)
     values((job->>'id')::uuid,case_id,actor.id,next_payload) on conflict do nothing;
 elsif job->>'status' in ('completed','failed','cancelled') then
   update public.appraisal_jobs set state=job->>'status',updated_at=now(),lease_until=null
     where id=(job->>'id')::uuid and appraisal_jobs.case_id=persist_appraisal_case.case_id;
 end if;
 return next_payload;
end;
$function$;

CREATE OR REPLACE FUNCTION public.project_image_access(project_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.projects p where p.id=project_id and public.app_has_scope(p.province_code,p.department));
$function$;

CREATE OR REPLACE FUNCTION public.read_appraisal_job(job_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('status',j.state,'attempts',j.attempts,'errorCode',j.error_code)
 from public.appraisal_jobs j join public.appraisal_cases c on c.id=j.case_id
 where j.id=job_id and public.appraisal_has_scope(c.province_id,c.department);
$function$;

CREATE OR REPLACE FUNCTION public.refresh_sla_status()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    affected integer;
begin
    perform set_config('app.skip_audit', 'on', true);
    update public.projects
    set sla_status = public.derive_sla_status(workflow_state, deadline)
    where sla_status is distinct from public.derive_sla_status(workflow_state, deadline);
    get diagnostics affected = row_count;
    return affected;
end $function$;

CREATE OR REPLACE FUNCTION public.renew_appraisal_job(job_id uuid, worker_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.appraisal_jobs set lease_until=now()+interval '3 minutes',updated_at=now()
   where id=job_id and lease_owner=worker_id and state='running';
 return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_appraisal_case(case_id uuid, expected_revision integer, new_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor public.profiles%rowtype;
  previous public.appraisal_cases%rowtype;
  next_revision integer;
  old_events integer:=0;
  event jsonb;
  item jsonb;
begin
  select * into actor from public.profiles where id=auth.uid() and is_active;
  if actor.id is null or actor.province_id is null or actor.department is null
    or actor.role not in ('officer','head_of_department','director','admin') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if new_payload->>'id'<>case_id::text or new_payload->>'tenantId'<>actor.province_id
    or new_payload->>'department'<>actor.department then
    raise exception 'Scope mismatch' using errcode='42501';
  end if;
  if jsonb_typeof(new_payload->'audit')<>'array' or jsonb_typeof(new_payload->'runs')<>'array' then
    raise exception 'Invalid payload' using errcode='22023';
  end if;
  next_revision:=(new_payload->>'revision')::integer;
  if expected_revision is null then
    if next_revision<>1 or coalesce(new_payload->'finalReview','null'::jsonb)<>'null'::jsonb then
      raise exception 'Invalid initial revision' using errcode='22023';
    end if;
    insert into public.appraisal_cases(id,province_id,department,revision,payload)
      values(case_id,actor.province_id,actor.department,1,new_payload);
  else
    select * into previous from public.appraisal_cases where id=case_id for update;
    if previous.id is null or previous.province_id<>actor.province_id or previous.department<>actor.department then
      raise exception 'Forbidden' using errcode='42501';
    end if;
    if previous.revision<>expected_revision or next_revision<>expected_revision+1 then
      raise exception 'Revision conflict' using errcode='40001';
    end if;
    old_events:=jsonb_array_length(previous.payload->'audit');
    if jsonb_array_length(new_payload->'audit')<old_events or exists(
      select 1 from jsonb_array_elements(previous.payload->'audit') with ordinality e(value,n)
      where new_payload->'audit'->((e.n-1)::integer) is distinct from e.value) then
      raise exception 'Audit history is immutable' using errcode='42501';
    end if;
    if new_payload->'finalReview' is distinct from previous.payload->'finalReview'
      and coalesce(new_payload->'finalReview','null'::jsonb)<>'null'::jsonb
      and actor.role not in ('head_of_department','director','admin') then
      raise exception 'Leadership role required' using errcode='42501';
    end if;
    update public.appraisal_cases set payload=new_payload,revision=next_revision,updated_at=now() where id=case_id;
  end if;
  for event in select value from jsonb_array_elements(new_payload->'audit') with ordinality e(value,n) where n>old_events loop
    insert into public.appraisal_audit_logs(case_id,actor_id,actor_name,revision,event)
      values(case_id,actor.id,actor.full_name,next_revision,event);
  end loop;
  for item in select value from jsonb_array_elements(new_payload->'runs') loop
    insert into public.appraisal_ai_logs(case_id,actor_id,run_id,run)
      values(case_id,actor.id,item->>'id',item) on conflict do nothing;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_project_images(project_id text, expected integer, new_images jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.profiles; result public.projects;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active;
 if actor.id is null or actor.role not in ('admin','head_of_department','officer') then
  raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(new_images)<>'array' or jsonb_array_length(new_images)>200 then
  raise exception 'Invalid gallery' using errcode='22023'; end if;
 update public.projects p set images=new_images,images_revision=images_revision+1
 where p.id=project_id and p.images_revision=expected and public.app_has_scope(p.province_code,p.department)
 returning * into result;
 if result.id is null then raise exception 'Gallery changed or forbidden' using errcode='40001'; end if;
 return jsonb_build_object('images',result.images,'revision',result.images_revision);
end; $function$;

CREATE OR REPLACE FUNCTION public.sync_appraisal_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prior public.appraisal_cases; predecessor uuid;
begin
 predecessor:=nullif(NEW.payload->>'previousSubmissionId','')::uuid;
 if TG_OP='INSERT' then
   if predecessor is not null then
     select * into prior from public.appraisal_cases where id=predecessor for update;
     if prior.id is null or not public.app_has_scope(prior.province_id,prior.department)
       or prior.project_id is distinct from NEW.project_id or prior.procedure<>NEW.procedure
       or prior.province_id<>NEW.province_id or prior.department<>NEW.department
       or coalesce((prior.payload->>'sample')::boolean,false) is distinct from coalesce((NEW.payload->>'sample')::boolean,false) then
       raise exception 'Invalid predecessor scope' using errcode='42501'; end if;
     if (NEW.payload->>'previousRevision')::integer is distinct from prior.revision
       or exists(select 1 from public.appraisal_cases where previous_submission_id=prior.id) then
       raise exception 'Predecessor has changed or already has a successor' using errcode='40001'; end if;
     NEW.dossier_id:=prior.dossier_id;NEW.submission_round:=prior.submission_round+1;
   else
     NEW.dossier_id:=NEW.id;NEW.submission_round:=1;
     insert into public.appraisal_dossiers(id,project_id,province_id,department,procedure,name)
       values(NEW.id,NEW.project_id,NEW.province_id,NEW.department,NEW.procedure,NEW.payload->>'name');
   end if;
   NEW.previous_submission_id:=predecessor;
 else
   if exists(select 1 from public.appraisal_cases where previous_submission_id=OLD.id) then
     raise exception 'Previous submission is read-only' using errcode='40001'; end if;
   if predecessor is distinct from OLD.previous_submission_id or NEW.procedure<>OLD.procedure
     or NEW.payload->>'procedure' is distinct from OLD.procedure
     or (NEW.payload->>'dossierId')::uuid is distinct from OLD.dossier_id
     or (NEW.payload->>'submissionRound')::integer is distinct from OLD.submission_round then
     raise exception 'Immutable submission lineage' using errcode='42501'; end if;
   if NEW.project_id is distinct from OLD.project_id or NEW.department<>OLD.department then
     if OLD.previous_submission_id is not null or exists(select 1 from public.appraisal_cases where previous_submission_id=OLD.id) then
       raise exception 'Cannot move a submission chain' using errcode='22023'; end if;
     update public.appraisal_dossiers set project_id=NEW.project_id,department=NEW.department where id=NEW.dossier_id;
   end if;
 end if;
 NEW.payload:=NEW.payload||jsonb_build_object('dossierId',NEW.dossier_id,'submissionRound',NEW.submission_round,
  'previousSubmissionId',NEW.previous_submission_id,'previousSubmissionName',(select payload->>'name' from public.appraisal_cases where id=NEW.previous_submission_id));
 return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare before_data jsonb; after_data jsonb; actor text; fields text[];
begin
 select s.id into actor from public.staff_users s where s.auth_user_id=auth.uid() and s.is_active;
 if auth.uid() is not null and actor is null then raise exception 'Unknown audit actor' using errcode='42501'; end if;
 before_data:=case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
 after_data:=case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
 select array_agg(key) into fields from jsonb_each(coalesce(after_data,before_data))
   where before_data->key is distinct from after_data->key;
 insert into public.audit_logs(table_name,record_id,action,old_data,new_data,changed_fields,actor_id)
   values(TG_TABLE_NAME,coalesce(after_data,before_data)->>'id',lower(TG_OP),before_data,after_data,fields,coalesce(actor,'migration'));
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_material_prices_search_text()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.search_text := public.f_search_text(new.code, new.name, new.region, new.supplier);
    return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tg_organizations_search_text()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.search_text := public.f_search_text(
        new.code, new.name, new.short_name, new.tax_code, new.address, new.legal_rep, new.cert_number
    );
    return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tg_personnel_search_text()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.search_text := public.f_search_text(
        new.code, new.full_name, new.cert_number, new.org_name, array_to_string(new.specialties, ' ')
    );
    return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tg_projects_search_text()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.search_text := public.f_search_text(
        new.code, new.title, new.investor_name, new.location_district, new.lead_reviewer_name, new.field
    );
    return new;
end $function$;

CREATE OR REPLACE FUNCTION public.transition_dossier(p_project_id text, p_action text, p_note text DEFAULT NULL::text, p_deadline date DEFAULT NULL::date, p_assignee_staff_id text DEFAULT NULL::text)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_project public.projects;
    v_actor text;
    v_role text;
    v_headers jsonb;
    v_to text;
    v_from text;
    v_allowed_from text[];
    v_allowed_roles text[];
    v_assignee public.staff_users;
begin
    begin
        v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
        v_headers := null;
    end;
    v_actor := coalesce(v_headers ->> 'x-actor-id', 'system');
    select role into v_role from public.staff_users where id = v_actor;

    select * into v_project from public.projects where id = p_project_id for update;
    if not found then
        raise exception 'Không tìm thấy hồ sơ %', p_project_id;
    end if;
    v_from := v_project.workflow_state;

    case p_action
        when 'xac_nhan_hop_le' then v_allowed_from := array['tiep_nhan']; v_to := 'dang_tham_dinh'; v_allowed_roles := array['officer', 'head_of_department'];
        when 'yeu_cau_bo_sung' then v_allowed_from := array['tiep_nhan', 'dang_tham_dinh']; v_to := 'yeu_cau_bo_sung'; v_allowed_roles := array['officer', 'head_of_department'];
        when 'nhan_bo_sung' then v_allowed_from := array['yeu_cau_bo_sung']; v_to := 'dang_tham_dinh'; v_allowed_roles := array['officer', 'head_of_department'];
        when 'trinh_truong_phong' then v_allowed_from := array['dang_tham_dinh']; v_to := 'cho_truong_phong'; v_allowed_roles := array['officer'];
        when 'tra_lai_chuyen_vien' then v_allowed_from := array['cho_truong_phong']; v_to := 'dang_tham_dinh'; v_allowed_roles := array['head_of_department'];
        when 'trinh_lanh_dao' then v_allowed_from := array['cho_truong_phong']; v_to := 'cho_lanh_dao'; v_allowed_roles := array['head_of_department'];
        when 'tra_lai_truong_phong' then v_allowed_from := array['cho_lanh_dao']; v_to := 'cho_truong_phong'; v_allowed_roles := array['director'];
        when 'ky_phat_hanh' then v_allowed_from := array['cho_lanh_dao']; v_to := 'da_phat_hanh'; v_allowed_roles := array['director'];
        when 'tra_ho_so' then v_allowed_from := array['tiep_nhan', 'yeu_cau_bo_sung']; v_to := 'tra_ho_so'; v_allowed_roles := array['officer', 'head_of_department', 'director'];
        when 'gia_han' then v_allowed_from := array['dang_tham_dinh', 'cho_truong_phong', 'cho_lanh_dao']; v_to := v_project.workflow_state; v_allowed_roles := array['head_of_department', 'director'];
        when 'phan_cong' then v_allowed_from := array['tiep_nhan', 'yeu_cau_bo_sung', 'dang_tham_dinh', 'cho_truong_phong']; v_to := v_project.workflow_state; v_allowed_roles := array['head_of_department', 'director'];
        else raise exception 'Thao tác không hợp lệ: %', p_action;
    end case;

    if not (v_project.workflow_state = any (v_allowed_from)) then
        raise exception 'Không thể thực hiện "%" khi hồ sơ đang ở bước "%"', p_action, v_project.workflow_state;
    end if;
    if coalesce(v_role, '') <> 'admin' and not (coalesce(v_role, '') = any (v_allowed_roles)) then
        raise exception 'Vai trò hiện tại không được phép thực hiện thao tác này';
    end if;

    if p_action = 'yeu_cau_bo_sung' and v_project.supplement_count >= 1 then
        raise exception 'Theo Điều 36 NĐ 217/2026/NĐ-CP, cơ quan thẩm định chỉ được yêu cầu bổ sung hồ sơ 01 lần';
    end if;
    if p_action = 'gia_han' and v_project.extension_count >= 1 then
        raise exception 'Hồ sơ đã được gia hạn 01 lần — không được gia hạn thêm';
    end if;
    if p_action in ('xac_nhan_hop_le', 'nhan_bo_sung', 'gia_han') and p_deadline is null then
        raise exception 'Thiếu hạn trả kết quả mới cho thao tác "%"', p_action;
    end if;
    if p_action in ('yeu_cau_bo_sung', 'tra_ho_so', 'tra_lai_chuyen_vien', 'tra_lai_truong_phong', 'gia_han') and coalesce(trim(p_note), '') = '' then
        raise exception 'Vui lòng nhập lý do / nội dung cho thao tác này';
    end if;

    if p_action = 'phan_cong' then
        select * into v_assignee from public.staff_users where id = p_assignee_staff_id and role = 'officer';
        if not found then
            raise exception 'Cán bộ được phân công không hợp lệ';
        end if;
    end if;

    update public.projects set
        workflow_state = v_to,
        received_date = case when p_action in ('xac_nhan_hop_le', 'nhan_bo_sung') then current_date else received_date end,
        deadline = coalesce(p_deadline, deadline),
        supplement_count = supplement_count + case when p_action = 'yeu_cau_bo_sung' then 1 else 0 end,
        extension_count = extension_count + case when p_action = 'gia_han' then 1 else 0 end,
        paused_at = case when p_action = 'yeu_cau_bo_sung' then current_date when p_action = 'nhan_bo_sung' then null else paused_at end,
        lead_reviewer_staff_id = case when p_action = 'phan_cong' then v_assignee.id else lead_reviewer_staff_id end,
        lead_reviewer_name = case when p_action = 'phan_cong' then v_assignee.full_name else lead_reviewer_name end,
        department = case when p_action = 'phan_cong' then v_assignee.department else department end,
        sla_status = public.derive_sla_status(v_to, coalesce(p_deadline, deadline)),
        status = public.derive_sla_status(v_to, coalesce(p_deadline, deadline))
    where id = p_project_id
    returning * into v_project;

    insert into public.workflow_transitions (project_id, action, from_state, to_state, note, actor_id)
    values (p_project_id, p_action, v_from, v_to, p_note, v_actor);

    return v_project;
end $function$;

CREATE OR REPLACE FUNCTION public.working_days_between(p_from date, p_to date)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
    select case
        when p_to = p_from then 0
        when p_to > p_from then (select count(*)::int from generate_series(p_from + 1, p_to, interval '1 day') g(d) where public.is_working_day(g.d::date))
        else -(select count(*)::int from generate_series(p_to + 1, p_from, interval '1 day') g(d) where public.is_working_day(g.d::date))
    end
$function$;

alter table profiles add constraint "profiles_email_key" UNIQUE (email);

alter table profiles add constraint "profiles_pkey" PRIMARY KEY (id);

alter table profiles add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'director'::text, 'head_of_department'::text, 'officer'::text, 'external_consultant'::text, 'investor'::text])));

alter table organizations add constraint "organizations_cert_grade_check" CHECK ((cert_grade = ANY (ARRAY['I'::text, 'II'::text, 'III'::text, 'Chưa xếp hạng'::text])));

alter table organizations add constraint "organizations_code_key" UNIQUE (code);

alter table organizations add constraint "organizations_pkey" PRIMARY KEY (id);

alter table organizations add constraint "organizations_status_check" CHECK ((status = ANY (ARRAY['hieu_luc'::text, 'sap_het_han'::text, 'het_han'::text, 'tam_dung'::text, 'active'::text, 'suspended'::text])));

alter table organizations add constraint "organizations_type_check" CHECK ((type = ANY (ARRAY['investor'::text, 'consultant_design'::text, 'consultant_audit'::text, 'contractor'::text, 'supervisor'::text])));

alter table personnel add constraint "personnel_cert_grade_check" CHECK ((cert_grade = ANY (ARRAY['I'::text, 'II'::text, 'III'::text])));

alter table personnel add constraint "personnel_cert_number_key" UNIQUE (cert_number);

alter table personnel add constraint "personnel_id_card_key" UNIQUE (id_card);

alter table personnel add constraint "personnel_pkey" PRIMARY KEY (id);

alter table personnel add constraint "personnel_status_check" CHECK ((status = ANY (ARRAY['hieu_luc'::text, 'sap_het_han'::text, 'het_han'::text, 'thu_hoi'::text])));

alter table projects add constraint "projects_code_key" UNIQUE (code);

alter table projects add constraint "projects_fire_safety_status_check" CHECK ((fire_safety_status = ANY (ARRAY['dat'::text, 'can_bo_sung'::text, 'cho_y_kien_ca'::text])));

alter table projects add constraint "projects_investment_cost_check" CHECK ((investment_cost >= (0)::numeric));

alter table projects add constraint "projects_investment_form_check" CHECK ((investment_form = ANY (ARRAY['dau_tu_cong'::text, 'ppp'::text, 'kinh_doanh'::text, 'khac'::text])));

alter table projects add constraint "projects_pkey" PRIMARY KEY (id);

alter table projects add constraint "projects_progress_check" CHECK (((progress >= 0) AND (progress <= 100)));

alter table projects add constraint "projects_sla_status_check" CHECK ((sla_status = ANY (ARRAY['tiep_nhan'::text, 'dang_tham_dinh'::text, 'yeu_cau_bo_sung'::text, 'da_tham_dinh'::text, 'qua_han'::text, 'tra_ho_so'::text])));

alter table projects add constraint "projects_stage_check" CHECK ((stage = ANY (ARRAY['bcnckt'::text, 'gpxd'::text, 'nghiem_thu'::text, 'hoan_thanh'::text])));

alter table projects add constraint "projects_workflow_state_check" CHECK ((workflow_state = ANY (ARRAY['tiep_nhan'::text, 'yeu_cau_bo_sung'::text, 'dang_tham_dinh'::text, 'cho_truong_phong'::text, 'cho_lanh_dao'::text, 'da_phat_hanh'::text, 'tra_ho_so'::text])));

alter table appraisal_disciplines add constraint "appraisal_disciplines_discipline_code_check" CHECK ((discipline_code = ANY (ARRAY['ARCH'::text, 'STRUCT'::text, 'MEP'::text, 'FIRE'::text, 'COST'::text, 'ENV'::text])));

alter table appraisal_disciplines add constraint "appraisal_disciplines_pkey" PRIMARY KEY (id);

alter table appraisal_disciplines add constraint "appraisal_disciplines_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'approved'::text, 'revision_required'::text])));

alter table appraisal_checklists add constraint "appraisal_checklists_compliance_status_check" CHECK ((compliance_status = ANY (ARRAY['compliant'::text, 'non_compliant'::text, 'not_applicable'::text, 'not_evaluated'::text])));

alter table appraisal_checklists add constraint "appraisal_checklists_pkey" PRIMARY KEY (id);

alter table ai_compliance_alerts add constraint "ai_compliance_alerts_pkey" PRIMARY KEY (id);

alter table ai_compliance_alerts add constraint "ai_compliance_alerts_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])));

alter table project_documents add constraint "project_documents_category_check" CHECK ((category = ANY (ARRAY['drawing'::text, 'bim'::text, 'estimate'::text, 'legal'::text, 'report'::text, 'other'::text])));

alter table project_documents add constraint "project_documents_pkey" PRIMARY KEY (id);

alter table schema_migrations add constraint "schema_migrations_pkey" PRIMARY KEY (version);

alter table staff_users add constraint "staff_users_auth_user_id_key" UNIQUE (auth_user_id);

alter table staff_users add constraint "staff_users_pkey" PRIMARY KEY (id);

alter table staff_users add constraint "staff_users_role_check" CHECK ((role = ANY (ARRAY['officer'::text, 'head_of_department'::text, 'director'::text, 'admin'::text])));

alter table material_prices add constraint "material_prices_code_key" UNIQUE (code);

alter table material_prices add constraint "material_prices_market_price_check" CHECK ((market_price >= (0)::numeric));

alter table material_prices add constraint "material_prices_pkey" PRIMARY KEY (id);

alter table material_prices add constraint "material_prices_standard_price_check" CHECK ((standard_price >= (0)::numeric));

alter table holidays add constraint "holidays_kind_check" CHECK ((kind = ANY (ARRAY['le_tet'::text, 'nghi_bu'::text, 'lam_bu'::text])));

alter table holidays add constraint "holidays_pkey" PRIMARY KEY (holiday_date);

alter table audit_logs add constraint "audit_logs_action_check" CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])));

alter table audit_logs add constraint "audit_logs_pkey" PRIMARY KEY (id);

alter table ai_logs add constraint "ai_logs_feature_check" CHECK ((feature = ANY (ARRAY['legal_qa'::text, 'compliance_check'::text, 'cost_check'::text, 'document_draft'::text, 'completeness_check'::text])));

alter table ai_logs add constraint "ai_logs_officer_decision_check" CHECK ((officer_decision = ANY (ARRAY['accepted'::text, 'rejected'::text, 'edited'::text])));

alter table ai_logs add constraint "ai_logs_pkey" PRIMARY KEY (id);

alter table workflow_transitions add constraint "workflow_transitions_pkey" PRIMARY KEY (id);

alter table appraisal_cases add constraint "appraisal_cases_pkey" PRIMARY KEY (id);

alter table appraisal_cases add constraint "appraisal_cases_procedure_check" CHECK ((procedure = ANY (ARRAY['bcnckt'::text, 'gpxd'::text, 'nghiem_thu'::text])));

alter table appraisal_cases add constraint "appraisal_cases_revision_check" CHECK ((revision > 0));

alter table appraisal_cases add constraint "appraisal_cases_submission_round_check" CHECK ((submission_round > 0));

alter table appraisal_audit_logs add constraint "appraisal_audit_logs_pkey" PRIMARY KEY (id);

alter table appraisal_ai_logs add constraint "appraisal_ai_logs_case_id_run_id_key" UNIQUE (case_id, run_id);

alter table appraisal_ai_logs add constraint "appraisal_ai_logs_pkey" PRIMARY KEY (id);

alter table appraisal_jobs add constraint "appraisal_jobs_pkey" PRIMARY KEY (id);

alter table appraisal_jobs add constraint "appraisal_jobs_state_check" CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'stale'::text])));

alter table appraisal_upload_sessions add constraint "appraisal_upload_sessions_file_role_check" CHECK ((file_role = ANY (ARRAY['submission'::text, 'reference'::text])));

alter table appraisal_upload_sessions add constraint "appraisal_upload_sessions_file_size_check" CHECK (((file_size >= 1) AND (file_size <= 18874368)));

alter table appraisal_upload_sessions add constraint "appraisal_upload_sessions_pkey" PRIMARY KEY (id);

alter table appraisal_upload_sessions add constraint "appraisal_upload_sessions_sha256_check" CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text));

alter table appraisal_upload_sessions add constraint "appraisal_upload_sessions_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'completed'::text, 'expired'::text])));

alter table appraisal_dossiers add constraint "appraisal_dossiers_pkey" PRIMARY KEY (id);

alter table appraisal_dossiers add constraint "appraisal_dossiers_procedure_check" CHECK ((procedure = ANY (ARRAY['bcnckt'::text, 'gpxd'::text, 'nghiem_thu'::text])));

alter table legal_assistant_logs add constraint "legal_assistant_logs_pkey" PRIMARY KEY (id);

alter table profiles add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table personnel add constraint "personnel_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table projects add constraint "projects_auditor_id_fkey" FOREIGN KEY (auditor_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table projects add constraint "projects_designer_id_fkey" FOREIGN KEY (designer_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table projects add constraint "projects_investor_id_fkey" FOREIGN KEY (investor_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table projects add constraint "projects_lead_reviewer_id_fkey" FOREIGN KEY (lead_reviewer_id) REFERENCES personnel(id) ON DELETE SET NULL;

alter table projects add constraint "projects_lead_reviewer_staff_id_fkey" FOREIGN KEY (lead_reviewer_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL;

alter table appraisal_disciplines add constraint "appraisal_disciplines_assigned_reviewer_id_fkey" FOREIGN KEY (assigned_reviewer_id) REFERENCES personnel(id) ON DELETE SET NULL;

alter table appraisal_disciplines add constraint "appraisal_disciplines_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

alter table appraisal_checklists add constraint "appraisal_checklists_discipline_id_fkey" FOREIGN KEY (discipline_id) REFERENCES appraisal_disciplines(id) ON DELETE CASCADE;

alter table ai_compliance_alerts add constraint "ai_compliance_alerts_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table ai_compliance_alerts add constraint "ai_compliance_alerts_target_personnel_id_fkey" FOREIGN KEY (target_personnel_id) REFERENCES personnel(id) ON DELETE SET NULL;

alter table ai_compliance_alerts add constraint "ai_compliance_alerts_target_project_id_fkey" FOREIGN KEY (target_project_id) REFERENCES projects(id) ON DELETE CASCADE;

alter table project_documents add constraint "project_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

alter table project_documents add constraint "project_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table staff_users add constraint "staff_users_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES profiles(id);

alter table ai_logs add constraint "ai_logs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

alter table workflow_transitions add constraint "workflow_transitions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

alter table appraisal_cases add constraint "appraisal_cases_dossier_id_fkey" FOREIGN KEY (dossier_id) REFERENCES appraisal_dossiers(id);

alter table appraisal_cases add constraint "appraisal_cases_previous_submission_id_fkey" FOREIGN KEY (previous_submission_id) REFERENCES appraisal_cases(id);

alter table appraisal_cases add constraint "appraisal_cases_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

alter table appraisal_audit_logs add constraint "appraisal_audit_logs_case_id_fkey" FOREIGN KEY (case_id) REFERENCES appraisal_cases(id);

alter table appraisal_ai_logs add constraint "appraisal_ai_logs_case_id_fkey" FOREIGN KEY (case_id) REFERENCES appraisal_cases(id);

alter table appraisal_jobs add constraint "appraisal_jobs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);

alter table appraisal_jobs add constraint "appraisal_jobs_case_id_fkey" FOREIGN KEY (case_id) REFERENCES appraisal_cases(id);

alter table appraisal_upload_sessions add constraint "appraisal_upload_sessions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);

alter table appraisal_upload_sessions add constraint "appraisal_upload_sessions_case_id_fkey" FOREIGN KEY (case_id) REFERENCES appraisal_cases(id);

alter table appraisal_dossiers add constraint "appraisal_dossiers_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

alter table legal_assistant_logs add constraint "legal_assistant_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id);

CREATE INDEX appraisal_cases_scope ON public.appraisal_cases USING btree (province_id, department, created_at DESC);

CREATE UNIQUE INDEX appraisal_dossier_round_unique ON public.appraisal_cases USING btree (dossier_id, submission_round);

CREATE INDEX appraisal_jobs_claim ON public.appraisal_jobs USING btree (state, lease_until, created_at);

CREATE UNIQUE INDEX appraisal_previous_unique ON public.appraisal_cases USING btree (previous_submission_id) WHERE (previous_submission_id IS NOT NULL);

CREATE INDEX appraisal_project_page ON public.appraisal_cases USING btree (province_id, project_id, procedure, created_at DESC, id);

CREATE INDEX appraisal_status_page ON public.appraisal_cases USING btree (province_id, department, ((payload ->> 'status'::text)), created_at DESC, id);

CREATE INDEX appraisal_sla_due_page ON public.appraisal_cases USING btree (province_id, department, ((payload -> 'sla'::text) ->> 'dueDate'::text), id);

CREATE INDEX idx_ai_logs_project ON public.ai_logs USING btree (project_id, created_at DESC);

CREATE INDEX idx_alerts_personnel ON public.ai_compliance_alerts USING btree (target_personnel_id);

CREATE INDEX idx_alerts_project ON public.ai_compliance_alerts USING btree (target_project_id);

CREATE INDEX idx_alerts_resolved ON public.ai_compliance_alerts USING btree (is_resolved);

CREATE INDEX idx_audit_logs_record ON public.audit_logs USING btree (table_name, record_id, created_at DESC);

CREATE INDEX idx_disciplines_project ON public.appraisal_disciplines USING btree (project_id);

CREATE INDEX idx_docs_project ON public.project_documents USING btree (project_id);

CREATE INDEX idx_org_code ON public.organizations USING btree (code);

CREATE INDEX idx_org_type ON public.organizations USING btree (type);

CREATE INDEX idx_personnel_cert_num ON public.personnel USING btree (cert_number);

CREATE INDEX idx_personnel_id_card ON public.personnel USING btree (id_card);

CREATE INDEX idx_personnel_org ON public.personnel USING btree (org_id);

CREATE INDEX idx_personnel_status ON public.personnel USING btree (status);

CREATE INDEX idx_projects_deadline ON public.projects USING btree (deadline);

CREATE INDEX idx_projects_field ON public.projects USING btree (field);

CREATE INDEX idx_projects_group ON public.projects USING btree (group_type);

CREATE INDEX idx_projects_investor ON public.projects USING btree (investor_id);

CREATE INDEX idx_projects_province ON public.projects USING btree (province_code);

CREATE INDEX idx_projects_sla_status ON public.projects USING btree (sla_status);

CREATE INDEX idx_projects_stage ON public.projects USING btree (stage);

CREATE INDEX idx_projects_status ON public.projects USING btree (status);

CREATE INDEX idx_projects_submission ON public.projects USING btree (submission_date);

CREATE INDEX idx_projects_workflow ON public.projects USING btree (workflow_state);

CREATE INDEX idx_workflow_transitions_project ON public.workflow_transitions USING btree (project_id, created_at DESC);

create view public."workflow_transitions_resolved" with (security_invoker=true) as  SELECT t.id,
    t.project_id,
    t.action,
    t.from_state,
    t.to_state,
    t.note,
    t.actor_id,
    t.created_at,
    COALESCE(s.full_name, 'Hệ thống'::text) AS actor_name,
    s.title AS actor_title
   FROM (workflow_transitions t
     LEFT JOIN staff_users s ON ((s.id = t.actor_id)));

create view public."audit_logs_resolved" with (security_invoker=true) as  SELECT a.id,
    a.table_name,
    a.record_id,
    a.action,
    a.old_data,
    a.new_data,
    a.changed_fields,
    a.actor_id,
    COALESCE(s.full_name,
        CASE
            WHEN (a.actor_id = 'system'::text) THEN 'Hệ thống'::text
            ELSE 'Người dùng không xác định'::text
        END) AS actor_name,
    s.title AS actor_title,
    COALESCE((a.new_data ->> 'title'::text), (a.new_data ->> 'name'::text), (a.new_data ->> 'full_name'::text), (a.new_data ->> 'discipline_name'::text), (a.old_data ->> 'title'::text), (a.old_data ->> 'name'::text), (a.old_data ->> 'full_name'::text), (a.old_data ->> 'discipline_name'::text), (a.new_data ->> 'code'::text), (a.old_data ->> 'code'::text)) AS record_label,
    a.created_at
   FROM (audit_logs a
     LEFT JOIN staff_users s ON ((s.id = a.actor_id)));

CREATE TRIGGER tr_organizations_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER tr_personnel_updated BEFORE UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER tr_disciplines_updated BEFORE UPDATE ON public.appraisal_disciplines FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER tr_organizations_search_text BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION tg_organizations_search_text();

CREATE TRIGGER tr_personnel_search_text BEFORE INSERT OR UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION tg_personnel_search_text();

CREATE TRIGGER tr_material_prices_search_text BEFORE INSERT OR UPDATE ON public.material_prices FOR EACH ROW EXECUTE FUNCTION tg_material_prices_search_text();

CREATE TRIGGER tr_organizations_audit AFTER INSERT OR DELETE OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION tg_audit_log();

CREATE TRIGGER tr_personnel_audit AFTER INSERT OR DELETE OR UPDATE ON public.personnel FOR EACH ROW EXECUTE FUNCTION tg_audit_log();

CREATE TRIGGER tr_appraisal_disciplines_audit AFTER INSERT OR DELETE OR UPDATE ON public.appraisal_disciplines FOR EACH ROW EXECUTE FUNCTION tg_audit_log();

CREATE TRIGGER tr_appraisal_checklists_audit AFTER INSERT OR DELETE OR UPDATE ON public.appraisal_checklists FOR EACH ROW EXECUTE FUNCTION tg_audit_log();

CREATE TRIGGER tr_material_prices_audit AFTER INSERT OR DELETE OR UPDATE ON public.material_prices FOR EACH ROW EXECUTE FUNCTION tg_audit_log();

CREATE TRIGGER tr_staff_users_audit AFTER INSERT OR DELETE OR UPDATE ON public.staff_users FOR EACH ROW EXECUTE FUNCTION tg_audit_log();

CREATE TRIGGER tr_staff_users_updated BEFORE UPDATE ON public.staff_users FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER tr_material_prices_updated BEFORE UPDATE ON public.material_prices FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER appraisal_submission_lineage BEFORE INSERT OR UPDATE ON public.appraisal_cases FOR EACH ROW EXECUTE FUNCTION sync_appraisal_submission();

CREATE TRIGGER tr_projects_audit AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION tg_audit_log();

CREATE TRIGGER tr_projects_search_text BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION tg_projects_search_text();

CREATE TRIGGER tr_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

alter table public."ai_compliance_alerts" enable row level security;

alter table public."ai_logs" enable row level security;

alter table public."appraisal_ai_logs" enable row level security;

alter table public."appraisal_audit_logs" enable row level security;

alter table public."appraisal_cases" enable row level security;

alter table public."appraisal_checklists" enable row level security;

alter table public."appraisal_disciplines" enable row level security;

alter table public."appraisal_dossiers" enable row level security;

alter table public."appraisal_jobs" enable row level security;

alter table public."appraisal_upload_sessions" enable row level security;

alter table public."audit_logs" enable row level security;

alter table public."holidays" enable row level security;

alter table public."legal_assistant_logs" enable row level security;

alter table public."material_prices" enable row level security;

alter table public."organizations" enable row level security;

alter table public."personnel" enable row level security;

alter table public."profiles" enable row level security;

alter table public."project_documents" enable row level security;

alter table public."projects" enable row level security;

alter table public."schema_migrations" enable row level security;

alter table public."staff_users" enable row level security;

alter table public."workflow_transitions" enable row level security;

create policy "alert_scope_read" on "public"."ai_compliance_alerts" as PERMISSIVE for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = ai_compliance_alerts.target_project_id))) OR (EXISTS ( SELECT 1
   FROM personnel p
  WHERE (p.id = ai_compliance_alerts.target_personnel_id)))));

create policy "ai_log_scope_read" on "public"."ai_logs" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = ai_logs.project_id))));

create policy "appraisal_ai_scope_read" on "public"."appraisal_ai_logs" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM appraisal_cases c
  WHERE (c.id = appraisal_ai_logs.case_id))));

create policy "appraisal_audit_scope_read" on "public"."appraisal_audit_logs" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM appraisal_cases c
  WHERE (c.id = appraisal_audit_logs.case_id))));

create policy "appraisal_scope_read" on "public"."appraisal_cases" as PERMISSIVE for SELECT to "authenticated" using (province_id = ( SELECT s.province_id FROM app_actor_scope() s(province_id, department, is_admin)) AND ((department = ( SELECT s.department FROM app_actor_scope() s(province_id, department, is_admin))) OR COALESCE(( SELECT s.is_admin FROM app_actor_scope() s(province_id, department, is_admin)), false)));

create policy "checklist_scope_read" on "public"."appraisal_checklists" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM appraisal_disciplines d
  WHERE (d.id = appraisal_checklists.discipline_id))));

create policy "discipline_scope_read" on "public"."appraisal_disciplines" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = appraisal_disciplines.project_id))));

create policy "dossier_scope_read" on "public"."appraisal_dossiers" as PERMISSIVE for SELECT to "authenticated" using (province_id = ( SELECT s.province_id FROM app_actor_scope() s(province_id, department, is_admin)) AND ((department = ( SELECT s.department FROM app_actor_scope() s(province_id, department, is_admin))) OR COALESCE(( SELECT s.is_admin FROM app_actor_scope() s(province_id, department, is_admin)), false)));

create policy "upload_backend_scope" on "public"."appraisal_upload_sessions" as PERMISSIVE for ALL to "appraisal_backend" using (((actor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM appraisal_cases c
  WHERE (c.id = appraisal_upload_sessions.case_id))))) with check (((actor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM appraisal_cases c
  WHERE (c.id = appraisal_upload_sessions.case_id)))));

create policy "audit_scope_read" on "public"."audit_logs" as PERMISSIVE for SELECT to "authenticated" using ((((table_name = 'projects'::text) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = audit_logs.record_id)))) OR ((table_name = 'organizations'::text) AND (EXISTS ( SELECT 1
   FROM organizations o
  WHERE (o.id = audit_logs.record_id)))) OR ((table_name = 'personnel'::text) AND (EXISTS ( SELECT 1
   FROM personnel p
  WHERE (p.id = audit_logs.record_id))))));

create policy "price_audit_read" on "public"."audit_logs" as PERMISSIVE for SELECT to "appraisal_backend" using (((table_name = 'material_prices'::text) AND (EXISTS ( SELECT 1
   FROM material_prices p
  WHERE (p.id = audit_logs.record_id)))));

create policy "holiday_read" on "public"."holidays" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_active))));

create policy "legal_ai_own" on "public"."legal_assistant_logs" as PERMISSIVE for ALL to "appraisal_backend" using ((actor_id = auth.uid())) with check ((actor_id = auth.uid()));

create policy "catalog_insert" on "public"."material_prices" as PERMISSIVE for INSERT to "appraisal_backend" with check (catalog_can_write(province_code));

create policy "catalog_update" on "public"."material_prices" as PERMISSIVE for UPDATE to "appraisal_backend" using (catalog_can_write(province_code)) with check (catalog_can_write(province_code));

create policy "price_scope_read" on "public"."material_prices" as PERMISSIVE for SELECT to "authenticated" using (app_has_scope(province_code));

create policy "catalog_insert" on "public"."organizations" as PERMISSIVE for INSERT to "appraisal_backend" with check (catalog_can_write(province_code));

create policy "catalog_update" on "public"."organizations" as PERMISSIVE for UPDATE to "appraisal_backend" using (catalog_can_write(province_code)) with check (catalog_can_write(province_code));

create policy "organization_scope_read" on "public"."organizations" as PERMISSIVE for SELECT to "authenticated" using (app_has_scope(province_code));

create policy "catalog_insert" on "public"."personnel" as PERMISSIVE for INSERT to "appraisal_backend" with check (catalog_can_write(province_code));

create policy "catalog_update" on "public"."personnel" as PERMISSIVE for UPDATE to "appraisal_backend" using (catalog_can_write(province_code)) with check (catalog_can_write(province_code));

create policy "personnel_scope_read" on "public"."personnel" as PERMISSIVE for SELECT to "authenticated" using (app_has_scope(province_code));

create policy "profile_self_read" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated" using ((id = auth.uid()));

create policy "document_scope_read" on "public"."project_documents" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = project_documents.project_id))));

create policy "project_scope_read" on "public"."projects" as PERMISSIVE for SELECT to "authenticated" using (province_code = ( SELECT s.province_id FROM app_actor_scope() s(province_id, department, is_admin)) AND ((department = ( SELECT s.department FROM app_actor_scope() s(province_id, department, is_admin))) OR COALESCE(( SELECT s.is_admin FROM app_actor_scope() s(province_id, department, is_admin)), false)));

create policy "staff_scope_read" on "public"."staff_users" as PERMISSIVE for SELECT to "authenticated" using (app_has_scope(province_code, department));

create policy "transition_scope_read" on "public"."workflow_transitions" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM projects p
  WHERE (p.id = workflow_transitions.project_id))));

create policy "appraisal_original_insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'appraisal-originals'::text) AND appraisal_upload_access(name)));

create policy "appraisal_original_read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'appraisal-originals'::text) AND (EXISTS ( SELECT 1
   FROM appraisal_cases c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND (EXISTS ( SELECT 1
           FROM jsonb_array_elements((c.payload -> 'documents'::text)) d(value)
          WHERE ((d.value ->> 'id'::text) = storage.filename(objects.name)))))))));

create policy "appraisal_pending_read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'appraisal-originals'::text) AND appraisal_upload_access(name)));

create policy "project_image_cleanup" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'appraisal-project-images'::text) AND (owner_id = (auth.uid())::text) AND project_image_access((storage.foldername(name))[1])));

create policy "project_image_insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'appraisal-project-images'::text) AND project_image_access((storage.foldername(name))[1]) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND profiles.is_active AND (profiles.role = ANY (ARRAY['officer'::text, 'head_of_department'::text, 'admin'::text])))))));

create policy "project_image_read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'appraisal-project-images'::text) AND project_image_access((storage.foldername(name))[1])));

revoke all on all tables in schema public from anon,authenticated;

revoke all on all sequences in schema public from anon,authenticated;

revoke execute on all functions in schema public from public,anon,authenticated;

alter default privileges in schema public revoke all on tables from anon,authenticated;

alter default privileges in schema public revoke all on sequences from anon,authenticated;

alter default privileges in schema public revoke execute on functions from public,anon,authenticated;

grant EXECUTE on function add_working_days(date,integer) to "authenticated";

grant EXECUTE on function app_actor_scope() to "authenticated";

grant EXECUTE on function app_has_scope(text,text) to "authenticated";

grant EXECUTE on function appraisal_has_scope(text,text) to "authenticated";

grant EXECUTE on function appraisal_reviewers(uuid) to "appraisal_backend";

grant EXECUTE on function appraisal_upload_access(text) to "authenticated";

grant EXECUTE on function catalog_can_write(text) to "appraisal_backend";

grant EXECUTE on function claim_appraisal_job(text) to "appraisal_backend";

grant EXECUTE on function create_appraisal_project(jsonb) to "appraisal_backend";

grant EXECUTE on function dashboard_by_investment_form(text) to "authenticated";

grant EXECUTE on function dashboard_monthly(integer,text) to "authenticated";

grant EXECUTE on function dashboard_summary(text) to "authenticated";

grant EXECUTE on function derive_sla_status(text,date) to "authenticated";

grant EXECUTE on function f_search_text(text[]) to "authenticated";

grant EXECUTE on function f_unaccent(text) to "authenticated";

grant EXECUTE on function finish_appraisal_job(uuid,text,text) to "appraisal_backend";

grant EXECUTE on function is_working_day(date) to "authenticated";

grant EXECUTE on function persist_appraisal_case(uuid,integer,jsonb) to "appraisal_backend";

grant EXECUTE on function project_image_access(text) to "authenticated";

grant EXECUTE on function read_appraisal_job(uuid) to "appraisal_backend";

grant EXECUTE on function renew_appraisal_job(uuid,text) to "appraisal_backend";

grant EXECUTE on function save_project_images(text,integer,jsonb) to "appraisal_backend";

grant EXECUTE on function working_days_between(date,date) to "authenticated";

grant SELECT on table ai_compliance_alerts to "authenticated";

grant SELECT on table ai_logs to "authenticated";

grant SELECT on table appraisal_ai_logs to "authenticated";

grant SELECT on table appraisal_audit_logs to "authenticated";

grant SELECT on table appraisal_cases to "authenticated";

grant SELECT on table appraisal_checklists to "authenticated";

grant SELECT on table appraisal_disciplines to "authenticated";

grant SELECT on table appraisal_dossiers to "authenticated";

grant INSERT on table appraisal_upload_sessions to "appraisal_backend";

grant SELECT on table appraisal_upload_sessions to "appraisal_backend";

grant UPDATE on table appraisal_upload_sessions to "appraisal_backend";

grant SELECT on table audit_logs to "authenticated";

grant SELECT on table audit_logs_resolved to "authenticated";

grant SELECT on table holidays to "authenticated";

grant INSERT on table legal_assistant_logs to "appraisal_backend";

grant SELECT on table legal_assistant_logs to "appraisal_backend";

grant INSERT on table material_prices to "appraisal_backend";

grant UPDATE on table material_prices to "appraisal_backend";

grant SELECT on table material_prices to "authenticated";

grant INSERT on table organizations to "appraisal_backend";

grant UPDATE on table organizations to "appraisal_backend";

grant SELECT on table organizations to "authenticated";

grant INSERT on table personnel to "appraisal_backend";

grant UPDATE on table personnel to "appraisal_backend";

grant SELECT on table personnel to "authenticated";

grant SELECT on table profiles to "authenticated";

grant SELECT on table project_documents to "authenticated";

grant SELECT on table projects to "authenticated";

grant SELECT on table staff_users to "authenticated";

grant SELECT on table workflow_transitions to "authenticated";

grant SELECT on table workflow_transitions_resolved to "authenticated";

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('appraisal-originals','appraisal-originals',false,18874368,null) on conflict(id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('appraisal-project-images','appraisal-project-images',false,5242880,array['image/jpeg','image/png','image/webp']::text[]) on conflict(id) do nothing;

insert into public.schema_migrations(version) values('20260925000001_initial_schema.sql');

insert into public.schema_migrations(version) values('20260926000001_schema_v2_core.sql');

insert into public.schema_migrations(version) values('20260926000002_dev_open_access.sql');

insert into public.schema_migrations(version) values('20260926000003_workflow_sla.sql');

insert into public.schema_migrations(version) values('20260927000002_appraisal_workspace.sql');

insert into public.schema_migrations(version) values('20260927000003_security_identity.sql');

insert into public.schema_migrations(version) values('20260927000004_backend_persistence.sql');

insert into public.schema_migrations(version) values('20260927000005_upload_sessions.sql');

insert into public.schema_migrations(version) values('20260927000006_project_commands.sql');

insert into public.schema_migrations(version) values('20260927000007_project_intake_defaults');

insert into public.schema_migrations(version) values('20260927000008_submission_lineage');

insert into public.schema_migrations(version) values('20260927000009_workflow_reviewers');

insert into public.schema_migrations(version) values('20260927000010_catalog_commands.sql');

insert into public.schema_migrations(version) values('20260928000001_restore_dev_anon_read.sql');

insert into public.schema_migrations(version) values('20260928000002_close_anonymous_access.sql');

insert into public.schema_migrations(version) values('20260928000003_project_gallery.sql');

commit;
