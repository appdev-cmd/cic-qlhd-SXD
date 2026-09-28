-- Row-level scope for the hottest read paths, evaluated once per statement.
-- app_has_scope(province, department) is a SECURITY DEFINER function called per row, so list
-- queries grew linearly with table size. The scalar sub-selects below become InitPlans:
-- the caller's profile is read once, then rows are filtered by plain column comparisons.
-- Semantics are unchanged: active profile, staff role, same province, same department or admin.
create or replace function public.app_actor_scope()
returns table(province_id text, department text, is_admin boolean)
language sql stable security definer set search_path to ''
as $$
  select p.province_id, p.department, p.role = 'admin'
  from public.profiles p
  where p.id = auth.uid() and p.is_active is true
    and p.role in ('admin','director','head_of_department','officer')
$$;
revoke all on function public.app_actor_scope() from public, anon;
grant execute on function public.app_actor_scope() to authenticated;

alter policy "appraisal_scope_read" on public.appraisal_cases using (
  province_id = (select s.province_id from public.app_actor_scope() s)
  and (department = (select s.department from public.app_actor_scope() s)
       or coalesce((select s.is_admin from public.app_actor_scope() s), false)));

alter policy "dossier_scope_read" on public.appraisal_dossiers using (
  province_id = (select s.province_id from public.app_actor_scope() s)
  and (department = (select s.department from public.app_actor_scope() s)
       or coalesce((select s.is_admin from public.app_actor_scope() s), false)));

alter policy "project_scope_read" on public.projects using (
  province_code = (select s.province_id from public.app_actor_scope() s)
  and (department = (select s.department from public.app_actor_scope() s)
       or coalesce((select s.is_admin from public.app_actor_scope() s), false)));
