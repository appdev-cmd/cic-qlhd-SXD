begin;
create table public.appraisal_dossiers(
 id uuid primary key, project_id text references public.projects(id),
 province_id text not null,department text not null,procedure text not null
 check(procedure in ('bcnckt','gpxd','nghiem_thu')),name text not null,created_at timestamptz not null default now()
);
alter table public.appraisal_dossiers enable row level security;
revoke all on public.appraisal_dossiers from public,anon,authenticated;
grant select on public.appraisal_dossiers to authenticated;
create policy dossier_scope_read on public.appraisal_dossiers for select to authenticated
 using(public.app_has_scope(province_id,department));
alter table public.appraisal_cases add column dossier_id uuid references public.appraisal_dossiers(id);
alter table public.appraisal_cases add column submission_round integer check(submission_round>0);

-- Backfill only explicit predecessor links; never infer links from similar names.
update public.appraisal_cases set previous_submission_id=nullif(payload->>'previousSubmissionId','')::uuid;
do $$ begin
 if exists(select 1 from public.appraisal_cases c join public.appraisal_cases p on p.id=c.previous_submission_id
   where c.project_id is distinct from p.project_id or c.procedure<>p.procedure
   or c.province_id<>p.province_id or c.department<>p.department) then
   raise exception 'Resolve inconsistent submission scope before migration'; end if;
end $$;
insert into public.appraisal_dossiers(id,project_id,province_id,department,procedure,name,created_at)
 select id,project_id,province_id,department,procedure,payload->>'name',created_at
 from public.appraisal_cases where previous_submission_id is null;
with recursive chain as (
 select id,id as root_id,1 as round_number from public.appraisal_cases where previous_submission_id is null
 union all
 select c.id,p.root_id,p.round_number+1 from public.appraisal_cases c join chain p on c.previous_submission_id=p.id
 where p.round_number<1000
)
update public.appraisal_cases c set dossier_id=chain.root_id,submission_round=chain.round_number
 from chain where c.id=chain.id;
alter table public.appraisal_cases alter column dossier_id set not null;
alter table public.appraisal_cases alter column submission_round set not null;
create unique index appraisal_dossier_round_unique on public.appraisal_cases(dossier_id,submission_round);
create unique index appraisal_previous_unique on public.appraisal_cases(previous_submission_id) where previous_submission_id is not null;
update public.appraisal_cases c set revision=revision+1,
 payload=payload||jsonb_build_object('dossierId',dossier_id,'submissionRound',submission_round,
   'previousSubmissionId',previous_submission_id,'previousSubmissionName',(select p.payload->>'name' from public.appraisal_cases p where p.id=c.previous_submission_id),
   'revision',revision+1,'audit',(payload->'audit')||jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid(),'at',now(),'actor','Hệ thống nâng cấp','action','Chuẩn hóa chuỗi lần nộp',
    'detail','Liên kết hồ sơ gốc và lần trước từ dữ liệu đã ghi nhận; giữ nguyên tài liệu và kết quả.')));
insert into public.appraisal_audit_logs(case_id,actor_id,actor_name,revision,event)
 select id,'00000000-0000-4000-8000-000000000001'::uuid,'Hệ thống nâng cấp',revision,payload->'audit'->-1 from public.appraisal_cases;

create function public.sync_appraisal_submission()
returns trigger language plpgsql security definer set search_path='' as $$
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
$$;
revoke all on function public.sync_appraisal_submission() from public,anon,authenticated;
create trigger appraisal_submission_lineage before insert or update on public.appraisal_cases
 for each row execute function public.sync_appraisal_submission();
create or replace function public.persist_appraisal_case(case_id uuid,expected_revision integer,new_payload jsonb)
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
$$;
revoke all on function public.persist_appraisal_case(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.persist_appraisal_case(uuid,integer,jsonb) to appraisal_backend;

commit;
