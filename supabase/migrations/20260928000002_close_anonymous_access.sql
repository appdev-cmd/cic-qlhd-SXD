-- Restore least privilege after the ledgered anonymous development migration.
begin;
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public'
   and policyname in ('anon_dev_read','dev_open_access') loop
   execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke all on sequences from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
revoke all on public.schema_migrations,public.appraisal_jobs,public.appraisal_upload_sessions,
 public.legal_assistant_logs from authenticated;
-- Browser access is limited to scoped reads and Storage authorization helpers.
grant execute on function public.app_has_scope(text,text),public.appraisal_has_scope(text,text),
 public.appraisal_upload_access(text) to authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and not p.prosecdef and p.proname in
  ('dashboard_summary','dashboard_monthly','dashboard_by_investment_form','is_working_day',
   'add_working_days','working_days_between','derive_sla_status','f_search_text','f_unaccent') loop
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
-- Existing explicit backend grants remain intact; no business rows are changed.
commit;
