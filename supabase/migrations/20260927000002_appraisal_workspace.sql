-- Run after the initial schema. No existing project or source document is changed.
begin;
alter table public.profiles add column if not exists province_id text;
create policy "appraisal_profile_self_read" on public.profiles for select to authenticated using (id=auth.uid());
-- Tenant and role assignment is performed by a database administrator only.
revoke insert,update,delete on public.profiles from anon,authenticated;

create table public.appraisal_cases (
  id uuid primary key, province_id text not null, department text not null,
  revision integer not null check(revision>0), payload jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index appraisal_cases_scope on public.appraisal_cases(province_id,department,created_at desc);
create table public.appraisal_audit_logs (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.appraisal_cases(id), actor_id uuid not null,
  actor_name text not null, revision integer not null, event jsonb not null,
  created_at timestamptz not null default now()
);
create table public.appraisal_ai_logs (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.appraisal_cases(id), actor_id uuid not null,
  run_id text not null, run jsonb not null, created_at timestamptz not null default now(),
  unique(case_id,run_id)
);
alter table public.appraisal_cases enable row level security;
alter table public.appraisal_audit_logs enable row level security;
alter table public.appraisal_ai_logs enable row level security;

create function public.appraisal_has_scope(p_province text,p_department text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_active
    and province_id=p_province and department=p_department
    and role in ('officer','head_of_department','director','admin'));
$$;
revoke all on function public.appraisal_has_scope(text,text) from public,anon;
grant execute on function public.appraisal_has_scope(text,text) to authenticated;
create policy appraisal_read on public.appraisal_cases for select to authenticated
 using(public.appraisal_has_scope(province_id,department));
create policy appraisal_audit_read on public.appraisal_audit_logs for select to authenticated
 using(exists(select 1 from public.appraisal_cases c where c.id=case_id));
create policy appraisal_ai_read on public.appraisal_ai_logs for select to authenticated
 using(exists(select 1 from public.appraisal_cases c where c.id=case_id));
revoke all on public.appraisal_cases,public.appraisal_audit_logs,public.appraisal_ai_logs from anon,authenticated;
grant select on public.appraisal_cases,public.appraisal_audit_logs,public.appraisal_ai_logs to authenticated;

create function public.save_appraisal_case(case_id uuid,expected_revision integer,new_payload jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
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
$$;
revoke all on function public.save_appraisal_case(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_appraisal_case(uuid,integer,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit)
 values('appraisal-originals','appraisal-originals',false,18874368) on conflict(id) do nothing;
create policy appraisal_original_read on storage.objects for select to authenticated
 using(bucket_id='appraisal-originals' and exists(
   select 1 from public.appraisal_cases c where c.id::text=(storage.foldername(name))[1]
   and exists(select 1 from jsonb_array_elements(c.payload->'documents') d where d->>'id'=storage.filename(name))));
create policy appraisal_original_insert on storage.objects for insert to authenticated
 with check(bucket_id='appraisal-originals' and exists(
   select 1 from public.appraisal_cases c where c.id::text=(storage.foldername(name))[1]));
commit;
