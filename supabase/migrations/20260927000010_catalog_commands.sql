begin;
alter table public.organizations add column revision integer not null default 1;
alter table public.personnel add column revision integer not null default 1;
alter table public.material_prices add column revision integer not null default 1;
create function public.catalog_can_write(province text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active
   and p.province_id=province and p.role in ('admin','head_of_department'))
$$;
revoke all on function public.catalog_can_write(text) from public,anon,authenticated;
grant execute on function public.catalog_can_write(text) to appraisal_backend;
do $$ declare tab text; begin
 foreach tab in array array['organizations','personnel','material_prices'] loop
  execute format('grant insert,update on public.%I to appraisal_backend',tab);
  execute format('create policy catalog_insert on public.%I for insert to appraisal_backend with check(public.catalog_can_write(province_code))',tab);
  execute format('create policy catalog_update on public.%I for update to appraisal_backend using(public.catalog_can_write(province_code)) with check(public.catalog_can_write(province_code))',tab);
 end loop;
end $$;
create policy price_audit_read on public.audit_logs for select to appraisal_backend using(
 table_name='material_prices' and exists(select 1 from public.material_prices p where p.id=record_id));
commit;
