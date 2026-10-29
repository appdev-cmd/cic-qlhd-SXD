-- Shared bridge for the qa-si-xd BIM module and the existing SXD project scope.
alter table public.bim_models rename to appraisal_bim_models;
alter table public.bim_files rename to appraisal_bim_files;
alter table public.bim_elements rename to appraisal_bim_elements;
alter table public.bim_notes rename to appraisal_bim_notes;
alter table public.bim_events rename to appraisal_bim_events;
create schema sxd_bim_document_private;
create schema sxd_bim_appraisal_private;
create function sxd_bim_appraisal_private.worker_authorized(p_key text) returns boolean
language sql stable set search_path='' as $$
 select current_setting('request.jwt.claim.role',true)='service_role' and length(coalesce(p_key,''))>=32
$$;
revoke all on schema sxd_bim_document_private,sxd_bim_appraisal_private from public,anon;
grant usage on schema sxd_bim_document_private,sxd_bim_appraisal_private to authenticated,service_role;
create table public.sxd_bim_organizations (
 id uuid primary key default gen_random_uuid(), name text not null, province_id text not null, department text not null,
 unique(province_id,department)
);
create table public.sxd_bim_projects (
 id uuid primary key default gen_random_uuid(), target_project_id text not null unique references public.projects(id),
 name text not null, owner_id uuid not null references public.profiles(id), organization_id uuid not null references public.sxd_bim_organizations(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create function sxd_bim_document_private.project_access(p_project uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sxd_bim_projects b join public.projects p on p.id=b.target_project_id
 join public.profiles u on u.id=auth.uid() where b.id=p_project and u.is_active
 and public.app_has_scope(p.province_code,p.department)
 and (not p_write or u.role in ('admin','officer','head_of_department','director')))
$$;
create function sxd_bim_appraisal_private.org_access(p_org uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sxd_bim_organizations o join public.profiles u on u.id=auth.uid()
 where o.id=p_org and u.is_active and public.app_has_scope(o.province_id,o.department)
 and (not p_write or u.role in ('admin','head_of_department','director')))
$$;
revoke all on all functions in schema sxd_bim_document_private,sxd_bim_appraisal_private from public,anon;
grant execute on all functions in schema sxd_bim_document_private,sxd_bim_appraisal_private to authenticated,service_role;
alter table public.sxd_bim_projects enable row level security;
alter table public.sxd_bim_organizations enable row level security;
revoke all on public.sxd_bim_projects,public.sxd_bim_organizations from anon,authenticated;
grant select on public.sxd_bim_projects,public.sxd_bim_organizations to authenticated;
create policy sxd_bim_projects_read on public.sxd_bim_projects for select to authenticated
 using(sxd_bim_document_private.project_access(id));
create policy sxd_bim_org_read on public.sxd_bim_organizations for select to authenticated
 using(sxd_bim_appraisal_private.org_access(id));
create view public.sxd_bim_project_profiles with(security_invoker=true) as
 select id as project_id,organization_id from public.sxd_bim_projects;
create view public.sxd_bim_project_members with(security_invoker=true) as
 select b.id as project_id,p.id as user_id,case when p.role in ('admin','head_of_department','director') then 'manager' else 'editor' end as role
 from public.sxd_bim_projects b join public.sxd_bim_organizations o on o.id=b.organization_id
 join public.profiles p on p.province_id=o.province_id and p.department=o.department and p.is_active;
grant select on public.sxd_bim_project_profiles,public.sxd_bim_project_members to authenticated;
create table public.sxd_bim_documents (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.sxd_bim_projects(id),
 name text not null,category text, current_version_id uuid,deleted_at timestamptz,updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create table public.sxd_bim_document_versions (
 id uuid primary key default gen_random_uuid(),document_id uuid references public.sxd_bim_documents(id),
 scan_status text not null default 'clean',version_number integer default 1,extension text,storage_path text,preview_path text,preview_kind text
);
create table public.sxd_bim_workspace_tasks (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.sxd_bim_projects(id),
 title text not null,status text not null default 'todo',due_date date,created_at timestamptz default now(),updated_at timestamptz default now()
);
alter table public.sxd_bim_documents enable row level security;
alter table public.sxd_bim_document_versions enable row level security;
alter table public.sxd_bim_workspace_tasks enable row level security;
revoke all on public.sxd_bim_documents,public.sxd_bim_document_versions,public.sxd_bim_workspace_tasks from anon,authenticated;
grant select,insert,update,delete on public.sxd_bim_documents,public.sxd_bim_document_versions,public.sxd_bim_workspace_tasks to authenticated;
create policy sxd_documents_read on public.sxd_bim_documents for select to authenticated using(sxd_bim_document_private.project_access(project_id));
create policy sxd_documents_write on public.sxd_bim_documents for all to authenticated using(sxd_bim_document_private.project_access(project_id,true)) with check(sxd_bim_document_private.project_access(project_id,true));
create policy sxd_versions_read on public.sxd_bim_document_versions for select to authenticated using(exists(select 1 from public.sxd_bim_documents d where d.id=document_id));
create policy sxd_versions_write on public.sxd_bim_document_versions for all to authenticated using(exists(select 1 from public.sxd_bim_documents d where d.id=document_id and sxd_bim_document_private.project_access(d.project_id,true))) with check(exists(select 1 from public.sxd_bim_documents d where d.id=document_id and sxd_bim_document_private.project_access(d.project_id,true)));
create policy sxd_tasks_read on public.sxd_bim_workspace_tasks for select to authenticated using(sxd_bim_document_private.project_access(project_id));
create policy sxd_tasks_write on public.sxd_bim_workspace_tasks for all to authenticated using(sxd_bim_document_private.project_access(project_id,true)) with check(sxd_bim_document_private.project_access(project_id,true));
create function public.sxd_bim_workspace(p_target text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects;u public.profiles;o uuid;b public.sxd_bim_projects;
begin
 select * into u from public.profiles where id=auth.uid() and is_active;
 select * into p from public.projects where id=p_target;
 if u.id is null or p.id is null or not public.app_has_scope(p.province_code,p.department) then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into public.sxd_bim_organizations(name,province_id,department) values(p.department,p.province_code,p.department)
 on conflict(province_id,department) do update set name=excluded.name returning id into o;
 insert into public.sxd_bim_projects(target_project_id,name,owner_id,organization_id) values(p.id,p.title,u.id,o)
 on conflict(target_project_id) do update set name=excluded.name returning * into b;
 return jsonb_build_object('id',b.id,'organizationId',o,'targetProjectId',p.id);
end $$;
revoke all on function public.sxd_bim_workspace(text) from public,anon;
grant execute on function public.sxd_bim_workspace(text) to authenticated;
