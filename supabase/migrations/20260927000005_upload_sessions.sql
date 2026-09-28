begin;
create table public.appraisal_upload_sessions (
 id uuid primary key, case_id uuid not null references public.appraisal_cases(id),
 actor_id uuid not null references public.profiles(id), expected_revision integer not null,
 requirement_id text not null, file_name text not null, file_size bigint not null check(file_size between 1 and 18874368),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), file_role text not null check(file_role in ('submission','reference')),
 state text not null default 'pending' check(state in ('pending','completed','expired')),
 expires_at timestamptz not null default now()+interval '2 hours', created_at timestamptz not null default now()
);
alter table public.appraisal_upload_sessions enable row level security;
revoke all on public.appraisal_upload_sessions from public,anon,authenticated;
grant select,insert,update on public.appraisal_upload_sessions to appraisal_backend;
create policy upload_backend_scope on public.appraisal_upload_sessions for all to appraisal_backend
 using(actor_id=auth.uid() and exists(select 1 from public.appraisal_cases c where c.id=case_id))
 with check(actor_id=auth.uid() and exists(select 1 from public.appraisal_cases c where c.id=case_id));

create function public.appraisal_upload_access(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.appraisal_upload_sessions u join public.appraisal_cases c on c.id=u.case_id
   where object_name=c.id::text||'/'||u.id::text and u.actor_id=auth.uid()
     and u.state='pending' and u.expires_at>now() and public.appraisal_has_scope(c.province_id,c.department));
$$;
revoke all on function public.appraisal_upload_access(text) from public,anon;
grant execute on function public.appraisal_upload_access(text) to authenticated;
drop policy if exists appraisal_original_insert on storage.objects;
create policy appraisal_original_insert on storage.objects for insert to authenticated
 with check(bucket_id='appraisal-originals' and public.appraisal_upload_access(name));
create policy appraisal_pending_read on storage.objects for select to authenticated
 using(bucket_id='appraisal-originals' and public.appraisal_upload_access(name));

create function public.renew_appraisal_job(job_id uuid,worker_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.appraisal_jobs set lease_until=now()+interval '3 minutes',updated_at=now()
   where id=job_id and lease_owner=worker_id and state='running';
 return found;
end;
$$;
revoke all on function public.renew_appraisal_job(uuid,text) from public,anon,authenticated;
grant execute on function public.renew_appraisal_job(uuid,text) to appraisal_backend;
commit;
