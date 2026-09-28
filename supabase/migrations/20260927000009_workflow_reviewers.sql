begin;
create function public.appraisal_reviewers(case_id uuid)
returns table(id uuid,full_name text,role text,department text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.role,p.department from public.profiles p
 join public.appraisal_cases c on c.id=case_id
 where public.app_has_scope(c.province_id,c.department)
 and p.is_active and p.province_id=c.province_id and p.department=c.department
 and p.role in ('officer','head_of_department','director') order by p.full_name,p.id
$$;
revoke all on function public.appraisal_reviewers(uuid) from public,anon,authenticated;
grant execute on function public.appraisal_reviewers(uuid) to appraisal_backend;
create table public.legal_assistant_logs(
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),
 question_hash text not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table public.legal_assistant_logs enable row level security;
revoke all on public.legal_assistant_logs from public,anon,authenticated;
grant select,insert on public.legal_assistant_logs to appraisal_backend;
create policy legal_ai_own on public.legal_assistant_logs to appraisal_backend
 using(actor_id=auth.uid()) with check(actor_id=auth.uid());
commit;
