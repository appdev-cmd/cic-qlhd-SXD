begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='appraisal_backend') then
   create role appraisal_backend nologin inherit nosuperuser nocreatedb nocreaterole nobypassrls;
 end if;
end $$;
grant authenticated to appraisal_backend;
grant usage on schema public to appraisal_backend;

alter table public.appraisal_cases add column project_id text references public.projects(id);
alter table public.appraisal_cases add column procedure text not null default 'bcnckt'
  check(procedure in ('bcnckt','gpxd','nghiem_thu'));
alter table public.appraisal_cases add column previous_submission_id uuid references public.appraisal_cases(id);
create index appraisal_project_page on public.appraisal_cases(province_id,project_id,procedure,created_at desc,id);
create index appraisal_status_page on public.appraisal_cases(province_id,department,(payload->>'status'),created_at desc,id);

create table public.appraisal_jobs (
 id uuid primary key, case_id uuid not null references public.appraisal_cases(id),
 actor_id uuid not null references public.profiles(id), snapshot jsonb not null,
 state text not null default 'queued' check(state in ('queued','running','completed','failed','cancelled','stale')),
 attempts integer not null default 0, lease_owner text, lease_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 error_code text
);
alter table public.appraisal_jobs enable row level security;
revoke all on public.appraisal_jobs from public,anon,authenticated;
create index appraisal_jobs_claim on public.appraisal_jobs(state,lease_until,created_at);

create function public.persist_appraisal_case(case_id uuid,expected_revision integer,new_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function public.persist_appraisal_case(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.persist_appraisal_case(uuid,integer,jsonb) to appraisal_backend;

create function public.claim_appraisal_job(worker_id text)
returns setof public.appraisal_jobs language plpgsql security definer set search_path='' as $$
begin
 return query update public.appraisal_jobs set state='running',attempts=attempts+1,
   lease_owner=worker_id,lease_until=now()+interval '3 minutes',updated_at=now()
   where id=(select id from public.appraisal_jobs where
     (state='queued' or (state='running' and lease_until<now())) and attempts<3
     order by created_at for update skip locked limit 1) returning *;
 update public.appraisal_jobs set state='failed',error_code='lease_exhausted',updated_at=now()
   where state='running' and lease_until<now() and attempts>=3;
end;
$$;
create function public.finish_appraisal_job(job_id uuid,worker_id text,new_state text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if new_state not in ('completed','failed','stale','cancelled') then
   raise exception 'Invalid job state'; end if;
 update public.appraisal_jobs set state=new_state,lease_until=null,updated_at=now()
   where id=job_id and lease_owner=worker_id and state='running';
end;
$$;
revoke all on function public.claim_appraisal_job(text),public.finish_appraisal_job(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.claim_appraisal_job(text),public.finish_appraisal_job(uuid,text,text)
 to appraisal_backend;
commit;
