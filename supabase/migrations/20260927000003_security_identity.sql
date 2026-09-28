-- Close development access and derive identity from verified Auth users.
-- Apply together with 00002 in one transaction when bootstrapping a database.
begin;

alter table public.profiles add column if not exists province_id text;
alter table public.staff_users add column if not exists auth_user_id uuid unique references public.profiles(id);
alter table public.organizations add column if not exists province_code text;
alter table public.personnel add column if not exists province_code text;
-- Existing cloud data belongs to the Dien Bien workspace; this is ownership, not address.
update public.organizations set province_code='DB' where province_code is null;
update public.personnel set province_code='DB' where province_code is null;

create or replace function public.app_has_scope(p_province text,p_department text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.is_active is true and p.province_id=p_province
    and p.role in ('admin','director','head_of_department','officer')
    and (p_department is null or p.department=p_department or p.role='admin'));
$$;
create or replace function public.appraisal_has_scope(p_province text,p_department text)
returns boolean language sql stable security definer set search_path='' as $$
  select public.app_has_scope(p_province,p_department);
$$;

-- Replace permissive policies; adding another policy would not narrow an OR policy.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke all on sequences from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;

grant execute on function public.app_has_scope(text,text),public.appraisal_has_scope(text,text) to authenticated;
grant select on public.profiles,public.projects,public.organizations,public.personnel,
  public.staff_users,public.material_prices,public.holidays,public.project_documents,
  public.appraisal_disciplines,public.appraisal_checklists,public.ai_compliance_alerts,
  public.audit_logs,public.ai_logs,public.workflow_transitions,
  public.audit_logs_resolved,public.workflow_transitions_resolved,
  public.appraisal_cases,public.appraisal_audit_logs,public.appraisal_ai_logs to authenticated;

alter table public.schema_migrations enable row level security;
create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy project_scope_read on public.projects for select to authenticated
  using(public.app_has_scope(province_code,department));
create policy organization_scope_read on public.organizations for select to authenticated
  using(public.app_has_scope(province_code));
create policy personnel_scope_read on public.personnel for select to authenticated
  using(public.app_has_scope(province_code));
create policy staff_scope_read on public.staff_users for select to authenticated
  using(public.app_has_scope(province_code,department));
create policy price_scope_read on public.material_prices for select to authenticated
  using(public.app_has_scope(province_code));
create policy holiday_read on public.holidays for select to authenticated
  using(exists(select 1 from public.profiles where id=auth.uid() and is_active));
create policy document_scope_read on public.project_documents for select to authenticated
  using(exists(select 1 from public.projects p where p.id=project_id));
create policy discipline_scope_read on public.appraisal_disciplines for select to authenticated
  using(exists(select 1 from public.projects p where p.id=project_id));
create policy checklist_scope_read on public.appraisal_checklists for select to authenticated
  using(exists(select 1 from public.appraisal_disciplines d where d.id=discipline_id));
create policy alert_scope_read on public.ai_compliance_alerts for select to authenticated
  using(exists(select 1 from public.projects p where p.id=target_project_id)
     or exists(select 1 from public.personnel p where p.id=target_personnel_id));
create policy transition_scope_read on public.workflow_transitions for select to authenticated
  using(exists(select 1 from public.projects p where p.id=project_id));
create policy ai_log_scope_read on public.ai_logs for select to authenticated
  using(exists(select 1 from public.projects p where p.id=project_id));
create policy audit_scope_read on public.audit_logs for select to authenticated using(
  (table_name='projects' and exists(select 1 from public.projects p where p.id=record_id))
  or (table_name='organizations' and exists(select 1 from public.organizations o where o.id=record_id))
  or (table_name='personnel' and exists(select 1 from public.personnel p where p.id=record_id)));
create policy appraisal_scope_read on public.appraisal_cases for select to authenticated
  using(public.appraisal_has_scope(province_id,department));
create policy appraisal_audit_scope_read on public.appraisal_audit_logs for select to authenticated
  using(exists(select 1 from public.appraisal_cases c where c.id=case_id));
create policy appraisal_ai_scope_read on public.appraisal_ai_logs for select to authenticated
  using(exists(select 1 from public.appraisal_cases c where c.id=case_id));

-- No client can submit an arbitrary aggregate or invoke the legacy header-based workflow.
revoke all on function public.save_appraisal_case(uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.transition_dossier(text,text,text,date,text) from public,anon,authenticated;
revoke all on function public.refresh_sla_status() from public,anon,authenticated;

-- Restore only pure helper calls used by scoped read functions.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('dashboard_summary','dashboard_monthly',
   'dashboard_by_investment_form','is_working_day','add_working_days','working_days_between',
   'derive_sla_status','f_search_text','f_unaccent') and not p.prosecdef loop
   execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;
