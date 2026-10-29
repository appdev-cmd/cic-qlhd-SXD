begin;
alter table public.appraisal_jobs add column if not exists runtime_input jsonb not null default '{}'::jsonb;

-- Legacy workers leave Node jobs to the durable queue during the migration window.
create or replace function public.claim_appraisal_job(worker_id text)
returns setof public.appraisal_jobs language plpgsql security definer set search_path='' as $$
begin
 return query update public.appraisal_jobs set state='running',attempts=attempts+1,
   lease_owner=worker_id,lease_until=now()+interval '3 minutes',updated_at=now()
   where id=(select id from public.appraisal_jobs where coalesce(snapshot->'job'->>'engine','python')<>'node'
     and (state='queued' or (state='running' and lease_until<now())) and attempts<3
     order by created_at for update skip locked limit 1) returning *;
 update public.appraisal_jobs set state='failed',error_code='lease_exhausted',updated_at=now()
   where coalesce(snapshot->'job'->>'engine','python')<>'node' and state='running' and lease_until<now() and attempts>=3;
end;
$$;

create function public.set_node_appraisal_input(job_id uuid,new_input jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(new_input)<>'object' or octet_length(new_input::text)>8000000 then
   raise exception 'Invalid job input' using errcode='22023'; end if;
 update public.appraisal_jobs j set runtime_input=new_input where j.id=job_id
   and j.actor_id=auth.uid() and j.state='queued' and j.snapshot->'job'->>'engine'='node'
   and exists(select 1 from public.appraisal_cases c where c.id=j.case_id and public.appraisal_has_scope(c.province_id,c.department));
 if not found then raise exception 'Job not available' using errcode='42501'; end if;
end;
$$;

-- Backend-only consumer entry. Idempotent terminal delivery and serialized active leases.
create function public.claim_node_appraisal_job(job_id uuid,worker_id text)
returns setof public.appraisal_jobs language plpgsql security definer set search_path='' as $$
declare item public.appraisal_jobs;
begin
 select * into item from public.appraisal_jobs where id=job_id and snapshot->'job'->>'engine'='node' for update;
 if not found then return; end if;
 if item.state in ('completed','failed','stale','cancelled') then return next item; return; end if;
 if item.state='running' and item.lease_until>now() then raise exception 'Job busy' using errcode='40001'; end if;
 if item.attempts>=3 then
   update public.appraisal_jobs set state='failed',error_code='lease_exhausted',lease_until=null,updated_at=now() where id=job_id returning * into item;
   return next item; return;
 end if;
 return query update public.appraisal_jobs set state='running',attempts=attempts+1,lease_owner=worker_id,
   lease_until=now()+interval '3 minutes',updated_at=now() where id=job_id returning *;
end;
$$;

create function public.checkpoint_node_appraisal_job(job_id uuid,worker_id text,new_input jsonb,continue_job boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(new_input)<>'object' or octet_length(new_input::text)>8000000 then raise exception 'Invalid checkpoint' using errcode='22023'; end if;
 update public.appraisal_jobs set runtime_input=new_input,updated_at=now(),
   state=case when continue_job then 'queued' else state end,
   attempts=case when continue_job then 0 else attempts end,
   lease_owner=case when continue_job then null else lease_owner end,
   lease_until=case when continue_job then null else lease_until end
   where id=job_id and lease_owner=worker_id and state='running' and snapshot->'job'->>'engine'='node';
 if not found then raise exception 'Job lease changed' using errcode='40001'; end if;
end;
$$;
revoke all on function public.set_node_appraisal_input(uuid,jsonb),public.claim_node_appraisal_job(uuid,text),
  public.checkpoint_node_appraisal_job(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.set_node_appraisal_input(uuid,jsonb),public.claim_node_appraisal_job(uuid,text),
  public.checkpoint_node_appraisal_job(uuid,text,jsonb,boolean) to appraisal_backend;
create function public.retry_node_appraisal_job(job_id uuid,worker_id text)
returns void language sql security definer set search_path='' as $$
 update public.appraisal_jobs set state='queued',lease_owner=null,lease_until=null,updated_at=now()
 where id=job_id and lease_owner=worker_id and state='running' and snapshot->'job'->>'engine'='node';
$$;
revoke all on function public.retry_node_appraisal_job(uuid,text) from public,anon,authenticated;
grant execute on function public.retry_node_appraisal_job(uuid,text) to appraisal_backend;
-- Backend-only dispatcher recovery. It exposes IDs, never documents, tokens or job input.
create or replace function public.pending_node_appraisal_jobs()
returns table(id uuid) language sql security definer set search_path=public as $$
 select j.id from public.appraisal_jobs j where j.snapshot->'job'->>'engine'='node'
 and (j.state='queued' or (j.state='running' and j.lease_until<now()))
 order by j.created_at limit 20;
$$;
revoke all on function public.pending_node_appraisal_jobs() from public,anon,authenticated;
grant execute on function public.pending_node_appraisal_jobs() to appraisal_backend;
commit;

