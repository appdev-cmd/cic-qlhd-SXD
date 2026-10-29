-- Phân hệ BIM từ qa-si-xd: giữ dữ liệu theo dự án hiện hữu và RLS tỉnh/phòng ban.
begin;
create table public.bim_models (
 id text primary key, project_id text not null references public.projects(id),
 payload jsonb not null, status text not null check(status in ('uploaded','ready','archived')),
 revision integer not null default 1 check(revision>0)
);
create table public.bim_files (
 model_id text not null references public.bim_models(id), kind text not null check(kind in ('ifc','frag')),
 part integer not null check(part>=0 and part<200), data bytea not null check(octet_length(data)<=1048576),
 primary key(model_id,kind,part)
);
create table public.bim_elements (
 model_id text not null references public.bim_models(id), express_id integer not null,
 guid text, name text, category text, storey text, material text, payload jsonb not null,
 primary key(model_id,express_id)
);
create table public.bim_notes (
 id text primary key, model_id text not null references public.bim_models(id),
 kind text not null check(kind in ('view','issue')), payload jsonb not null,
 revision integer not null default 1 check(revision>0)
);
create table public.bim_events (
 id text primary key, project_id text not null references public.projects(id),
 model_id text not null references public.bim_models(id), payload jsonb not null
);
create index bim_project on public.bim_models(project_id,status);
create index bim_element_filter on public.bim_elements(model_id,category,storey,express_id);
create index bim_note_page on public.bim_notes(model_id,kind);
create index bim_event_project on public.bim_events(project_id,(payload->>'at') desc,id);

alter table public.bim_models enable row level security;
alter table public.bim_files enable row level security;
alter table public.bim_elements enable row level security;
alter table public.bim_notes enable row level security;
alter table public.bim_events enable row level security;
revoke all on public.bim_models,public.bim_files,public.bim_elements,public.bim_notes,public.bim_events from public,anon,authenticated;
grant select on public.bim_models,public.bim_elements,public.bim_notes,public.bim_events to authenticated;
grant select,insert,update on public.bim_models,public.bim_files,public.bim_elements,public.bim_notes to appraisal_backend;
grant select,insert on public.bim_events to appraisal_backend;

create policy bim_model_read on public.bim_models for select to authenticated
 using(exists(select 1 from public.projects p where p.id=project_id));
create policy bim_model_insert on public.bim_models for insert to appraisal_backend
 with check(exists(select 1 from public.projects p where p.id=project_id));
create policy bim_model_update on public.bim_models for update to appraisal_backend
 using(exists(select 1 from public.projects p where p.id=project_id))
 with check(exists(select 1 from public.projects p where p.id=project_id));

do $$ declare t text; begin
 foreach t in array array['bim_files','bim_elements','bim_notes'] loop
  execute format('create policy %I on public.%I for select to authenticated using(exists(select 1 from public.bim_models m where m.id=model_id))',t||'_read',t);
  execute format('create policy %I on public.%I for insert to appraisal_backend with check(exists(select 1 from public.bim_models m where m.id=model_id))',t||'_insert',t);
  execute format('create policy %I on public.%I for update to appraisal_backend using(exists(select 1 from public.bim_models m where m.id=model_id)) with check(exists(select 1 from public.bim_models m where m.id=model_id))',t||'_update',t);
 end loop;
end $$;
create policy bim_event_read on public.bim_events for select to authenticated
 using(exists(select 1 from public.projects p where p.id=project_id));
create policy bim_event_insert on public.bim_events for insert to appraisal_backend
 with check(exists(select 1 from public.bim_models m where m.id=bim_events.model_id and m.project_id=bim_events.project_id));

-- Mirror human-readable BIM events to the existing project audit trail. No geometry or UUID is rendered.
create function public.bim_audit_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.projects p where p.id=new.project_id
     and public.app_has_scope(p.province_code,p.department)) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 insert into public.audit_logs(table_name,record_id,action,new_data,changed_fields,actor_id)
 values('projects',new.project_id,'update',jsonb_build_object('name',new.payload->>'modelName',
   'action',new.payload->>'action','detail',new.payload->>'detail','actor',new.payload->>'actor'),
   array['bim'],auth.uid()::text);
 return new;
end $$;
revoke all on function public.bim_audit_event() from public,anon,authenticated;
create trigger bim_event_audit after insert on public.bim_events for each row execute function public.bim_audit_event();
commit;
