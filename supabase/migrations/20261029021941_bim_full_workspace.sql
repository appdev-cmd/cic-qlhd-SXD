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

-- Upstream: 20261027090000_bim_core.sql
-- BIM module core (phase B1 of docs/plans/KE_HOACH_PHAN_HE_BIM_VA_AI_HO_TRO_20261026.md).
-- Clean baseline of the cic-hud BIM core: models and their versions, extracted elements, conversion queue, project
-- composition settings, usage counters, the private `bim-models` bucket and the RPCs the ported client calls.
-- Table, column and RPC names are kept from cic-hud so the ported code runs unchanged; the cic-hud ERP references
-- (du_an, hang_muc_cong_trinh, can_access_project, has_permission, is_admin, HUD demo filters) are replaced by
-- BuildSIA project access: sxd_bim_document_private.project_access (members, write roles) and project ownership/managers.
-- Fixes carried from the cic-hud review: retry resets so_lan_thu to 0 (NOT NULL column), soft-deleted models are not
-- queued, a finished job clears ma_job, purge returns only file paths, no duplicate triggers or indexes.

create extension if not exists pg_trgm with schema extensions;
create schema if not exists bim_private;
revoke all on schema bim_private from public, anon;
grant usage on schema bim_private to authenticated, service_role;

-- ── Access ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Projects the caller can read / write, as arrays so policies evaluate them once per statement ((select ...)).
create function bim_private.readable_projects() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(p.id), '{}') from public.sxd_bim_projects p where sxd_bim_document_private.project_access(p.id)
$$;
create function bim_private.writable_projects() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(p.id), '{}') from public.sxd_bim_projects p where sxd_bim_document_private.project_access(p.id, true)
$$;
create function bim_private.can_write(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select sxd_bim_document_private.project_access(p_project, true)
$$;
-- Deleting and purging models: project owner, project manager or administrator of the project's organization.
create function bim_private.can_manage(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and sxd_bim_document_private.project_access(p_project) and (
    exists (select 1 from public.sxd_bim_projects p where p.id = p_project and p.owner_id = auth.uid())
    or exists (select 1 from public.sxd_bim_project_members m
                where m.project_id = p_project and m.user_id = auth.uid() and m.role = 'manager')
    or exists (select 1 from public.sxd_bim_project_profiles a
                where a.project_id = p_project and sxd_bim_appraisal_private.org_access(a.organization_id, true)))
$$;
-- Storage paths carry the project id as text in the second folder.
create function bim_private.readable_project_texts() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id::text), '{}') from unnest(bim_private.readable_projects()) id
$$;
create function bim_private.writable_project_texts() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id::text), '{}') from unnest(bim_private.writable_projects()) id
$$;
revoke all on all functions in schema bim_private from public, anon;
grant execute on all functions in schema bim_private to authenticated, service_role;

-- ── Models ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  -- Work item (hạng mục) within the project; free text until the ACC-style project structure exists.
  work_id text,
  file_name text not null check (length(file_name) between 1 and 300),
  file_size bigint check (file_size is null or file_size >= 0),
  ifc_path text,
  frag_path text,
  properties_path text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'error')),
  discipline text not null default 'TOAN_THE' check (discipline in (
    'TOAN_THE', 'KIEN_TRUC', 'KET_CAU', 'MEP', 'DIEN', 'CAP_THOAT_NUOC', 'PCCC', 'HA_TANG',
    'CAU', 'HAM', 'NHA_GA', 'DUONG_RAY', 'THONG_TIN_TIN_HIEU', 'KHAC')),
  element_count integer not null default 0,
  error_message text,
  uploaded_by text,
  file_hash text check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$'),
  tien_do smallint not null default 0 check (tien_do between 0 and 100),
  ifc_schema text,
  phan_mem_tao text,
  phien_ban integer not null default 1 check (phien_ban >= 1),
  model_goc_id uuid references public.bim_models(id) on delete set null,
  model_root_id uuid,
  ghi_chu_phien_ban text,
  heartbeat_at timestamptz,
  so_lan_thu integer not null default 0,
  ma_job uuid,
  loai_loi text check (loai_loi is null or loai_loi in ('tam_thoi', 'vinh_vien', 'het_lan_thu')),
  ngung_thu_luc timestamptz,
  thu_lai_sau timestamptz,
  chi_so_xu_ly jsonb,
  toa_do_offset jsonb,
  -- ISO 19650 state is managed by the document library CDE flow (phase B4); kept here for the ported client.
  trang_thai_cde text not null default 'wip' check (trang_thai_cde in ('wip', 'shared', 'cho_phat_hanh', 'published', 'archived')),
  ma_phu_hop text,
  georef jsonb,
  canh_bao jsonb,
  thong_tin_mo_rong jsonb,
  chat_luong jsonb,
  nguoi_tao_uid uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.bim_models.model_goc_id is 'Phiên bản liền trước; model_root_id là bản đầu của chuỗi phiên bản.';
comment on column public.bim_models.loai_loi is 'tam_thoi: thử lại sau thu_lai_sau; vinh_vien: lỗi tệp; het_lan_thu: hết số lần thử.';
comment on column public.bim_models.toa_do_offset is 'Dịch mô hình khi ghép: {"x":0,"y":0,"z":0} (mét).';
create index bim_models_project on public.bim_models (project_id, created_at desc);
create index bim_models_previous on public.bim_models (model_goc_id);
create index bim_models_queue on public.bim_models (status, created_at) where status in ('uploaded', 'processing');
create unique index bim_models_project_hash on public.bim_models (project_id, file_hash)
  where deleted_at is null and file_hash is not null;
create unique index bim_models_root_version on public.bim_models (model_root_id, phien_ban) where deleted_at is null;

create function bim_private.models_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.nguoi_tao_uid := auth.uid();
    if new.model_goc_id is not null then
      select coalesce(p.model_root_id, p.id) into new.model_root_id from public.bim_models p where p.id = new.model_goc_id;
    end if;
    new.model_root_id := coalesce(new.model_root_id, new.id);
  else
    new.nguoi_tao_uid := old.nguoi_tao_uid;
    new.model_root_id := old.model_root_id;
    if new.status = 'uploaded' and old.status = 'error' then new.so_lan_thu := 0; end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger bim_models_before_write before insert or update on public.bim_models
  for each row execute function bim_private.models_before_write();
-- Removing a version keeps the chain connected.
create function bim_private.models_relink_versions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.bim_models set model_goc_id = old.model_goc_id where model_goc_id = old.id;
  return old;
end $$;
create trigger bim_models_relink_versions before delete on public.bim_models
  for each row execute function bim_private.models_relink_versions();

alter table public.bim_models enable row level security;
-- Writes go through the SECURITY DEFINER RPCs below; the converter uses the service role.
create policy bim_models_read on public.bim_models for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]) and deleted_at is null);
create policy bim_models_read_deleted on public.bim_models for select to authenticated
  using (deleted_at is not null and bim_private.can_manage(project_id));
revoke all on public.bim_models from anon, authenticated;
grant select on public.bim_models to authenticated;
grant all on public.bim_models to service_role;

-- ── Elements ────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_elements (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.bim_models(id) on delete cascade,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  express_id integer not null,
  global_id varchar(22) not null,
  ten_cau_kien text,
  loai_cau_kien text not null,
  phan_doan_tang text,
  parent_express_id integer,
  vat_lieu text,
  the_tich_be_tong double precision,
  dien_tich double precision,
  dien_tich_van_khuon double precision,
  chieu_dai double precision,
  trong_luong double precision,
  nguon_khoi_luong text check (nguon_khoi_luong is null or nguon_khoi_luong in ('qto', 'hinh_hoc')),
  thuoc_tinh jsonb not null default '{}',
  hash_noi_dung text,
  created_at timestamptz not null default now(),
  unique (model_id, express_id)
);
comment on column public.bim_elements.thuoc_tinh is 'Thuộc tính IFC: {thong_tin, psets, qto, kieu:{ten,loai,psets}, phan_loai}.';
create index bim_elements_project on public.bim_elements (project_id);
create index bim_elements_model_guid on public.bim_elements (model_id, global_id);
create index bim_elements_model_group on public.bim_elements (model_id, loai_cau_kien, vat_lieu, phan_doan_tang);
create index bim_elements_model_floor on public.bim_elements (model_id, phan_doan_tang);
create index bim_elements_model_material on public.bim_elements (model_id, vat_lieu);
create index bim_elements_model_name on public.bim_elements (model_id, ten_cau_kien, id);
create index bim_elements_name_trgm on public.bim_elements using gin (ten_cau_kien extensions.gin_trgm_ops);
create index bim_elements_guid_trgm on public.bim_elements using gin ((global_id::text) extensions.gin_trgm_ops);
create index bim_elements_material_trgm on public.bim_elements using gin (vat_lieu extensions.gin_trgm_ops);
alter table public.bim_elements enable row level security;
create policy bim_elements_read on public.bim_elements for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_elements from anon, authenticated;
grant select on public.bim_elements to authenticated;
grant all on public.bim_elements to service_role;

-- Converter output is staged per job and swapped in one transaction (bim_swap_model_elements).
create table public.bim_elements_staging (
  job_id uuid not null,
  model_id uuid not null,
  project_id uuid not null,
  express_id integer not null,
  global_id varchar(22) not null,
  ten_cau_kien text,
  loai_cau_kien text not null,
  phan_doan_tang text,
  parent_express_id integer,
  vat_lieu text,
  the_tich_be_tong double precision,
  dien_tich double precision,
  dien_tich_van_khuon double precision,
  chieu_dai double precision,
  trong_luong double precision,
  nguon_khoi_luong text,
  thuoc_tinh jsonb not null default '{}',
  hash_noi_dung text,
  created_at timestamptz not null default now(),
  primary key (job_id, express_id)
);
create index bim_elements_staging_model on public.bim_elements_staging (model_id, job_id);
alter table public.bim_elements_staging enable row level security;
revoke all on public.bim_elements_staging from public, anon, authenticated;
grant select, insert, delete on public.bim_elements_staging to service_role;

-- Live quantity summary per model, element type, material and storey.
create view public.v_bim_khoi_luong_tong_hop with (security_invoker = true) as
select model_id, project_id, loai_cau_kien,
       coalesce(vat_lieu, '') as vat_lieu, coalesce(phan_doan_tang, '') as phan_doan_tang,
       count(*)::integer as so_luong,
       sum(the_tich_be_tong) as tong_the_tich, sum(dien_tich) as tong_dien_tich,
       sum(chieu_dai) as tong_chieu_dai, sum(trong_luong) as tong_trong_luong,
       bool_or(nguon_khoi_luong = 'hinh_hoc') as co_uoc_tinh_hinh_hoc,
       count(*) filter (where the_tich_be_tong is null or the_tich_be_tong < 0)::integer as thieu_the_tich,
       count(*) filter (where dien_tich is null or dien_tich < 0)::integer as thieu_dien_tich,
       count(*) filter (where chieu_dai is null or chieu_dai < 0)::integer as thieu_chieu_dai,
       count(*) filter (where trong_luong is null or trong_luong < 0)::integer as thieu_trong_luong
from public.bim_elements
group by model_id, project_id, loai_cau_kien, coalesce(vat_lieu, ''), coalesce(phan_doan_tang, '');
revoke all on public.v_bim_khoi_luong_tong_hop from public, anon;
grant select on public.v_bim_khoi_luong_tong_hop to authenticated, service_role;

-- ── Project settings and usage ──────────────────────────────────────────────────────────────────────────────────
create table public.bim_project_settings (
  project_id uuid primary key references public.sxd_bim_projects(id) on delete cascade,
  coord_offset jsonb not null default '{"x": 0, "y": 0, "z": 0}',
  to_hop_mac_dinh jsonb,
  updated_at timestamptz not null default now()
);
comment on column public.bim_project_settings.to_hop_mac_dinh is
  'Tổ hợp mô hình mặc định: {"active": "<id mô hình chính>", "overlay": ["<id>"], "ghi_chu": "...", "cap_nhat_boi": "..."}';
alter table public.bim_project_settings enable row level security;
create policy bim_project_settings_read on public.bim_project_settings for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_project_settings_insert on public.bim_project_settings for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_project_settings_update on public.bim_project_settings for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_project_settings from anon, authenticated;
grant select, insert, update on public.bim_project_settings to authenticated;

create table public.bim_su_dung (
  ngay date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  cong_cu text not null check (length(cong_cu) between 1 and 60),
  nguoi_dung uuid not null default auth.uid(),
  so_lan integer not null default 1 check (so_lan > 0),
  primary key (ngay, project_id, cong_cu, nguoi_dung)
);
alter table public.bim_su_dung enable row level security;
create policy bim_su_dung_read on public.bim_su_dung for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_su_dung from anon, authenticated;
grant select on public.bim_su_dung to authenticated;
create function public.bim_field_track(p_project uuid, p_tool text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not sxd_bim_document_private.project_access(p_project) then raise exception 'ACCESS_DENIED'; end if;
  insert into public.bim_su_dung (project_id, cong_cu, nguoi_dung) values (p_project, left(p_tool, 60), auth.uid())
  on conflict (ngay, project_id, cong_cu, nguoi_dung) do update set so_lan = public.bim_su_dung.so_lan + 1;
end $$;

-- ── Model lifecycle RPCs ────────────────────────────────────────────────────────────────────────────────────────
create function public.bim_register_model_upload(
  p_project uuid, p_ifc_path text, p_file_name text, p_file_size bigint, p_file_hash text,
  p_discipline text default 'TOAN_THE', p_work text default null, p_previous_model uuid default null,
  p_version_note text default null, p_uploaded_by text default null)
returns public.bim_models language plpgsql security definer set search_path = '' as $$
declare v_prev public.bim_models; v_dup public.bim_models; v_root uuid; v_version integer := 1; v_row public.bim_models;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if not bim_private.can_write(p_project) then raise exception 'Không có quyền tải mô hình lên dự án này'; end if;
  if p_ifc_path is null or p_ifc_path not like 'models/' || p_project::text || '/%' then
    raise exception 'Đường dẫn tệp không thuộc thư mục mô hình của dự án';
  end if;
  if coalesce(p_file_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Thiếu mã băm SHA-256 của tệp'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'bim-models' and o.name = p_ifc_path
                   and (o.owner_id is null or o.owner_id = auth.uid()::text)) then
    raise exception 'Không tìm thấy tệp đã tải lên (%). Hãy tải lại.', p_ifc_path;
  end if;
  perform pg_advisory_xact_lock(hashtext('bim_models:' || p_project::text));
  select * into v_dup from public.bim_models
   where project_id = p_project and file_hash = p_file_hash and deleted_at is null limit 1;
  if v_dup.id is not null then
    raise exception using errcode = 'unique_violation',
      message = format('File này đã được tải lên trước đó (mô hình "%s", phiên bản %s).', v_dup.file_name, v_dup.phien_ban),
      detail = v_dup.id::text;
  end if;
  if p_previous_model is not null then
    select * into v_prev from public.bim_models where id = p_previous_model;
    if v_prev.id is null or v_prev.project_id <> p_project or v_prev.deleted_at is not null then
      raise exception 'Phiên bản trước không hợp lệ hoặc đã bị xóa';
    end if;
    v_root := coalesce(v_prev.model_root_id, v_prev.id);
    select coalesce(max(m.phien_ban), 0) + 1 into v_version from public.bim_models m where m.model_root_id = v_root;
  end if;
  insert into public.bim_models (project_id, work_id, file_name, file_size, ifc_path, status, discipline, uploaded_by,
    file_hash, phien_ban, model_goc_id, ghi_chu_phien_ban)
  values (p_project, nullif(btrim(coalesce(p_work, '')), ''), p_file_name, p_file_size, p_ifc_path, 'uploaded',
    coalesce(v_prev.discipline, nullif(p_discipline, ''), 'TOAN_THE'), left(p_uploaded_by, 200), p_file_hash, v_version,
    v_prev.id, nullif(btrim(coalesce(p_version_note, '')), ''))
  returning * into v_row;
  return v_row;
end $$;

create function public.bim_delete_model(p_id uuid) returns public.bim_models
language plpgsql security definer set search_path = '' as $$
declare m public.bim_models;
begin
  select * into m from public.bim_models where id = p_id for update;
  if m.id is null or not bim_private.can_manage(m.project_id) then raise exception 'Không có quyền xóa mô hình này'; end if;
  if m.deleted_at is not null then return m; end if;
  update public.bim_models set deleted_at = now(), deleted_by = auth.uid() where id = p_id returning * into m;
  return m;
end $$;

create function public.bim_restore_model(p_id uuid) returns public.bim_models
language plpgsql security definer set search_path = '' as $$
declare m public.bim_models; v_conflict public.bim_models;
begin
  select * into m from public.bim_models where id = p_id for update;
  if m.id is null or not bim_private.can_manage(m.project_id) then raise exception 'Không có quyền khôi phục mô hình này'; end if;
  if m.deleted_at is null then return m; end if;
  select * into v_conflict from public.bim_models x
   where x.id <> m.id and x.deleted_at is null
     and ((m.file_hash is not null and x.project_id = m.project_id and x.file_hash = m.file_hash)
       or (x.model_root_id = m.model_root_id and x.phien_ban = m.phien_ban))
   limit 1;
  if v_conflict.id is not null then
    raise exception 'Không khôi phục được: mô hình "%" (phiên bản %) đang dùng cùng tệp hoặc cùng số phiên bản.',
      v_conflict.file_name, v_conflict.phien_ban;
  end if;
  update public.bim_models set deleted_at = null, deleted_by = null where id = p_id returning * into m;
  return m;
end $$;

create function public.bim_retry_model(p_id uuid) returns public.bim_models
language plpgsql security definer set search_path = '' as $$
declare m public.bim_models;
begin
  select * into m from public.bim_models where id = p_id for update;
  if m.id is null or not bim_private.can_write(m.project_id) then raise exception 'Không có quyền xử lý lại mô hình này'; end if;
  if m.deleted_at is not null then raise exception 'Mô hình đã bị xóa; hãy khôi phục trước khi xử lý lại'; end if;
  if m.ifc_path is null then raise exception 'Tệp IFC gốc không còn trên máy chủ. Hãy xóa mô hình này và tải lại tệp IFC.'; end if;
  if m.status = 'processing' then raise exception 'Mô hình đang được chuyển đổi'; end if;
  update public.bim_models set status = 'uploaded', tien_do = 0, error_message = null, so_lan_thu = 0, loai_loi = null,
    ngung_thu_luc = null, thu_lai_sau = null, ma_job = null
   where id = p_id returning * into m;
  return m;
end $$;

create function public.bim_set_model_offset(p_id uuid, p_offset jsonb) returns public.bim_models
language plpgsql security definer set search_path = '' as $$
declare m public.bim_models; k text;
begin
  if p_offset is null or jsonb_typeof(p_offset) <> 'object' then raise exception 'Toạ độ dịch mô hình không hợp lệ'; end if;
  foreach k in array array['x', 'y', 'z'] loop
    if jsonb_typeof(p_offset -> k) is distinct from 'number' then raise exception 'Toạ độ dịch mô hình phải có x, y, z dạng số'; end if;
  end loop;
  select * into m from public.bim_models where id = p_id for update;
  if m.id is null or not bim_private.can_write(m.project_id) then raise exception 'Không có quyền đổi toạ độ mô hình này'; end if;
  update public.bim_models
     set toa_do_offset = jsonb_build_object('x', p_offset -> 'x', 'y', p_offset -> 'y', 'z', p_offset -> 'z')
   where id = p_id returning * into m;
  return m;
end $$;

-- Permanent removal of a soft-deleted model; the caller then removes the returned files from Storage.
create function public.bim_purge_model(p_id uuid) returns table (ifc_path text, frag_path text, properties_path text)
language plpgsql security definer set search_path = '' as $$
declare m public.bim_models;
begin
  select * into m from public.bim_models where id = p_id for update;
  if m.id is null or not bim_private.can_manage(m.project_id) then raise exception 'Không có quyền xóa vĩnh viễn mô hình này'; end if;
  if m.deleted_at is null then raise exception 'Chỉ xóa vĩnh viễn mô hình đã ở thùng rác'; end if;
  delete from public.bim_models where id = p_id;
  return query select m.ifc_path, m.frag_path, m.properties_path;
end $$;

-- Converter: swap staged elements in and mark the model ready (service role only).
create function public.bim_swap_model_elements(p_model uuid, p_job uuid, p_patch jsonb) returns public.bim_models
language plpgsql security invoker set search_path = '' as $$
declare m public.bim_models; v_staged integer; v_expected integer := nullif(p_patch ->> 'element_count', '')::integer;
begin
  select * into m from public.bim_models where id = p_model for update;
  if m.id is null then raise exception 'Không tìm thấy mô hình %', p_model; end if;
  if m.status <> 'processing' or m.ma_job is distinct from p_job then
    raise exception 'Job % không còn giữ mô hình % (trạng thái %)', p_job, p_model, m.status;
  end if;
  select count(*) into v_staged from public.bim_elements_staging where job_id = p_job and model_id = p_model;
  if v_expected is null or v_staged <> v_expected then
    raise exception 'Số cấu kiện tạm (%) khác số đã trích (%)', v_staged, v_expected;
  end if;
  insert into public.bim_elements (model_id, project_id, express_id, global_id, ten_cau_kien, loai_cau_kien, phan_doan_tang,
    parent_express_id, vat_lieu, the_tich_be_tong, dien_tich, dien_tich_van_khuon, chieu_dai, trong_luong,
    nguon_khoi_luong, thuoc_tinh, hash_noi_dung)
  select s.model_id, m.project_id, s.express_id, s.global_id, s.ten_cau_kien, s.loai_cau_kien, s.phan_doan_tang,
         s.parent_express_id, s.vat_lieu, s.the_tich_be_tong, s.dien_tich, s.dien_tich_van_khuon, s.chieu_dai, s.trong_luong,
         case when s.nguon_khoi_luong in ('qto', 'hinh_hoc') then s.nguon_khoi_luong end, s.thuoc_tinh, s.hash_noi_dung
    from public.bim_elements_staging s where s.job_id = p_job and s.model_id = p_model
  on conflict (model_id, express_id) do update set
    project_id = excluded.project_id, global_id = excluded.global_id, ten_cau_kien = excluded.ten_cau_kien,
    loai_cau_kien = excluded.loai_cau_kien, phan_doan_tang = excluded.phan_doan_tang,
    parent_express_id = excluded.parent_express_id, vat_lieu = excluded.vat_lieu,
    the_tich_be_tong = excluded.the_tich_be_tong, dien_tich = excluded.dien_tich,
    dien_tich_van_khuon = excluded.dien_tich_van_khuon, chieu_dai = excluded.chieu_dai,
    trong_luong = excluded.trong_luong, nguon_khoi_luong = excluded.nguon_khoi_luong,
    thuoc_tinh = excluded.thuoc_tinh, hash_noi_dung = excluded.hash_noi_dung;
  delete from public.bim_elements e where e.model_id = p_model
     and not exists (select 1 from public.bim_elements_staging s
                      where s.job_id = p_job and s.model_id = p_model and s.express_id = e.express_id);
  delete from public.bim_elements_staging where model_id = p_model;
  update public.bim_models set
    status = 'ready', frag_path = coalesce(p_patch ->> 'frag_path', frag_path), element_count = v_staged,
    ifc_schema = p_patch ->> 'ifc_schema', phan_mem_tao = p_patch ->> 'phan_mem_tao',
    georef = p_patch -> 'georef', canh_bao = p_patch -> 'canh_bao', chi_so_xu_ly = p_patch -> 'chi_so_xu_ly',
    tien_do = 100, error_message = null, loai_loi = null, ngung_thu_luc = null, thu_lai_sau = null,
    ma_job = null, heartbeat_at = now()
  where id = p_model returning * into m;
  return m;
end $$;

-- Queue position of each waiting model the caller can see.
create function public.bim_hang_doi() returns table (model_id uuid, vi_tri integer, tong_cho integer, dang_xu_ly integer)
language sql stable security definer set search_path = '' as $$
  with q as (
    select m.id, m.project_id, row_number() over (order by m.created_at, m.id)::integer as vi_tri,
           count(*) over ()::integer as tong_cho
      from public.bim_models m
     where m.status = 'uploaded' and m.deleted_at is null and (m.thu_lai_sau is null or m.thu_lai_sau <= now())
  ), p as (select count(*)::integer as dang_xu_ly from public.bim_models where status = 'processing' and deleted_at is null)
  select q.id, q.vi_tri, q.tong_cho, p.dang_xu_ly from q cross join p
   where q.project_id = any (bim_private.readable_projects())
$$;

-- ── Element queries (filters, smart sets, version comparison, size statistics) ──────────────────────────────────
create function public.bim_so(p text) returns numeric
language sql immutable set search_path = '' as $$
  select case when p ~ '^\s*-?[0-9]+([.,][0-9]+)?([eE][-+]?[0-9]+)?\s*$' then replace(trim(p), ',', '.')::numeric end
$$;

-- Field reference: a column name or a JSON path into thuoc_tinh. Only whitelisted columns are accepted.
create function public.bim_bieu_thuc_truong(p_truong jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare v_cot text;
begin
  if jsonb_typeof(p_truong) = 'array' then
    return format('(e.thuoc_tinh #>> %L::text[])', array(select jsonb_array_elements_text(p_truong))::text);
  end if;
  v_cot := p_truong #>> '{}';
  if v_cot is null or v_cot not in ('loai_cau_kien', 'vat_lieu', 'phan_doan_tang', 'ten_cau_kien', 'global_id',
      'the_tich_be_tong', 'dien_tich', 'chieu_dai', 'trong_luong', 'dien_tich_van_khuon') then
    raise exception 'Trường không hợp lệ: %', v_cot;
  end if;
  return format('(e.%I::text)', v_cot);
end $$;

create function public.bim_bieu_thuc_dieu_kien(c jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := public.bim_bieu_thuc_truong(c -> 'truong');
  op text := c ->> 'toan_tu';
  val text := coalesce(c ->> 'gia_tri', '');
  pat text := '%' || replace(replace(replace(coalesce(c ->> 'gia_tri', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_list text[];
begin
  if op = 'trong' then
    v_list := array(select lower(btrim(x)) from unnest(string_to_array(val, '|')) x where btrim(x) <> '');
    return format('lower(%s) = any (%L::text[])', v, v_list::text);
  end if;
  return case op
    when 'co' then format('coalesce(%s, '''') <> ''''', v)
    when 'khong_co' then format('coalesce(%s, '''') = ''''', v)
    when '=' then format('lower(%s) = lower(%L)', v, val)
    when '!=' then format('lower(coalesce(%s, '''')) <> lower(%L)', v, val)
    when 'chua' then format('%s ilike %L', v, pat)
    when 'khong_chua' then format('coalesce(%s, '''') not ilike %L', v, pat)
    when '>' then format('public.bim_so(%s) > public.bim_so(%L)', v, val)
    when '>=' then format('public.bim_so(%s) >= public.bim_so(%L)', v, val)
    when '<' then format('public.bim_so(%s) < public.bim_so(%L)', v, val)
    when '<=' then format('public.bim_so(%s) <= public.bim_so(%L)', v, val)
    when 'khop_mau' then format('coalesce(%s, '''') ~* %L', v, val)
    else null
  end;
end $$;

-- Condition groups: [[c1 and c2] or [c3]] (a single group may be passed as a flat array).
create function public.bim_bieu_thuc_bo_chon(p jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare v_nhom jsonb := p; g jsonb; c jsonb; v_and text[]; v_or text[] := '{}'; v_expr text;
begin
  if v_nhom is null or jsonb_typeof(v_nhom) <> 'array' or jsonb_array_length(v_nhom) = 0 then return 'true'; end if;
  if jsonb_typeof(v_nhom -> 0) = 'object' then v_nhom := jsonb_build_array(v_nhom); end if;
  for g in select value from jsonb_array_elements(v_nhom) loop
    if jsonb_typeof(g) <> 'array' then raise exception 'Nhóm điều kiện không hợp lệ'; end if;
    v_and := '{}';
    for c in select value from jsonb_array_elements(g) loop
      v_expr := public.bim_bieu_thuc_dieu_kien(c);
      if v_expr is null then raise exception 'Toán tử không hợp lệ: %', c ->> 'toan_tu'; end if;
      v_and := v_and || ('(' || v_expr || ')');
    end loop;
    if cardinality(v_and) > 0 then v_or := v_or || ('(' || array_to_string(v_and, ' and ') || ')'); end if;
  end loop;
  if cardinality(v_or) = 0 then return 'true'; end if;
  return array_to_string(v_or, ' or ');
end $$;

-- The query functions run as the caller, so bim_elements RLS limits them to readable projects.
create function public.bim_loc_cau_kien(p_model_ids uuid[], p_dieu_kien jsonb, p_gioi_han integer default 100000)
returns table (model_id uuid, express_id integer, global_id text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  return query execute
    'select e.model_id, e.express_id, e.global_id::text from public.bim_elements e where e.model_id = any ($1) and ('
    || public.bim_bieu_thuc_bo_chon(p_dieu_kien) || ') order by e.model_id, e.express_id limit $2'
    using p_model_ids, least(greatest(coalesce(p_gioi_han, 100000), 1), 200000);
end $$;

create function public.bim_gia_tri_theo_truong(p_model_ids uuid[], p_truong jsonb)
returns table (model_id uuid, express_id integer, gia_tri text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  return query execute
    'select e.model_id, e.express_id, ' || public.bim_bieu_thuc_truong(p_truong)
    || ' from public.bim_elements e where e.model_id = any ($1) order by e.model_id, e.express_id limit 200000'
    using p_model_ids;
end $$;

create function public.bim_danh_muc_truong(p_model_ids uuid[]) returns table (duong_dan jsonb, so_luong integer, vi_du text)
language sql stable security invoker set search_path = '' as $$
  with mau as (
    select e.thuoc_tinh from public.bim_elements e where e.model_id = any (p_model_ids) limit 20000
  ), pset as (
    select jsonb_build_array('psets', ps.key, pr.key) as duong_dan, pr.value #>> '{}' as gia_tri
      from mau,
           jsonb_each(case when jsonb_typeof(mau.thuoc_tinh -> 'psets') = 'object' then mau.thuoc_tinh -> 'psets' else '{}'::jsonb end) ps,
           jsonb_each(case when jsonb_typeof(ps.value) = 'object' then ps.value else '{}'::jsonb end) pr
     where jsonb_typeof(pr.value) in ('string', 'number', 'boolean')
  ), khac as (
    select jsonb_build_array(g.nhom, kv.key) as duong_dan, kv.value #>> '{}' as gia_tri
      from mau, (values ('kieu'), ('thong_tin')) g(nhom),
           jsonb_each(case when jsonb_typeof(mau.thuoc_tinh -> g.nhom) = 'object' then mau.thuoc_tinh -> g.nhom else '{}'::jsonb end) kv
     where jsonb_typeof(kv.value) in ('string', 'number', 'boolean')
  )
  select duong_dan, count(*)::integer, min(gia_tri)
    from (select * from pset union all select * from khac) t
   group by duong_dan order by count(*) desc limit 1500
$$;

create function public.bim_gia_tri_pho_bien(p_model_ids uuid[], p_truong jsonb) returns table (gia_tri text, so_luong integer)
language plpgsql stable security invoker set search_path = '' as $$
begin
  return query execute
    'select v, count(*)::integer from (select ' || public.bim_bieu_thuc_truong(p_truong)
    || ' as v from public.bim_elements e where e.model_id = any ($1)) t where v is not null and v <> '''' group by v order by count(*) desc, v limit 60'
    using p_model_ids;
end $$;

-- Element changes between two versions, matched by IFC GlobalId and content hash.
create function public.bim_so_sanh_phien_ban(p_model_cu uuid, p_model_moi uuid)
returns table (global_id text, trang_thai text, ten_cau_kien text, loai_cau_kien text, express_id_cu integer,
  express_id_moi integer, the_tich_cu double precision, the_tich_moi double precision)
language sql stable security invoker set search_path = '' as $$
  select coalesce(m.global_id, c.global_id)::text,
         case when c.global_id is null then 'them_moi' when m.global_id is null then 'da_xoa' else 'da_sua' end,
         coalesce(m.ten_cau_kien, c.ten_cau_kien), coalesce(m.loai_cau_kien, c.loai_cau_kien),
         c.express_id, m.express_id, c.the_tich_be_tong, m.the_tich_be_tong
    from (select * from public.bim_elements where model_id = p_model_cu) c
    full outer join (select * from public.bim_elements where model_id = p_model_moi) m on m.global_id = c.global_id
   where c.global_id is null or m.global_id is null
      or coalesce(c.hash_noi_dung, '') is distinct from coalesce(m.hash_noi_dung, '')
$$;

create function public.bim_version_diff_summary(p_model_cu uuid, p_model_moi uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with d as (select * from public.bim_so_sanh_phien_ban(p_model_cu, p_model_moi)),
  g as (
    select d.trang_thai, d.loai_cau_kien, count(*) as so_luong,
           sum(case when d.trang_thai = 'da_xoa' then coalesce(d.the_tich_cu, 0) else coalesce(d.the_tich_moi, 0) end) as the_tich,
           sum(coalesce(d.the_tich_moi, 0) - coalesce(d.the_tich_cu, 0)) as chenh_lech,
           row_number() over (partition by d.trang_thai order by count(*) desc, d.loai_cau_kien) as hang
      from d group by d.trang_thai, d.loai_cau_kien
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'them_moi', (select count(*) from d where trang_thai = 'them_moi'),
      'da_xoa', (select count(*) from d where trang_thai = 'da_xoa'),
      'da_sua', (select count(*) from d where trang_thai = 'da_sua')),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('trang_thai', trang_thai, 'loai_cau_kien', loai_cau_kien,
        'so_luong', so_luong, 'the_tich', the_tich, 'chenh_lech', chenh_lech) order by trang_thai, hang) from g where hang <= 15), '[]'),
    'samples', coalesce((select jsonb_agg(to_jsonb(s)) from (select trang_thai, ten_cau_kien, loai_cau_kien from d limit 20) s), '[]'))
$$;

-- Element counts by storey and section size (e.g. columns 400x400), read from IFC dimensions or names.
create function public.bim_thong_ke_kich_thuoc(
  p_project_id uuid default null, p_model_id uuid default null, p_model_ids uuid[] default null,
  p_loai_cau_kien text default null, p_phan_doan_tang text default null, p_vat_lieu text default null,
  p_group_by text default 'tang_va_kich_thuoc')
returns table (phan_doan_tang text, kich_thuoc text, so_luong bigint,
  tong_the_tich double precision, tong_chieu_dai double precision, tong_dien_tich double precision)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_dims text := '([0-9]+)\s*[xX*]\s*(?:h|H)?([0-9]+)(?:\s*[xX*]\s*([0-9]+))?';
  v_dia text := '(?:D|phi|Ø|Φ|dia|diameter)\s*([0-9]+)';
begin
  if p_project_id is null and p_model_id is null and (p_model_ids is null or cardinality(p_model_ids) = 0) then
    raise exception 'Cần chỉ rõ dự án hoặc mô hình để thống kê';
  end if;
  return query
  with filtered as (
    select e.phan_doan_tang as tang, e.the_tich_be_tong, e.chieu_dai, e.dien_tich, coalesce(e.ten_cau_kien, '') as ten,
           coalesce(e.thuoc_tinh -> 'kieu' -> 'psets' -> 'Dimensions', '{}'::jsonb) as kd,
           coalesce(e.thuoc_tinh -> 'psets' -> 'Dimensions', '{}'::jsonb) as pd,
           coalesce(e.thuoc_tinh -> 'kieu' ->> 'ten', '') as kieu_ten
      from public.bim_elements e
     where (p_project_id is null or e.project_id = p_project_id)
       and (p_model_id is null or e.model_id = p_model_id)
       and (p_model_ids is null or e.model_id = any (p_model_ids))
       and (p_loai_cau_kien is null or e.loai_cau_kien = p_loai_cau_kien or e.loai_cau_kien ilike '%' || p_loai_cau_kien || '%'
         or (p_loai_cau_kien = 'IFCWALL' and e.loai_cau_kien in ('IFCWALL', 'IFCWALLSTANDARDCASE'))
         or (p_loai_cau_kien = 'IFCSTAIR' and e.loai_cau_kien in ('IFCSTAIR', 'IFCSTAIRFLIGHT'))
         or (p_loai_cau_kien = 'IFCBEAM' and e.loai_cau_kien in ('IFCBEAM', 'IFCMEMBER')))
       and (p_phan_doan_tang is null or e.phan_doan_tang ilike '%' || p_phan_doan_tang || '%')
       and (p_vat_lieu is null or e.vat_lieu ilike '%' || p_vat_lieu || '%')
  ), num as (
    select f.*,
           round(public.bim_so(coalesce(f.kd ->> 'b', f.kd ->> 'B', f.kd ->> 'Width'))) as kb,
           round(public.bim_so(coalesce(f.kd ->> 'h', f.kd ->> 'H', f.kd ->> 'Height', f.kd ->> 'Ht'))) as kh,
           round(public.bim_so(coalesce(f.kd ->> 'D', f.kd ->> 'Diameter'))) as kdia,
           round(public.bim_so(f.kd ->> 'R')) as kr,
           round(public.bim_so(coalesce(f.pd ->> 'b', f.pd ->> 'B'))) as pb,
           round(public.bim_so(coalesce(f.pd ->> 'h', f.pd ->> 'H'))) as ph,
           round(public.bim_so(f.pd ->> 'D')) as pdia,
           regexp_match(f.kieu_ten, v_dims, 'i') as m_kieu, regexp_match(f.kieu_ten, v_dia, 'i') as d_kieu,
           regexp_match(f.ten, v_dims, 'i') as m_ten, regexp_match(f.ten, v_dia, 'i') as d_ten
      from filtered f
  ), extracted as (
    select n.tang, n.the_tich_be_tong, n.chieu_dai, n.dien_tich,
           case
             when p_group_by = 'ten_kieu' and n.kieu_ten <> '' then n.kieu_ten
             when n.kb is not null and n.kh is not null then n.kb::text || 'x' || n.kh::text
             when n.kdia is not null then 'D' || n.kdia::text
             when n.kr is not null then 'R' || n.kr::text
             when n.kb is not null and (n.kieu_ten ilike '%Square%' or n.ten ilike '%Square%') then n.kb::text || 'x' || n.kb::text
             when n.m_kieu is not null then n.m_kieu[1] || 'x' || n.m_kieu[2] || coalesce('x' || n.m_kieu[3], '')
             when n.d_kieu is not null then 'D' || n.d_kieu[1]
             when n.pb is not null and n.ph is not null then n.pb::text || 'x' || n.ph::text
             when n.pdia is not null then 'D' || n.pdia::text
             when n.m_ten is not null then n.m_ten[1] || 'x' || n.m_ten[2] || coalesce('x' || n.m_ten[3], '')
             when n.d_ten is not null then 'D' || n.d_ten[1]
             when n.kieu_ten <> '' then n.kieu_ten
             else 'Chưa xác định'
           end as v_kich_thuoc
      from num n
  )
  select (case when p_group_by = 'kich_thuoc' then 'Toàn công trình' else coalesce(x.tang, 'Không xác định tầng') end)::text,
         x.v_kich_thuoc, count(*)::bigint,
         round(coalesce(sum(x.the_tich_be_tong), 0)::numeric, 3)::double precision,
         round(coalesce(sum(x.chieu_dai), 0)::numeric, 2)::double precision,
         round(coalesce(sum(x.dien_tich), 0)::numeric, 2)::double precision
    from extracted x group by 1, 2 order by 1, 3 desc;
end $$;

revoke all on function
  public.bim_field_track(uuid, text),
  public.bim_register_model_upload(uuid, text, text, bigint, text, text, text, uuid, text, text),
  public.bim_delete_model(uuid), public.bim_restore_model(uuid), public.bim_retry_model(uuid),
  public.bim_set_model_offset(uuid, jsonb), public.bim_purge_model(uuid),
  public.bim_swap_model_elements(uuid, uuid, jsonb), public.bim_hang_doi(),
  public.bim_so(text), public.bim_bieu_thuc_truong(jsonb), public.bim_bieu_thuc_dieu_kien(jsonb),
  public.bim_bieu_thuc_bo_chon(jsonb), public.bim_loc_cau_kien(uuid[], jsonb, integer),
  public.bim_gia_tri_theo_truong(uuid[], jsonb), public.bim_danh_muc_truong(uuid[]),
  public.bim_gia_tri_pho_bien(uuid[], jsonb), public.bim_so_sanh_phien_ban(uuid, uuid),
  public.bim_version_diff_summary(uuid, uuid),
  public.bim_thong_ke_kich_thuoc(uuid, uuid, uuid[], text, text, text, text)
from public, anon;
grant execute on function
  public.bim_field_track(uuid, text),
  public.bim_register_model_upload(uuid, text, text, bigint, text, text, text, uuid, text, text),
  public.bim_delete_model(uuid), public.bim_restore_model(uuid), public.bim_retry_model(uuid),
  public.bim_set_model_offset(uuid, jsonb), public.bim_purge_model(uuid), public.bim_hang_doi(),
  public.bim_so(text), public.bim_bieu_thuc_truong(jsonb), public.bim_bieu_thuc_dieu_kien(jsonb),
  public.bim_bieu_thuc_bo_chon(jsonb), public.bim_loc_cau_kien(uuid[], jsonb, integer),
  public.bim_gia_tri_theo_truong(uuid[], jsonb), public.bim_danh_muc_truong(uuid[]),
  public.bim_gia_tri_pho_bien(uuid[], jsonb), public.bim_so_sanh_phien_ban(uuid, uuid),
  public.bim_version_diff_summary(uuid, uuid),
  public.bim_thong_ke_kich_thuoc(uuid, uuid, uuid[], text, text, text, text)
to authenticated, service_role;
grant execute on function public.bim_swap_model_elements(uuid, uuid, jsonb) to service_role;

-- ── Storage: private bucket, project id in the second folder ────────────────────────────────────────────────────
--   models/{project}/{sha16}/{file}.ifc|.ifczip   uploaded by members with write access (TUS, 6 MB chunks)
--   frags/{project}/{model}.frag                  written by the converter (service role)
--   issues/{project}/…, nen/{project}/…, cde/{project}/…   screenshots, basemaps, CDE files (later phases)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bim-models', 'bim-models', false, 524288000,
  array['application/octet-stream', 'application/x-step', 'model/ifc', 'application/zip', 'application/x-zip-compressed',
        'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy bim_files_read on storage.objects for select to authenticated
  using (bucket_id = 'bim-models' and (storage.foldername(name))[1] in ('models', 'frags', 'issues', 'nen', 'cde')
         and (storage.foldername(name))[2] = any ((select bim_private.readable_project_texts())::text[]));
create policy bim_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bim-models' and (storage.foldername(name))[1] in ('models', 'issues', 'nen', 'cde')
              and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[]));
-- An upload that never got registered (cancelled, duplicate) can be removed by its uploader.
create function bim_private.storage_object_referenced(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bim_models m where p_name in (m.ifc_path, m.frag_path, m.properties_path))
$$;
revoke all on function bim_private.storage_object_referenced(text) from public, anon;
grant execute on function bim_private.storage_object_referenced(text) to authenticated, service_role;
create policy bim_files_orphan_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'models' and owner_id = (select auth.uid())::text
         and not bim_private.storage_object_referenced(name));
-- After bim_purge_model, project managers remove the files no model references any more (IFC and converted .frag).
create function bim_private.can_manage_path(p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sxd_bim_projects p where p.id::text = p_folder and bim_private.can_manage(p.id))
$$;
revoke all on function bim_private.can_manage_path(text) from public, anon;
grant execute on function bim_private.can_manage_path(text) to authenticated, service_role;
create policy bim_files_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bim-models' and (storage.foldername(name))[1] in ('models', 'frags')
         and bim_private.can_manage_path((storage.foldername(name))[2])
         and not bim_private.storage_object_referenced(name));

notify pgrst, 'reload schema';

-- Upstream: 20261027100000_bim_selection_views.sql
-- BIM module phase B2: smart selection sets and shared templates, quick select facets, saved views, and a Uniclass
-- summary read from IFC classification references. Names follow cic-hud so the ported client runs unchanged.
-- Differences from cic-hud: project ids are document_projects uuids; set templates belong to an organization
-- (ACC-style account templates) instead of being visible to every user; quick select ignores the work-package
-- filter until the schedule links of phase B5 exist; Uniclass codes come from IfcClassificationReference
-- (thuoc_tinh.phan_loai, written by the converter) instead of the HUD data dictionary.

-- ── Smart selection sets ────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_bo_chon (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  mo_ta text check (mo_ta is null or length(mo_ta) <= 2000),
  -- First AND group, kept for tools that read a single group; nhom_dieu_kien holds all OR groups.
  dieu_kien jsonb not null default '[]' check (jsonb_typeof(dieu_kien) = 'array'),
  nhom_dieu_kien jsonb check (nhom_dieu_kien is null or jsonb_typeof(nhom_dieu_kien) = 'array'),
  mau text check (mau is null or mau ~ '^#[0-9a-fA-F]{6}$'),
  nguoi_tao uuid,
  ten_nguoi_tao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bim_bo_chon_project on public.bim_bo_chon (project_id, created_at desc);

create function bim_private.selection_set_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.nguoi_tao := auth.uid();
  else
    new.nguoi_tao := old.nguoi_tao;
    new.project_id := old.project_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_bo_chon_stamp before insert or update on public.bim_bo_chon
  for each row execute function bim_private.selection_set_stamp();

alter table public.bim_bo_chon enable row level security;
create policy bim_bo_chon_read on public.bim_bo_chon for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_bo_chon_insert on public.bim_bo_chon for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_bo_chon_update on public.bim_bo_chon for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_bo_chon_delete on public.bim_bo_chon for delete to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_bo_chon from anon, authenticated;
grant select, insert, update, delete on public.bim_bo_chon to authenticated;

-- Templates shared within the organization that owns the source project.
create table public.bim_bo_chon_mau (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sxd_bim_organizations(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  mo_ta text,
  dieu_kien jsonb not null default '[]' check (jsonb_typeof(dieu_kien) = 'array'),
  nhom_dieu_kien jsonb check (nhom_dieu_kien is null or jsonb_typeof(nhom_dieu_kien) = 'array'),
  mau text,
  nguon_project_id uuid references public.sxd_bim_projects(id) on delete set null,
  nguoi_tao uuid,
  ten_nguoi_tao text,
  created_at timestamptz not null default now()
);
create index bim_bo_chon_mau_org on public.bim_bo_chon_mau (organization_id, created_at desc);
alter table public.bim_bo_chon_mau enable row level security;
create policy bim_bo_chon_mau_read on public.bim_bo_chon_mau for select to authenticated
  using (sxd_bim_appraisal_private.org_access(organization_id));
revoke all on public.bim_bo_chon_mau from anon, authenticated;
grant select on public.bim_bo_chon_mau to authenticated;

create function public.bim_bo_chon_chia_se(p_set uuid, p_mo_ta text default null) returns public.bim_bo_chon_mau
language plpgsql security definer set search_path = '' as $$
declare s public.bim_bo_chon; v_org uuid; t public.bim_bo_chon_mau;
begin
  select * into s from public.bim_bo_chon where id = p_set;
  if s.id is null or not bim_private.can_write(s.project_id) then
    raise exception 'Không tìm thấy bộ chọn hoặc không có quyền chia sẻ.' using errcode = '42501';
  end if;
  select organization_id into v_org from public.sxd_bim_project_profiles where project_id = s.project_id;
  if v_org is null then raise exception 'Dự án chưa thuộc đơn vị nên chưa chia sẻ được mẫu.'; end if;
  insert into public.bim_bo_chon_mau (organization_id, ten, mo_ta, dieu_kien, nhom_dieu_kien, mau, nguon_project_id,
    nguoi_tao, ten_nguoi_tao)
  values (v_org, s.ten, coalesce(nullif(btrim(p_mo_ta), ''), s.mo_ta), s.dieu_kien, s.nhom_dieu_kien, s.mau, s.project_id,
    auth.uid(), s.ten_nguoi_tao)
  returning * into t;
  return t;
end $$;

create function public.bim_bo_chon_tu_mau(p_mau uuid, p_project uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.bim_bo_chon_mau; v_id uuid;
begin
  if not bim_private.can_write(p_project) then raise exception 'Không có quyền thêm bộ chọn vào dự án này.' using errcode = '42501'; end if;
  select * into t from public.bim_bo_chon_mau where id = p_mau and sxd_bim_appraisal_private.org_access(organization_id);
  if t.id is null then raise exception 'Không tìm thấy mẫu bộ chọn.'; end if;
  insert into public.bim_bo_chon (project_id, ten, mo_ta, dieu_kien, nhom_dieu_kien, mau)
  values (p_project, t.ten, t.mo_ta, t.dieu_kien, t.nhom_dieu_kien, t.mau)
  returning id into v_id;
  return v_id;
end $$;

create function public.bim_bo_chon_mau_xoa(p_mau uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.bim_bo_chon_mau
   where id = p_mau and (nguoi_tao = auth.uid() or sxd_bim_appraisal_private.org_access(organization_id, true));
  if not found then raise exception 'Chỉ người chia sẻ hoặc quản trị đơn vị xóa được mẫu.' using errcode = '42501'; end if;
end $$;

-- ── Quick select: storey / element type / material facets counted on the server ────────────────────────────────
-- p_goi (schedule work package) and acceptance keys are accepted for client compatibility; the package filter is
-- applied once schedule links exist (phase B5).
create function public.bim_chon_nhanh_loc(
  p_model_ids uuid[], p_tang text[] default null, p_loai text[] default null, p_vat_lieu text[] default null,
  p_project uuid default null, p_goi uuid default null, p_nt text default 'all',
  p_nt_keys text[] default null, p_nt_guids text[] default null)
returns table (model_id uuid, express_id integer, global_id text, tang text, loai text, vat_lieu text,
  ok_tang boolean, ok_loai boolean, ok_vat_lieu boolean, ok_goi boolean, ok_nt boolean, da_nt boolean)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select e.model_id, e.express_id, e.global_id::text as guid,
           coalesce(nullif(btrim(split_part(coalesce(e.phan_doan_tang, ''), ' — ', 1)), ''), 'Không rõ tầng') as tang,
           coalesce(e.loai_cau_kien, '') as loai,
           coalesce(nullif(btrim(e.vat_lieu), ''), 'Chưa có vật liệu') as vat_lieu,
           case when cardinality(coalesce(p_nt_guids, '{}'::text[])) > 0
                then count(*) over (partition by e.global_id) else 0 end as so_guid
      from public.bim_elements e
     where e.model_id = any (p_model_ids)
  ), flags as (
    select b.*,
           (b.model_id::text || '|' || b.guid) = any (coalesce(p_nt_keys, '{}'::text[]))
             or (b.so_guid = 1 and b.guid = any (coalesce(p_nt_guids, '{}'::text[]))) as da_nt
      from base b
  )
  select f.model_id, f.express_id, f.guid, f.tang, f.loai, f.vat_lieu,
         (cardinality(coalesce(p_tang, '{}'::text[])) = 0 or f.tang = any (p_tang)),
         (cardinality(coalesce(p_loai, '{}'::text[])) = 0 or f.loai = any (p_loai)),
         (cardinality(coalesce(p_vat_lieu, '{}'::text[])) = 0 or f.vat_lieu = any (p_vat_lieu)),
         p_goi is null,
         (coalesce(p_nt, 'all') = 'all' or (p_nt = 'da') = f.da_nt),
         f.da_nt
    from flags f
$$;

create function public.bim_chon_nhanh_facet(
  p_model_ids uuid[], p_tang text[] default null, p_loai text[] default null, p_vat_lieu text[] default null,
  p_project uuid default null, p_goi uuid default null, p_nt text default 'all',
  p_nt_keys text[] default null, p_nt_guids text[] default null)
returns table (nhom text, gia_tri text, so_luong bigint)
language sql stable security invoker set search_path = '' as $$
  with loc as (
    select * from public.bim_chon_nhanh_loc(p_model_ids, p_tang, p_loai, p_vat_lieu, p_project, p_goi, p_nt, p_nt_keys, p_nt_guids)
  )
  select 'tang', tang, count(*) from loc where ok_loai and ok_vat_lieu and ok_goi and ok_nt group by tang
  union all
  select 'loai', loai, count(*) from loc where ok_tang and ok_vat_lieu and ok_goi and ok_nt group by loai
  union all
  select 'vat_lieu', vat_lieu, count(*) from loc where ok_tang and ok_loai and ok_goi and ok_nt group by vat_lieu
  union all
  select 'tong', null, count(*) from loc where ok_tang and ok_loai and ok_vat_lieu and ok_goi and ok_nt
  union all
  select 'da_nt', null, count(*) from loc where ok_tang and ok_loai and ok_vat_lieu and ok_goi and ok_nt and da_nt
  order by 1, 2
$$;

create function public.bim_chon_nhanh_cau_kien(
  p_model_ids uuid[], p_tang text[] default null, p_loai text[] default null, p_vat_lieu text[] default null,
  p_project uuid default null, p_goi uuid default null, p_nt text default 'all',
  p_nt_keys text[] default null, p_nt_guids text[] default null)
returns table (model_id uuid, express_id integer, global_id text, da_nt boolean)
language sql stable security invoker set search_path = '' as $$
  select l.model_id, l.express_id, l.global_id, l.da_nt
    from public.bim_chon_nhanh_loc(p_model_ids, p_tang, p_loai, p_vat_lieu, p_project, p_goi, p_nt, p_nt_keys, p_nt_guids) l
   where l.ok_tang and l.ok_loai and l.ok_vat_lieu and l.ok_goi and l.ok_nt
   order by l.model_id, l.express_id
$$;

-- ── Uniclass summary from IFC classification references ─────────────────────────────────────────────────────────
-- thuoc_tinh.phan_loai is a list of "<code> - <name>" (IfcClassificationReference Identification and Name).
-- Codes of the Uniclass 2015 tables (Pr_, Ss_, EF_, …) are counted per element; filter with bim_loc_cau_kien and
-- the condition {"truong": ["phan_loai"], "toan_tu": "chua", "gia_tri": "<code>"}, which also matches child codes.
create function public.bim_uniclass_tong_hop(p_model_ids uuid[])
returns table (bang text, ma text, ten text, so_luong integer)
language sql stable security invoker set search_path = '' as $$
  with ref as (
    select e.model_id, e.express_id,
           substring(x from '^([A-Za-z]{2}(?:_[0-9]{2}){1,4})') as ma,
           nullif(btrim(substring(x from ' - (.*)$')), '') as ten
      from public.bim_elements e,
           jsonb_array_elements_text(case when jsonb_typeof(e.thuoc_tinh -> 'phan_loai') = 'array'
                                          then e.thuoc_tinh -> 'phan_loai' else '[]'::jsonb end) x
     where e.model_id = any (p_model_ids)
  )
  select lower(left(ma, 2)), ma, min(ten), count(distinct (model_id, express_id))::integer
    from ref
   where ma is not null and upper(left(ma, 2)) in ('CO', 'EN', 'SL', 'EF', 'SS', 'PR', 'TE', 'PM', 'AC', 'RO', 'FI', 'ZZ')
   group by ma
   order by ma
$$;

-- ── Saved views ─────────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_saved_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  model_id uuid references public.bim_models(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 4000),
  -- Camera, section planes, hidden/isolated elements, measurements, markup (BimViewpoint).
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  -- Small JPEG/PNG data URL captured in the browser (the client scales it to a thumbnail).
  thumbnail_url text check (thumbnail_url is null or (thumbnail_url ~ '^data:image/(jpeg|png|webp);base64,' and length(thumbnail_url) <= 400000)),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  created_by text,
  nguoi_tao_uid uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bim_saved_views_project on public.bim_saved_views (project_id, created_at desc);
create index bim_saved_views_model on public.bim_saved_views (model_id);
create index bim_saved_views_tags on public.bim_saved_views using gin (tags);

create function bim_private.saved_view_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.nguoi_tao_uid := auth.uid();
  else
    new.nguoi_tao_uid := old.nguoi_tao_uid;
    new.project_id := old.project_id;
    new.created_at := old.created_at;
  end if;
  if new.model_id is not null and not exists (
       select 1 from public.bim_models m where m.id = new.model_id and m.project_id = new.project_id) then
    raise exception 'Mô hình không thuộc dự án của góc nhìn';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_saved_views_stamp before insert or update on public.bim_saved_views
  for each row execute function bim_private.saved_view_stamp();

alter table public.bim_saved_views enable row level security;
create policy bim_saved_views_read on public.bim_saved_views for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_saved_views_insert on public.bim_saved_views for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_saved_views_update on public.bim_saved_views for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_saved_views_delete on public.bim_saved_views for delete to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_saved_views from anon, authenticated;
grant select, insert, update, delete on public.bim_saved_views to authenticated;
grant all on public.bim_saved_views to service_role;

revoke all on function
  public.bim_bo_chon_chia_se(uuid, text), public.bim_bo_chon_tu_mau(uuid, uuid), public.bim_bo_chon_mau_xoa(uuid),
  public.bim_chon_nhanh_loc(uuid[], text[], text[], text[], uuid, uuid, text, text[], text[]),
  public.bim_chon_nhanh_facet(uuid[], text[], text[], text[], uuid, uuid, text, text[], text[]),
  public.bim_chon_nhanh_cau_kien(uuid[], text[], text[], text[], uuid, uuid, text, text[], text[]),
  public.bim_uniclass_tong_hop(uuid[])
from public, anon;
grant execute on function
  public.bim_bo_chon_chia_se(uuid, text), public.bim_bo_chon_tu_mau(uuid, uuid), public.bim_bo_chon_mau_xoa(uuid),
  public.bim_chon_nhanh_loc(uuid[], text[], text[], text[], uuid, uuid, text, text[], text[]),
  public.bim_chon_nhanh_facet(uuid[], text[], text[], text[], uuid, uuid, text, text[], text[]),
  public.bim_chon_nhanh_cau_kien(uuid[], text[], text[], text[], uuid, uuid, text, text[], text[]),
  public.bim_uniclass_tong_hop(uuid[])
to authenticated, service_role;
revoke all on function bim_private.selection_set_stamp(), bim_private.saved_view_stamp() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Upstream: 20261027110000_bim_coordination_field.sql
-- BIM module phase B3 (ACC Build: Issues/RFIs, Model Coordination clashes, Forms/Photos, acceptance).
-- Tables and RPCs keep the cic-hud names used by the ported client. Changes for BuildSIA and fixes of cic-hud issues:
--   * project ids are document_projects uuids; people are auth users (project owner and members), not ERP employees;
--   * element links point to BuildSIA workspace tasks and document-library documents; acceptance records live in the
--     BIM-owned table bim_nghiem_thu (immutable once written) instead of the ERP table nghiem_thu;
--   * clash sessions and records: viewers can read only (cic-hud kept a FOR ALL policy that let viewers write);
--   * acceptance status and coverage take group acceptances (links) into account, as the colouring already did;
--   * RFI/RFA/RFP/NCR numbers cannot be overwritten; updated_at/resolved_at are set by the server;
--   * field photos are stored in bim-models/field/{project}/… with their real content type;
--   * built-in checklist templates so field checks work without SQL seeding.

-- ── People of a project (assignees, responders) ─────────────────────────────────────────────────────────────────
create function bim_private.is_project_person(p_project uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sxd_bim_projects p where p.id = p_project and p.owner_id = p_user)
      or exists (select 1 from public.sxd_bim_project_members m where m.project_id = p_project and m.user_id = p_user)
$$;
create function public.bim_nguoi_tham_gia(p_project uuid) returns table (id uuid, ten text, email text, vai_tro text)
language sql stable security definer set search_path = '' as $$
  with people as (
    select p.owner_id as user_id, 'owner'::text as vai_tro from public.sxd_bim_projects p where p.id = p_project
    union
    select m.user_id, m.role from public.sxd_bim_project_members m where m.project_id = p_project
  )
  -- Accounts have no display name yet (the member list also shows e-mails): the name is the e-mail's local part.
  -- The project owner keeps the 'owner' role even when also listed as a member.
  select u.id, split_part(u.email, '@', 1), u.email::text,
         case when bool_or(pe.vai_tro = 'owner') then 'owner' else min(pe.vai_tro) end
    from people pe join auth.users u on u.id = pe.user_id
   where sxd_bim_document_private.project_access(p_project)
   group by u.id, u.email
   order by 2
$$;

-- ── Issues, RFI/RFA/RFP/NCR (BCF 2.1 compatible) ────────────────────────────────────────────────────────────────
create table public.bim_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  model_id uuid references public.bim_models(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text check (description is null or length(description) <= 20000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  issue_type text not null default 'thiet_ke' check (issue_type in ('thiet_ke', 'va_cham', 'hien_truong', 'giai_phong_mat_bang')),
  target_element_guid varchar(22),
  target_express_id integer,
  viewpoint jsonb check (viewpoint is null or jsonb_typeof(viewpoint) = 'object'),
  -- Storage path issues/{project}/… in bim-models (read through a signed URL).
  screenshot_url text,
  -- Assignee is a project person (auth user id as text, as the ported client stores it).
  assigned_to text,
  assigned_to_name text,
  don_vi_xu_ly text check (don_vi_xu_ly is null or don_vi_xu_ly in ('chu_dau_tu', 'tu_van_thiet_ke', 'tu_van_giam_sat', 'nha_thau', 'khac')),
  due_date date,
  created_by text,
  created_by_name text,
  nguoi_tao_uid uuid,
  loai_ho_so text not null default 'vuong_mac' check (loai_ho_so in ('vuong_mac', 'rfi', 'rfa', 'rfp', 'ncr')),
  so_hieu text,
  ben_nhan text,
  han_tra_loi date,
  noi_dung_tra_loi text,
  tra_loi_luc timestamptz,
  nguoi_tra_loi_uid uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index bim_issues_project on public.bim_issues (project_id, created_at desc, id);
create index bim_issues_model on public.bim_issues (model_id);
create index bim_issues_guid on public.bim_issues (target_element_guid);
create unique index bim_issues_so_hieu on public.bim_issues (project_id, so_hieu) where so_hieu is not null;

create function bim_private.issue_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_next integer;
begin
  if tg_op = 'INSERT' then
    new.nguoi_tao_uid := auth.uid();
    new.created_at := now();
  else
    new.nguoi_tao_uid := old.nguoi_tao_uid;
    new.project_id := old.project_id;
    new.created_at := old.created_at;
    new.so_hieu := old.so_hieu;
  end if;
  if new.model_id is not null and not exists (
       select 1 from public.bim_models m where m.id = new.model_id and m.project_id = new.project_id) then
    raise exception 'Mô hình không thuộc dự án của vướng mắc' using errcode = '23514';
  end if;
  if new.assigned_to is not null and (new.assigned_to !~ '^[0-9a-f-]{36}$'
       or not bim_private.is_project_person(new.project_id, new.assigned_to::uuid)) then
    raise exception 'Người xử lý phải là thành viên dự án' using errcode = '23514';
  end if;
  -- Record numbers per project and type (RFI-0001, NCR-0003…); a plain issue has none.
  if new.loai_ho_so = 'vuong_mac' then
    new.so_hieu := null;
  elsif new.so_hieu is null or (tg_op = 'UPDATE' and new.loai_ho_so is distinct from old.loai_ho_so) then
    perform pg_advisory_xact_lock(hashtext('bim_issues_so_hieu:' || new.project_id::text || ':' || new.loai_ho_so));
    select coalesce(max(substring(so_hieu from '[0-9]+$')::integer), 0) + 1 into v_next
      from public.bim_issues where project_id = new.project_id and so_hieu like upper(new.loai_ho_so) || '-%';
    new.so_hieu := upper(new.loai_ho_so) || '-' || lpad(v_next::text, 4, '0');
  end if;
  if tg_op = 'UPDATE' and new.noi_dung_tra_loi is distinct from old.noi_dung_tra_loi then
    if coalesce(btrim(new.noi_dung_tra_loi), '') = '' then
      new.tra_loi_luc := null; new.nguoi_tra_loi_uid := null;
    else
      new.tra_loi_luc := now(); new.nguoi_tra_loi_uid := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' then
    new.tra_loi_luc := old.tra_loi_luc; new.nguoi_tra_loi_uid := old.nguoi_tra_loi_uid;
  end if;
  if new.status in ('resolved', 'closed') then
    new.resolved_at := case when tg_op = 'UPDATE' and old.status in ('resolved', 'closed') then old.resolved_at else now() end;
  else
    new.resolved_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_issues_before_write before insert or update on public.bim_issues
  for each row execute function bim_private.issue_before_write();

alter table public.bim_issues enable row level security;
create policy bim_issues_read on public.bim_issues for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_issues_insert on public.bim_issues for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_issues_update on public.bim_issues for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_issues_delete on public.bim_issues for delete to authenticated
  using (bim_private.can_manage(project_id) or nguoi_tao_uid = (select auth.uid()));
revoke all on public.bim_issues from anon, authenticated;
grant select, insert, update, delete on public.bim_issues to authenticated;

create table public.bim_issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.bim_issues(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 10000),
  author text,
  author_id text,
  loai text not null default 'binh_luan' check (loai in ('binh_luan', 'he_thong')),
  nguoi_tao_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_issue_comments_issue on public.bim_issue_comments (issue_id, created_at);
create function bim_private.comment_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.nguoi_tao_uid := auth.uid();
  new.created_at := now();
  return new;
end $$;
create trigger bim_issue_comments_stamp before insert on public.bim_issue_comments
  for each row execute function bim_private.comment_stamp();
alter table public.bim_issue_comments enable row level security;
create policy bim_issue_comments_read on public.bim_issue_comments for select to authenticated
  using (exists (select 1 from public.bim_issues i where i.id = issue_id
                  and i.project_id = any ((select bim_private.readable_projects())::uuid[])));
-- Comments are part of the record: members with write access add them, nobody edits them afterwards.
create policy bim_issue_comments_insert on public.bim_issue_comments for insert to authenticated
  with check (exists (select 1 from public.bim_issues i where i.id = issue_id
                       and i.project_id = any ((select bim_private.writable_projects())::uuid[])));
revoke all on public.bim_issue_comments from anon, authenticated;
grant select, insert on public.bim_issue_comments to authenticated;

create function public.bim_issue_counts(p_project uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total', count(*),
    'open', count(*) filter (where status = 'open'),
    'in_progress', count(*) filter (where status = 'in_progress'),
    'overdue', count(*) filter (where due_date is not null and status not in ('resolved', 'closed')
                                 and due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date))
    from public.bim_issues where project_id = p_project
$$;

-- ── Clash detection sessions and results ────────────────────────────────────────────────────────────────────────
create table public.bim_phien_va_cham (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  model_a uuid not null references public.bim_models(id) on delete cascade,
  model_b uuid not null references public.bim_models(id) on delete cascade,
  goc_a uuid,
  goc_b uuid,
  dung_sai numeric not null default 0.01 check (dung_sai >= 0),
  che_do text not null default 'luoi' check (che_do in ('khung_bao', 'luoi')),
  so_va_cham integer not null default 0,
  nguoi_tao uuid,
  ten_nguoi_tao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bim_phien_va_cham_project on public.bim_phien_va_cham (project_id, updated_at desc);

create table public.bim_va_cham (
  id uuid primary key default gen_random_uuid(),
  phien_id uuid not null references public.bim_phien_va_cham(id) on delete cascade,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  guid_a text not null,
  guid_b text not null,
  ten_a text, ten_b text, loai_a text, loai_b text,
  tam jsonb,
  do_sau numeric,
  nhom text,
  trang_thai text not null default 'moi' check (trang_thai in ('moi', 'dang_xu_ly', 'da_xu_ly', 'bo_qua', 'da_het')),
  danh_gia text check (danh_gia is null or danh_gia in ('that', 'gia', 'can_xem')),
  ly_do_danh_gia text,
  ghi_chu text,
  lan_dau timestamptz not null default now(),
  lan_cuoi timestamptz not null default now(),
  unique (phien_id, guid_a, guid_b)
);
create index bim_va_cham_phien on public.bim_va_cham (phien_id, trang_thai);
create index bim_va_cham_project_ignored on public.bim_va_cham (project_id) where trang_thai = 'bo_qua';

create function bim_private.clash_session_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.nguoi_tao := auth.uid();
    new.created_at := now();
  else
    new.nguoi_tao := old.nguoi_tao;
    new.project_id := old.project_id;
    new.created_at := old.created_at;
  end if;
  if not exists (select 1 from public.bim_models m where m.id = new.model_a and m.project_id = new.project_id)
     or not exists (select 1 from public.bim_models m where m.id = new.model_b and m.project_id = new.project_id) then
    raise exception 'Mô hình va chạm khác dự án' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_phien_va_cham_guard before insert or update on public.bim_phien_va_cham
  for each row execute function bim_private.clash_session_guard();
-- Upserts of a re-run send new pairs without an id.
create function bim_private.clash_record_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := coalesce(new.id, gen_random_uuid());
  if not exists (select 1 from public.bim_phien_va_cham s where s.id = new.phien_id and s.project_id = new.project_id) then
    raise exception 'Phiên va chạm khác dự án' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then new.lan_dau := old.lan_dau; end if;
  return new;
end $$;
create trigger bim_va_cham_guard before insert or update on public.bim_va_cham
  for each row execute function bim_private.clash_record_guard();

alter table public.bim_phien_va_cham enable row level security;
alter table public.bim_va_cham enable row level security;
create policy bim_phien_va_cham_read on public.bim_phien_va_cham for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_phien_va_cham_write on public.bim_phien_va_cham for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_va_cham_read on public.bim_va_cham for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_va_cham_write on public.bim_va_cham for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_phien_va_cham, public.bim_va_cham from anon, authenticated;
grant select, insert, update, delete on public.bim_phien_va_cham, public.bim_va_cham to authenticated;

-- ── Acceptance records owned by the BIM module ──────────────────────────────────────────────────────────────────
-- Column names follow the ERP table the cic-hud client wrote to (ma_nghiem_thu, ma_du_an…). A record is final once
-- written: there is no update or delete policy (a correction is a new record).
create table public.bim_nghiem_thu (
  ma_nghiem_thu uuid primary key default gen_random_uuid(),
  ma_du_an uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ma_hang_muc text,
  cap_nghiem_thu text not null check (cap_nghiem_thu in ('cong_viec', 'giai_doan', 'hoan_thanh')),
  ten_nghiem_thu text not null check (length(btrim(ten_nghiem_thu)) between 1 and 300),
  ngay_de_nghi date,
  ngay_nghiem_thu date,
  dia_diem text,
  ket_luan text check (ket_luan is null or ket_luan in ('dat', 'khong_dat', 'dat_co_dieu_kien')),
  noi_dung_danh_gia text check (noi_dung_danh_gia is null or length(noi_dung_danh_gia) <= 20000),
  trang_thai text not null default 'cho_nghiem_thu' check (trang_thai in ('cho_nghiem_thu', 'dang_nghiem_thu', 'da_ket_luan')),
  -- Display name of the person who drew up the record; nguoi_tao_uid is the account.
  tao_boi text,
  nguoi_tao_uid uuid,
  tao_luc timestamptz not null default now(),
  bim_guid varchar(22),
  bim_model_id uuid references public.bim_models(id) on delete set null
);
create index bim_nghiem_thu_project_guid on public.bim_nghiem_thu (ma_du_an, bim_guid) where bim_guid is not null;
create function bim_private.acceptance_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.nguoi_tao_uid := auth.uid();
  new.tao_luc := now();
  new.trang_thai := case when new.ket_luan is null then 'cho_nghiem_thu' else 'da_ket_luan' end;
  if new.ket_luan is not null and new.ngay_nghiem_thu is null then
    raise exception 'Ghi ngày nghiệm thu khi có kết luận' using errcode = '23514';
  end if;
  if new.bim_model_id is not null and not exists (
       select 1 from public.bim_models m where m.id = new.bim_model_id and m.project_id = new.ma_du_an) then
    raise exception 'Mô hình không thuộc dự án' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger bim_nghiem_thu_stamp before insert on public.bim_nghiem_thu
  for each row execute function bim_private.acceptance_stamp();
alter table public.bim_nghiem_thu enable row level security;
create policy bim_nghiem_thu_read on public.bim_nghiem_thu for select to authenticated
  using (ma_du_an = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_nghiem_thu_insert on public.bim_nghiem_thu for insert to authenticated
  with check (ma_du_an = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_nghiem_thu from anon, authenticated;
grant select, insert on public.bim_nghiem_thu to authenticated;

-- ── Element links (documents, workspace tasks, acceptance records) ──────────────────────────────────────────────
create table public.bim_lien_ket_tai_lieu (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  model_id uuid references public.bim_models(id) on delete set null,
  global_id varchar(22) not null,
  -- 'boq' is added with the Cost module (phase B5).
  loai_doi_tuong text not null check (loai_doi_tuong in ('tai_lieu', 'nghiem_thu', 'cong_viec')),
  doi_tuong_id text not null,
  ten_hien_thi text,
  ghi_chu text check (ghi_chu is null or length(ghi_chu) <= 2000),
  created_by text,
  nguoi_tao_uid uuid,
  created_at timestamptz not null default now(),
  unique (project_id, global_id, loai_doi_tuong, doi_tuong_id)
);
create index bim_links_object on public.bim_lien_ket_tai_lieu (loai_doi_tuong, doi_tuong_id);
create index bim_links_project_kind on public.bim_lien_ket_tai_lieu (project_id, loai_doi_tuong, id);
create function bim_private.link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.nguoi_tao_uid := auth.uid(); else new.nguoi_tao_uid := old.nguoi_tao_uid; end if;
  if not exists (select 1 from public.bim_elements e where e.project_id = new.project_id and e.global_id = new.global_id
                   and (new.model_id is null or e.model_id = new.model_id)) then
    raise exception 'Cấu kiện không thuộc dự án hoặc mô hình đã chọn' using errcode = '23514';
  end if;
  if new.doi_tuong_id !~ '^[0-9a-f-]{36}$' then raise exception 'Mã đối tượng không hợp lệ' using errcode = '23514'; end if;
  if new.loai_doi_tuong = 'tai_lieu' and not exists (
       select 1 from public.sxd_bim_documents d where d.id = new.doi_tuong_id::uuid and d.project_id = new.project_id and d.deleted_at is null) then
    raise exception 'Tài liệu không thuộc dự án' using errcode = '23514';
  end if;
  if new.loai_doi_tuong = 'cong_viec' and not exists (
       select 1 from public.sxd_bim_workspace_tasks t where t.id = new.doi_tuong_id::uuid and t.project_id = new.project_id) then
    raise exception 'Nhiệm vụ không thuộc dự án' using errcode = '23514';
  end if;
  if new.loai_doi_tuong = 'nghiem_thu' and not exists (
       select 1 from public.bim_nghiem_thu n where n.ma_nghiem_thu = new.doi_tuong_id::uuid and n.ma_du_an = new.project_id) then
    raise exception 'Biên bản nghiệm thu không thuộc dự án' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger bim_links_guard before insert or update on public.bim_lien_ket_tai_lieu
  for each row execute function bim_private.link_guard();
alter table public.bim_lien_ket_tai_lieu enable row level security;
create policy bim_links_read on public.bim_lien_ket_tai_lieu for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_links_write on public.bim_lien_ket_tai_lieu for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_lien_ket_tai_lieu from anon, authenticated;
grant select, insert, update, delete on public.bim_lien_ket_tai_lieu to authenticated;

-- Latest acceptance verdict per element, counting both the element on the record and elements linked to it (group
-- acceptance). cic-hud's status RPC ignored links while its colouring used them.
create function public.bim_workspace_acceptance(p_project uuid)
returns table (model_id uuid, global_id text, status text)
language sql stable security invoker set search_path = '' as $$
  with recs as (
    select n.ma_nghiem_thu, n.tao_luc, n.bim_guid, n.bim_model_id, coalesce(n.ket_luan, 'cho_nghiem_thu') as status
      from public.bim_nghiem_thu n where n.ma_du_an = p_project
  ), keys as (
    select r.bim_model_id as model_id, r.bim_guid::text as global_id, r.status, r.tao_luc, r.ma_nghiem_thu
      from recs r where r.bim_guid is not null
    union all
    select l.model_id, l.global_id::text, r.status, r.tao_luc, r.ma_nghiem_thu
      from public.bim_lien_ket_tai_lieu l join recs r on r.ma_nghiem_thu::text = l.doi_tuong_id
     where l.project_id = p_project and l.loai_doi_tuong = 'nghiem_thu'
  )
  select distinct on (k.model_id, k.global_id) k.model_id, k.global_id, k.status
    from keys k order by k.model_id, k.global_id, k.tao_luc desc, k.ma_nghiem_thu desc
$$;
create function public.bim_acceptance_status(p_project uuid) returns table (bim_guid text, ket_luan text)
language sql stable security invoker set search_path = '' as $$
  select distinct on (a.global_id) a.global_id, a.status
    from public.bim_workspace_acceptance(p_project) a
   order by a.global_id, a.model_id nulls last
$$;
-- Share of the elements in scope that have a passed acceptance, any link, or a workspace-task link.
create function public.bim_scope_coverage(p_project uuid, p_model_ids uuid[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with scope as (
    select distinct e.global_id::text as global_id
      from public.bim_elements e join public.bim_models m on m.id = e.model_id
     where e.model_id = any (p_model_ids) and m.project_id = p_project and coalesce(e.global_id, '') <> ''
  ), accepted as (
    select global_id from public.bim_workspace_acceptance(p_project) where status in ('dat', 'dat_co_dieu_kien')
  )
  select jsonb_build_object(
    'scope_guids', (select count(*) from scope),
    'accepted', (select count(*) from scope s where s.global_id in (select global_id from accepted)),
    'linked', (select count(*) from scope s where exists (
       select 1 from public.bim_lien_ket_tai_lieu l where l.project_id = p_project and l.global_id = s.global_id)),
    'task_linked', (select count(*) from scope s where exists (
       select 1 from public.bim_lien_ket_tai_lieu l where l.project_id = p_project and l.global_id = s.global_id
          and l.loai_doi_tuong = 'cong_viec')),
    'computed_at', now())
$$;

-- ── Field checks (checklists) and the LOD 500 field-verification log ────────────────────────────────────────────
create table public.bim_xac_minh_hien_truong (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  global_id text not null,
  ket_qua text not null check (ket_qua in ('dat', 'sai_lech', 'ngoai_pham_vi')),
  ngay_xac_minh date,
  don_vi_xac_minh text,
  phuong_phap text check (phuong_phap is null or phuong_phap in ('quet_laser', 'toan_dac', 'do_thu_cong', 'nghiem_thu')),
  sai_so_mm numeric check (sai_so_mm is null or sai_so_mm >= 0),
  dung_sai_mm numeric check (dung_sai_mm is null or dung_sai_mm > 0),
  bien_ban text,
  ly_do text,
  la_demo boolean not null default false,
  nguoi_nhap_uid uuid,
  nguon text not null default 'nhap_tay' check (nguon in ('nhap_tay', 'excel', 'checklist')),
  phieu_id uuid,
  updated_at timestamptz not null default now(),
  unique (model_id, global_id),
  check (ket_qua = 'ngoai_pham_vi' or (ngay_xac_minh is not null and phuong_phap is not null)),
  check (ket_qua <> 'ngoai_pham_vi' or length(btrim(coalesce(ly_do, ''))) >= 3),
  check (ket_qua <> 'dat' or sai_so_mm is null or dung_sai_mm is null or sai_so_mm <= dung_sai_mm)
);
create index bim_xac_minh_hien_truong_project on public.bim_xac_minh_hien_truong (project_id, model_id);
alter table public.bim_xac_minh_hien_truong enable row level security;
create policy bim_xac_minh_read on public.bim_xac_minh_hien_truong for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_xac_minh_hien_truong from anon, authenticated;
grant select on public.bim_xac_minh_hien_truong to authenticated;

-- Templates: project templates, or built-in templates (project_id null) shipped with the module.
create table public.bim_checklist_mau (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  loai_ifc text[] not null default '{}',
  muc jsonb not null check (jsonb_typeof(muc) = 'array' and jsonb_array_length(muc) between 1 and 60),
  phuong_phap text check (phuong_phap is null or phuong_phap in ('quet_laser', 'toan_dac', 'do_thu_cong', 'nghiem_thu')),
  dung_sai_mm numeric check (dung_sai_mm is null or dung_sai_mm > 0),
  can_cu text,
  la_demo boolean not null default false,
  nguoi_uid uuid,
  created_at timestamptz not null default now()
);
alter table public.bim_checklist_mau enable row level security;
create policy bim_checklist_mau_read on public.bim_checklist_mau for select to authenticated
  using (project_id is null or project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_checklist_mau from anon, authenticated;
grant select on public.bim_checklist_mau to authenticated;
-- Built-in templates list what to check; tolerances and the governing standard are entered per sheet because they
-- depend on the project's specifications.
insert into public.bim_checklist_mau (ten, loai_ifc, muc, phuong_phap, can_cu) values
  ('Kiểm tra cột bê tông cốt thép', '{IFCCOLUMN}',
   '[{"ma":"1","noi_dung":"Kích thước tiết diện","kieu":"so","don_vi":"mm"},
     {"ma":"2","noi_dung":"Sai lệch tim cột so với trục","kieu":"so","don_vi":"mm"},
     {"ma":"3","noi_dung":"Độ thẳng đứng","kieu":"so","don_vi":"mm"},
     {"ma":"4","noi_dung":"Cao độ đỉnh cột","kieu":"so","don_vi":"mm"},
     {"ma":"5","noi_dung":"Bề mặt bê tông không rỗ, không nứt","kieu":"dat_khong"}]',
   'do_thu_cong', 'Theo tiêu chuẩn thi công và nghiệm thu áp dụng của dự án'),
  ('Kiểm tra dầm, sàn bê tông cốt thép', '{IFCBEAM,IFCSLAB}',
   '[{"ma":"1","noi_dung":"Kích thước tiết diện, chiều dày","kieu":"so","don_vi":"mm"},
     {"ma":"2","noi_dung":"Cao độ đáy dầm, mặt sàn","kieu":"so","don_vi":"mm"},
     {"ma":"3","noi_dung":"Độ phẳng bề mặt","kieu":"so","don_vi":"mm"},
     {"ma":"4","noi_dung":"Bề mặt bê tông không rỗ, không nứt","kieu":"dat_khong"}]',
   'do_thu_cong', 'Theo tiêu chuẩn thi công và nghiệm thu áp dụng của dự án'),
  ('Kiểm tra tường xây', '{IFCWALL,IFCWALLSTANDARDCASE}',
   '[{"ma":"1","noi_dung":"Chiều dày tường","kieu":"so","don_vi":"mm"},
     {"ma":"2","noi_dung":"Độ thẳng đứng","kieu":"so","don_vi":"mm"},
     {"ma":"3","noi_dung":"Vị trí so với trục","kieu":"so","don_vi":"mm"},
     {"ma":"4","noi_dung":"Mạch vữa đều, no vữa","kieu":"dat_khong"}]',
   'do_thu_cong', 'Theo tiêu chuẩn thi công và nghiệm thu áp dụng của dự án');

create table public.bim_checklist_phieu (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  global_ids text[] not null check (cardinality(global_ids) between 1 and 500),
  mau_id uuid references public.bim_checklist_mau(id) on delete set null,
  tieu_de text not null,
  ket_qua_muc jsonb not null default '[]',
  ket_luan text check (ket_luan is null or ket_luan in ('dat', 'sai_lech')),
  sai_so_mm numeric check (sai_so_mm is null or sai_so_mm >= 0),
  dung_sai_mm numeric check (dung_sai_mm is null or dung_sai_mm > 0),
  ngay date,
  don_vi text,
  phuong_phap text check (phuong_phap is null or phuong_phap in ('quet_laser', 'toan_dac', 'do_thu_cong', 'nghiem_thu')),
  bien_ban text,
  -- Photo paths field/{project}/… in bim-models.
  anh text[] not null default '{}',
  ghi_chu text,
  trang_thai text not null default 'nhap' check (trang_thai in ('nhap', 'da_ky')),
  la_demo boolean not null default false,
  nguoi_lap_uid uuid,
  ky_luc timestamptz,
  nguoi_ky_uid uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bim_checklist_phieu_project on public.bim_checklist_phieu (project_id, model_id, created_at desc);
alter table public.bim_checklist_phieu enable row level security;
create policy bim_checklist_phieu_read on public.bim_checklist_phieu for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_checklist_phieu from anon, authenticated;
grant select on public.bim_checklist_phieu to authenticated;
create function bim_private.checklist_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.trang_thai = 'da_ky' and pg_trigger_depth() <= 1 then raise exception 'Phiếu đã ký không xóa được.'; end if;
    return old;
  end if;
  if old.trang_thai = 'da_ky' then raise exception 'Phiếu đã ký không sửa được.'; end if;
  return new;
end $$;
create trigger bim_checklist_phieu_lock before update or delete on public.bim_checklist_phieu
  for each row execute function bim_private.checklist_lock();

create function bim_private.photo_paths(p_project uuid, p jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare v text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p, '[]')) x), '{}');
begin
  if exists (select 1 from unnest(v) x where x not like 'field/' || p_project::text || '/%') then
    raise exception 'Ảnh hiện trường phải thuộc thư mục của dự án' using errcode = '23514';
  end if;
  return v;
end $$;

create function public.bim_checklist_luu(p_id uuid, p_row jsonb) returns public.bim_checklist_phieu
language plpgsql security definer set search_path = '' as $$
declare r public.bim_checklist_phieu; v_model uuid := nullif(p_row ->> 'model_id', '')::uuid; v_project uuid; v_guids text[];
begin
  select project_id into v_project from public.bim_models where id = v_model and deleted_at is null;
  if v_project is null then raise exception 'Không tìm thấy mô hình.'; end if;
  if not bim_private.can_write(v_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  select array_agg(distinct x) into v_guids from jsonb_array_elements_text(coalesce(p_row -> 'global_ids', '[]')) x;
  if coalesce(cardinality(v_guids), 0) = 0 then raise exception 'Chọn ít nhất một cấu kiện.'; end if;
  if exists (select 1 from unnest(v_guids) g where not exists (
       select 1 from public.bim_elements e where e.model_id = v_model and e.global_id = g)) then
    raise exception 'Cấu kiện không có trong mô hình.';
  end if;
  if p_id is null then
    insert into public.bim_checklist_phieu (project_id, model_id, global_ids, mau_id, tieu_de, ket_qua_muc, ket_luan, sai_so_mm,
      dung_sai_mm, ngay, don_vi, phuong_phap, bien_ban, anh, ghi_chu, nguoi_lap_uid)
    values (v_project, v_model, v_guids, nullif(p_row ->> 'mau_id', '')::uuid,
      coalesce(nullif(btrim(p_row ->> 'tieu_de'), ''), 'Phiếu kiểm tra hiện trường'), coalesce(p_row -> 'ket_qua_muc', '[]'),
      nullif(p_row ->> 'ket_luan', ''), nullif(p_row ->> 'sai_so_mm', '')::numeric, nullif(p_row ->> 'dung_sai_mm', '')::numeric,
      nullif(p_row ->> 'ngay', '')::date, nullif(btrim(p_row ->> 'don_vi'), ''), nullif(p_row ->> 'phuong_phap', ''),
      nullif(btrim(p_row ->> 'bien_ban'), ''), bim_private.photo_paths(v_project, p_row -> 'anh'),
      nullif(btrim(p_row ->> 'ghi_chu'), ''), auth.uid())
    returning * into r;
  else
    update public.bim_checklist_phieu set global_ids = v_guids, mau_id = nullif(p_row ->> 'mau_id', '')::uuid,
      tieu_de = coalesce(nullif(btrim(p_row ->> 'tieu_de'), ''), tieu_de), ket_qua_muc = coalesce(p_row -> 'ket_qua_muc', ket_qua_muc),
      ket_luan = nullif(p_row ->> 'ket_luan', ''), sai_so_mm = nullif(p_row ->> 'sai_so_mm', '')::numeric,
      dung_sai_mm = nullif(p_row ->> 'dung_sai_mm', '')::numeric, ngay = nullif(p_row ->> 'ngay', '')::date,
      don_vi = nullif(btrim(p_row ->> 'don_vi'), ''), phuong_phap = nullif(p_row ->> 'phuong_phap', ''),
      bien_ban = nullif(btrim(p_row ->> 'bien_ban'), ''), anh = bim_private.photo_paths(v_project, p_row -> 'anh'),
      ghi_chu = nullif(btrim(p_row ->> 'ghi_chu'), ''), updated_at = now()
     where id = p_id and model_id = v_model returning * into r;
    if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  end if;
  return r;
end $$;

create function public.bim_checklist_ky(p_id uuid) returns public.bim_checklist_phieu
language plpgsql security definer set search_path = '' as $$
declare r public.bim_checklist_phieu;
begin
  select * into r from public.bim_checklist_phieu where id = p_id for update;
  if not found then raise exception 'Không tìm thấy phiếu.'; end if;
  if not bim_private.can_write(r.project_id) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if r.trang_thai = 'da_ky' then raise exception 'Phiếu đã ký.'; end if;
  if r.ket_luan is null or r.ngay is null or r.phuong_phap is null or length(btrim(coalesce(r.bien_ban, ''))) = 0 then
    raise exception 'Cần kết luận, ngày, phương pháp và số biên bản trước khi ký.';
  end if;
  if r.ket_luan = 'dat' and r.sai_so_mm is not null and r.dung_sai_mm is not null and r.sai_so_mm > r.dung_sai_mm then
    raise exception 'Sai số vượt dung sai: kết luận phải là sai lệch.';
  end if;
  update public.bim_checklist_phieu set trang_thai = 'da_ky', ky_luc = now(), nguoi_ky_uid = auth.uid(), updated_at = now()
   where id = p_id;
  insert into public.bim_xac_minh_hien_truong (project_id, model_id, global_id, ket_qua, ngay_xac_minh, don_vi_xac_minh,
    phuong_phap, sai_so_mm, dung_sai_mm, bien_ban, la_demo, nguoi_nhap_uid, nguon, phieu_id)
  select r.project_id, r.model_id, g, r.ket_luan, r.ngay, r.don_vi, r.phuong_phap, r.sai_so_mm, r.dung_sai_mm, r.bien_ban,
         r.la_demo, auth.uid(), 'checklist', r.id
    from unnest(r.global_ids) g
  on conflict (model_id, global_id) do update set ket_qua = excluded.ket_qua, ngay_xac_minh = excluded.ngay_xac_minh,
    don_vi_xac_minh = excluded.don_vi_xac_minh, phuong_phap = excluded.phuong_phap, sai_so_mm = excluded.sai_so_mm,
    dung_sai_mm = excluded.dung_sai_mm, bien_ban = excluded.bien_ban, ly_do = null, la_demo = excluded.la_demo,
    nguoi_nhap_uid = auth.uid(), nguon = 'checklist', phieu_id = excluded.phieu_id, updated_at = now();
  select * into r from public.bim_checklist_phieu where id = p_id;
  return r;
end $$;

create function public.bim_checklist_xoa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select project_id into v from public.bim_checklist_phieu where id = p_id;
  if v is null then raise exception 'Không tìm thấy phiếu.'; end if;
  if not bim_private.can_write(v) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  delete from public.bim_checklist_phieu where id = p_id;
end $$;

-- ── Storage: field photos ───────────────────────────────────────────────────────────────────────────────────────
create policy bim_field_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'field'
         and (storage.foldername(name))[2] = any ((select bim_private.readable_project_texts())::text[]));
create policy bim_field_photo_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'field'
              and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[]));
update storage.buckets set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}') || array['image/webp']))
 where id = 'bim-models';

revoke all on function bim_private.is_project_person(uuid, uuid), bim_private.photo_paths(uuid, jsonb),
  bim_private.issue_before_write(), bim_private.comment_stamp(), bim_private.clash_session_guard(),
  bim_private.clash_record_guard(), bim_private.acceptance_stamp(), bim_private.link_guard(), bim_private.checklist_lock()
  from public, anon, authenticated;
grant execute on function bim_private.photo_paths(uuid, jsonb) to authenticated;
revoke all on function public.bim_nguoi_tham_gia(uuid), public.bim_issue_counts(uuid), public.bim_workspace_acceptance(uuid),
  public.bim_acceptance_status(uuid), public.bim_scope_coverage(uuid, uuid[]), public.bim_checklist_luu(uuid, jsonb),
  public.bim_checklist_ky(uuid), public.bim_checklist_xoa(uuid) from public, anon;
grant execute on function public.bim_nguoi_tham_gia(uuid), public.bim_issue_counts(uuid), public.bim_workspace_acceptance(uuid),
  public.bim_acceptance_status(uuid), public.bim_scope_coverage(uuid, uuid[]), public.bim_checklist_luu(uuid, jsonb),
  public.bim_checklist_ky(uuid), public.bim_checklist_xoa(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Upstream: 20261027120000_bim_quality_cde.sql
-- BIM module phase B4: ISO 19650 CDE inside the document library (one store for documents and models, as ACC Docs),
-- IFC verification, information quality, LOD 500, organization data standards (IDS) and add-in upload keys.
-- Ported from cic-hud 20261023100000 / 20261023130000 / 20261024090000 with these changes:
--   * CDE containers cover every project document (document_versions of any format) and every BIM model chain; there is
--     no separate BIM file store. Personal documents stay outside the CDE;
--   * a new document version or model version opens a new P revision in WIP and cancels a review it was part of
--     (cic-hud left the submission open with stale content);
--   * sharing needs a valid container name, a clean virus scan for documents and a passed IFC verification for models;
--   * reviewers are project members, never the submitter; a submission can be cancelled by its submitter or a project
--     manager; the CDE log cannot be changed;
--   * IFC scoring runs for writers or the converter (service role), not for every viewer; the project stage comes from
--     the project CDE settings;
--   * LOD 500 has four criteria: equipment asset data (cic-hud's fifth) arrives with the Assets module (phase B7);
--   * data standards are IDS files owned by an organization instead of the HUD dictionary;
--   * add-in keys are stored as SHA-256 only; registration and status are service-role functions for bim-ingest.

-- ── 1. Container names (ISO 19650-2 / QĐ 348/QĐ-BXD) ────────────────────────────────────────────────────────────
-- Same rules as src/features/bim/lib/cdeNaming.ts: <Dự án>-<Đơn vị>-<Khu vực>-<Tầng>-<Loại>-<Bộ môn>-<Số> by default.
create function public.document_cde_field_count(p_mau text) returns integer
language sql immutable set search_path = '' as $$
  select case when coalesce(p_mau, '') ~ '<[^>]+>'
              then (select count(*)::integer from regexp_matches(p_mau, '<[^>]+>', 'g')) else 7 end
$$;
create function public.document_cde_name_problem(p_ten text, p_mau text default null) returns text
language plpgsql immutable set search_path = '' as $$
declare v_so integer := public.document_cde_field_count(p_mau); v_phan text[];
begin
  if coalesce(btrim(p_ten), '') = '' then return 'Chưa có tên tệp.'; end if;
  if length(p_ten) > 120 then return 'Tên tệp dài quá 120 ký tự.'; end if;
  if p_ten !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' then
    return 'Chỉ dùng chữ in hoa không dấu, chữ số và dấu gạch ngang giữa các trường.';
  end if;
  v_phan := string_to_array(p_ten, '-');
  if cardinality(v_phan) <> v_so then return format('Cần đúng %s trường, đang có %s.', v_so, cardinality(v_phan)); end if;
  if v_phan[v_so] !~ '^[0-9]{4,6}$' then return 'Trường cuối (số hiệu) phải có 4–6 chữ số.'; end if;
  return null;
end $$;

-- ── 2. Project CDE settings ─────────────────────────────────────────────────────────────────────────────────────
create table public.document_cde_settings (
  project_id uuid primary key references public.sxd_bim_projects(id) on delete cascade,
  mau_ten text check (mau_ten is null or (length(mau_ten) <= 200 and mau_ten ~ '^(<[^<>]{1,40}>-)*<[^<>]{1,40}>$')),
  giai_doan_bim text not null default 'thiet_ke'
    check (giai_doan_bim in ('chuan_bi', 'thiet_ke', 'thi_cong', 'ban_giao', 'van_hanh')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.document_cde_settings enable row level security;
create policy document_cde_settings_read on public.document_cde_settings for select to authenticated
  using (sxd_bim_document_private.project_access(project_id));
revoke all on public.document_cde_settings from anon, authenticated;
grant select on public.document_cde_settings to authenticated;

-- ── 3. Containers, submissions, reviews, log ────────────────────────────────────────────────────────────────────
create table public.document_cde_containers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  loai text not null check (loai in ('tai_lieu', 'mo_hinh')),
  document_id uuid unique references public.sxd_bim_documents(id) on delete cascade,
  -- Model chain (bim_models.model_root_id) and its latest version; model_id is null while no version remains.
  model_root_id uuid unique,
  model_id uuid unique references public.bim_models(id) on delete set null,
  tieu_de text not null check (length(btrim(tieu_de)) between 1 and 300),
  ma_tep text not null check (length(ma_tep) between 1 and 160),
  loi_ten text,
  vung text not null default 'wip' check (vung in ('wip', 'shared', 'published', 'archived')),
  ma_phu_hop text not null default 'S0'
    check (ma_phu_hop in ('S0', 'S1', 'S2', 'S3', 'S4', 'A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'CR')),
  so_phien_ban integer not null default 1 check (so_phien_ban > 0),
  so_lan_phat_hanh integer not null default 0 check (so_lan_phat_hanh >= 0),
  ma_sua_doi text not null default 'P01' check (ma_sua_doi ~ '^[PC][0-9]{2,}$'),
  bo_mon text,
  dang_de_trinh boolean not null default false,
  nguoi_tao_uid uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, ma_tep),
  check ((loai = 'tai_lieu') = (document_id is not null)),
  check ((loai = 'mo_hinh') = (model_root_id is not null))
);
create index document_cde_containers_project on public.document_cde_containers (project_id, vung, updated_at desc);

create table public.document_cde_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  tieu_de text not null check (length(btrim(tieu_de)) between 1 and 300),
  ma_phu_hop_dich text not null check (ma_phu_hop_dich in ('A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'CR')),
  trang_thai text not null default 'cho_tham_tra' check (trang_thai in ('cho_tham_tra', 'tra_lai', 'da_duyet', 'huy')),
  buoc_hien_tai integer not null default 1,
  so_buoc integer not null check (so_buoc between 1 and 10),
  ghi_chu text check (ghi_chu is null or length(ghi_chu) <= 4000),
  nguoi_de_trinh_uid uuid not null,
  created_at timestamptz not null default now(),
  ket_thuc_luc timestamptz
);
create index document_cde_submissions_project on public.document_cde_submissions (project_id, trang_thai, created_at desc);
create table public.document_cde_submission_items (
  submission_id uuid not null references public.document_cde_submissions(id) on delete cascade,
  container_id uuid not null references public.document_cde_containers(id) on delete cascade,
  ma_sua_doi text not null,
  primary key (submission_id, container_id)
);
create table public.document_cde_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.document_cde_submissions(id) on delete cascade,
  buoc integer not null,
  reviewer_id uuid not null,
  quyet_dinh text not null default 'cho' check (quyet_dinh in ('cho', 'duyet', 'tra_lai', 'bo_qua')),
  ly_do text check (ly_do is null or length(ly_do) <= 4000),
  quyet_dinh_luc timestamptz,
  unique (submission_id, buoc)
);
create index document_cde_reviews_reviewer on public.document_cde_reviews (reviewer_id, quyet_dinh);
create table public.document_cde_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  container_id uuid references public.document_cde_containers(id) on delete set null,
  submission_id uuid references public.document_cde_submissions(id) on delete set null,
  hanh_dong text not null,
  tu_vung text,
  den_vung text,
  chi_tiet jsonb not null default '{}',
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index document_cde_log_project on public.document_cde_log (project_id, id desc);
create index document_cde_log_container on public.document_cde_log (container_id, id desc);
create function sxd_bim_document_private.cde_log_locked() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Foreign keys clear container/submission ids when a project or record is removed.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and new.hanh_dong = old.hanh_dong and new.chi_tiet = old.chi_tiet then
    return new;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Nhật ký CDE không sửa hoặc xóa được.';
end $$;
create trigger document_cde_log_locked before update or delete on public.document_cde_log
  for each row execute function sxd_bim_document_private.cde_log_locked();

alter table public.document_cde_containers enable row level security;
alter table public.document_cde_submissions enable row level security;
alter table public.document_cde_submission_items enable row level security;
alter table public.document_cde_reviews enable row level security;
alter table public.document_cde_log enable row level security;
create policy document_cde_containers_read on public.document_cde_containers for select to authenticated
  using (sxd_bim_document_private.project_access(project_id) and deleted_at is null);
create policy document_cde_submissions_read on public.document_cde_submissions for select to authenticated
  using (sxd_bim_document_private.project_access(project_id));
create policy document_cde_items_read on public.document_cde_submission_items for select to authenticated
  using (exists (select 1 from public.document_cde_submissions s where s.id = submission_id
                  and sxd_bim_document_private.project_access(s.project_id)));
create policy document_cde_reviews_read on public.document_cde_reviews for select to authenticated
  using (exists (select 1 from public.document_cde_submissions s where s.id = submission_id
                  and sxd_bim_document_private.project_access(s.project_id)));
create policy document_cde_log_read on public.document_cde_log for select to authenticated
  using (sxd_bim_document_private.project_access(project_id));
revoke all on public.document_cde_containers, public.document_cde_submissions, public.document_cde_submission_items,
  public.document_cde_reviews, public.document_cde_log from anon, authenticated;
grant select on public.document_cde_containers, public.document_cde_submissions, public.document_cde_submission_items,
  public.document_cde_reviews, public.document_cde_log to authenticated;

-- ── 4. Internal helpers ─────────────────────────────────────────────────────────────────────────────────────────
create function sxd_bim_document_private.cde_write(p_project uuid, p_container uuid, p_submission uuid, p_action text,
  p_from text, p_to text, p_detail jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.document_cde_log (project_id, container_id, submission_id, hanh_dong, tu_vung, den_vung, chi_tiet, actor_id)
  values (p_project, p_container, p_submission, p_action, p_from, p_to, coalesce(p_detail, '{}'), auth.uid())
$$;
create function sxd_bim_document_private.cde_template(p_project uuid) returns text
language sql stable security definer set search_path = '' as $$
  select nullif(btrim(mau_ten), '') from public.document_cde_settings where project_id = p_project
$$;
create function sxd_bim_document_private.cde_require_write(p_project uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not sxd_bim_document_private.project_access(p_project, true) then
    raise exception 'Bạn không có quyền ghi hồ sơ ở dự án này.' using errcode = '42501';
  end if;
end $$;
-- Suggested container name from a file name, unique in the project.
create function sxd_bim_document_private.cde_name_from(p_project uuid, p_file text, p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text := upper(btrim(regexp_replace(regexp_replace(
  translate(coalesce(p_file, 'TEP'), 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ',
                                   'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'),
  '\.[A-Za-z0-9]+$', ''), '[^A-Za-z0-9]+', '-', 'g'), '-'));
begin
  v := left(coalesce(nullif(v, ''), 'TEP'), 140);
  if exists (select 1 from public.document_cde_containers where project_id = p_project and ma_tep = v) then
    v := left(v, 140) || '-' || upper(left(replace(p_id::text, '-', ''), 8));
  end if;
  return v;
end $$;
-- Keeps the ported BIM client's columns in step with the container.
create function sxd_bim_document_private.cde_sync_model(p_container uuid) returns void
language sql security definer set search_path = '' as $$
  update public.bim_models m
     set trang_thai_cde = case when c.dang_de_trinh then 'cho_phat_hanh' else c.vung end, ma_phu_hop = c.ma_phu_hop
    from public.document_cde_containers c
   where c.id = p_container and c.model_id = m.id
$$;
-- Ends open reviews that include a container (a new version changed its content).
create function sxd_bim_document_private.cde_cancel_for(p_container uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.document_cde_submissions;
begin
  for s in
    select d.* from public.document_cde_submissions d
      join public.document_cde_submission_items i on i.submission_id = d.id
     where i.container_id = p_container and d.trang_thai = 'cho_tham_tra'
       for update of d
  loop
    update public.document_cde_submissions set trang_thai = 'huy', ket_thuc_luc = now() where id = s.id;
    update public.document_cde_reviews set quyet_dinh = 'bo_qua' where submission_id = s.id and quyet_dinh = 'cho';
    update public.document_cde_containers set dang_de_trinh = false, ma_phu_hop = 'S2', updated_at = now()
     where id in (select container_id from public.document_cde_submission_items where submission_id = s.id)
       and id <> p_container;
    perform sxd_bim_document_private.cde_sync_model(i.container_id)
       from public.document_cde_submission_items i where i.submission_id = s.id;
    perform sxd_bim_document_private.cde_write(s.project_id, p_container, s.id, 'huy_de_trinh', null, null,
      jsonb_build_object('ly_do', p_reason));
  end loop;
end $$;
-- A new version of a container: next P revision, back to WIP.
create function sxd_bim_document_private.cde_new_revision(p_container uuid, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.document_cde_containers;
begin
  perform sxd_bim_document_private.cde_cancel_for(p_container, 'Có phiên bản mới của tệp trong đệ trình.');
  update public.document_cde_containers
     set so_phien_ban = so_phien_ban + 1, ma_sua_doi = 'P' || lpad((so_phien_ban + 1)::text, 2, '0'),
         vung = 'wip', ma_phu_hop = 'S0', dang_de_trinh = false, updated_at = now()
   where id = p_container returning * into c;
  perform sxd_bim_document_private.cde_write(c.project_id, c.id, null, 'phien_ban_moi', null, 'wip',
    p_detail || jsonb_build_object('ma_sua_doi', c.ma_sua_doi));
  perform sxd_bim_document_private.cde_sync_model(c.id);
end $$;

-- ── 5. Containers follow documents and model chains ─────────────────────────────────────────────────────────────
create function sxd_bim_document_private.cde_from_document() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.document_cde_containers;
begin
  if new.project_id is null then return new; end if;
  select * into c from public.document_cde_containers where document_id = new.id;
  if new.current_version_id is not null and c.id is null then
    insert into public.document_cde_containers (project_id, loai, document_id, tieu_de, ma_tep, nguoi_tao_uid)
    values (new.project_id, 'tai_lieu', new.id, left(new.name, 300),
            sxd_bim_document_private.cde_name_from(new.project_id, new.name, new.id), auth.uid())
    returning * into c;
    update public.document_cde_containers
       set loi_ten = public.document_cde_name_problem(ma_tep, sxd_bim_document_private.cde_template(project_id))
     where id = c.id;
    perform sxd_bim_document_private.cde_write(c.project_id, c.id, null, 'tao_tep', null, 'wip',
      jsonb_build_object('ma_tep', c.ma_tep, 'document_id', new.id));
  elsif c.id is not null and tg_op = 'UPDATE' and old.current_version_id is not null
        and new.current_version_id is distinct from old.current_version_id then
    perform sxd_bim_document_private.cde_new_revision(c.id, jsonb_build_object('version_id', new.current_version_id));
  end if;
  if c.id is not null and tg_op = 'UPDATE' and new.deleted_at is distinct from old.deleted_at then
    update public.document_cde_containers set deleted_at = new.deleted_at, updated_at = now() where id = c.id;
    if new.deleted_at is not null then
      perform sxd_bim_document_private.cde_cancel_for(c.id, 'Tài liệu đã được đưa vào thùng rác.');
    end if;
  end if;
  return new;
end $$;
create trigger documents_cde after insert or update of current_version_id, deleted_at on public.sxd_bim_documents
  for each row execute function sxd_bim_document_private.cde_from_document();

create function sxd_bim_document_private.cde_from_model() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.document_cde_containers;
begin
  if tg_op = 'INSERT' then
    select * into c from public.document_cde_containers where model_root_id = new.model_root_id;
    if c.id is not null then
      update public.document_cde_containers set model_id = new.id where id = c.id;
      perform sxd_bim_document_private.cde_new_revision(c.id, jsonb_build_object('model_id', new.id, 'model_cu', new.model_goc_id));
    else
      insert into public.document_cde_containers (project_id, loai, model_root_id, model_id, tieu_de, ma_tep, bo_mon, nguoi_tao_uid)
      values (new.project_id, 'mo_hinh', new.model_root_id, new.id, left(new.file_name, 300),
              sxd_bim_document_private.cde_name_from(new.project_id, new.file_name, new.id), new.discipline, auth.uid())
      returning * into c;
      update public.document_cde_containers
         set loi_ten = public.document_cde_name_problem(ma_tep, sxd_bim_document_private.cde_template(project_id))
       where id = c.id;
      perform sxd_bim_document_private.cde_write(c.project_id, c.id, null, 'tao_tep', null, 'wip',
        jsonb_build_object('ma_tep', c.ma_tep, 'model_id', new.id));
      perform sxd_bim_document_private.cde_sync_model(c.id);
    end if;
  elsif new.deleted_at is distinct from old.deleted_at then
    select * into c from public.document_cde_containers where model_id = new.id;
    if c.id is not null then
      update public.document_cde_containers set deleted_at = new.deleted_at, updated_at = now() where id = c.id;
      if new.deleted_at is not null then
        perform sxd_bim_document_private.cde_cancel_for(c.id, 'Mô hình đã được xóa.');
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger bim_models_cde after insert or update of deleted_at on public.bim_models
  for each row execute function sxd_bim_document_private.cde_from_model();
-- Purging the latest version relinks the chain; the container follows the newest remaining version.
create function sxd_bim_document_private.cde_model_purged() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_next uuid;
begin
  select m.id into v_next from public.bim_models m
   where m.model_root_id = old.model_root_id and m.id <> old.id and m.deleted_at is null
   order by m.phien_ban desc limit 1;
  update public.document_cde_containers c
     set model_id = v_next, deleted_at = case when v_next is null then coalesce(c.deleted_at, now()) end, updated_at = now()
   where c.model_root_id = old.model_root_id and c.model_id is null;
  perform sxd_bim_document_private.cde_sync_model(c.id) from public.document_cde_containers c where c.model_root_id = old.model_root_id;
  return old;
end $$;
create trigger bim_models_cde_purged after delete on public.bim_models
  for each row execute function sxd_bim_document_private.cde_model_purged();

-- Existing project documents and models.
insert into public.document_cde_containers (project_id, loai, document_id, tieu_de, ma_tep)
select d.project_id, 'tai_lieu', d.id, left(d.name, 300),
       upper(left(coalesce(nullif(btrim(regexp_replace(regexp_replace(d.name, '\.[A-Za-z0-9]+$', ''), '[^A-Za-z0-9]+', '-', 'g'), '-'), ''), 'TEP'), 120))
         || '-' || upper(left(replace(d.id::text, '-', ''), 8))
  from public.sxd_bim_documents d
 where d.project_id is not null and d.current_version_id is not null
on conflict do nothing;
insert into public.document_cde_containers (project_id, loai, model_root_id, model_id, tieu_de, ma_tep, bo_mon)
select m.project_id, 'mo_hinh', m.model_root_id, m.id, left(m.file_name, 300),
       upper(left(coalesce(nullif(btrim(regexp_replace(regexp_replace(m.file_name, '\.[A-Za-z0-9]+$', ''), '[^A-Za-z0-9]+', '-', 'g'), '-'), ''), 'TEP'), 120))
         || '-' || upper(left(replace(m.id::text, '-', ''), 8)), m.discipline
  from public.bim_models m
 where not exists (select 1 from public.bim_models n where n.model_goc_id = m.id)
on conflict do nothing;
update public.document_cde_containers c
   set loi_ten = public.document_cde_name_problem(c.ma_tep, null),
       deleted_at = coalesce((select d.deleted_at from public.sxd_bim_documents d where d.id = c.document_id),
                             (select m.deleted_at from public.bim_models m where m.id = c.model_id));

-- ── 6. CDE actions ──────────────────────────────────────────────────────────────────────────────────────────────
create function public.document_cde_rename(p_container uuid, p_ma_tep text, p_tieu_de text default null)
returns public.document_cde_containers
language plpgsql security definer set search_path = '' as $$
declare c public.document_cde_containers; v_old text;
begin
  select * into c from public.document_cde_containers where id = p_container and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy tệp CDE.'; end if;
  perform sxd_bim_document_private.cde_require_write(c.project_id);
  if c.vung <> 'wip' then raise exception 'Chỉ đổi tên tệp ở vùng Đang thực hiện (WIP).'; end if;
  v_old := c.ma_tep;
  update public.document_cde_containers
     set ma_tep = upper(btrim(p_ma_tep)),
         loi_ten = public.document_cde_name_problem(upper(btrim(p_ma_tep)), sxd_bim_document_private.cde_template(project_id)),
         tieu_de = coalesce(nullif(btrim(p_tieu_de), ''), tieu_de), updated_at = now()
   where id = c.id returning * into c;
  perform sxd_bim_document_private.cde_write(c.project_id, c.id, null, 'doi_ten', c.vung, c.vung,
    jsonb_build_object('tu', v_old, 'den', c.ma_tep));
  return c;
end $$;

create function public.document_cde_move(p_container uuid, p_den text, p_ma_phu_hop text default null,
  p_ghi_chu text default null) returns public.document_cde_containers
language plpgsql security definer set search_path = '' as $$
declare c public.document_cde_containers; v_from text; v_scan text; v_ok boolean; v_score numeric; v_min numeric;
begin
  select * into c from public.document_cde_containers where id = p_container and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy tệp CDE.'; end if;
  perform sxd_bim_document_private.cde_require_write(c.project_id);
  if c.dang_de_trinh then raise exception 'Tệp đang trong một đệ trình, chờ thẩm tra xong.'; end if;
  v_from := c.vung;
  if not ((v_from = 'wip' and p_den in ('shared', 'archived')) or (v_from = 'shared' and p_den in ('wip', 'archived'))
       or (v_from = 'published' and p_den in ('archived', 'wip')) or (v_from = 'archived' and p_den = 'wip')) then
    if v_from = 'shared' and p_den = 'published' then raise exception 'Phát hành phải qua đệ trình và thẩm tra.'; end if;
    raise exception 'Không chuyển được từ % sang %.', v_from, p_den;
  end if;
  if p_den = 'shared' then
    if c.loi_ten is not null then raise exception 'Tên tệp chưa đúng tiêu chuẩn: %', c.loi_ten; end if;
    if c.loai = 'tai_lieu' then
      select v.scan_status into v_scan from public.sxd_bim_documents d join public.sxd_bim_document_versions v on v.id = d.current_version_id
       where d.id = c.document_id;
      if v_scan is distinct from 'clean' then raise exception 'Phiên bản hiện hành chưa qua kiểm tra an toàn.'; end if;
    else
      if c.model_id is null then raise exception 'Mô hình của tệp không còn.'; end if;
      select x.dat, x.diem_tong, x.diem_toi_thieu into v_ok, v_score, v_min from public.bim_ifc_xac_minh x
       where x.model_id = c.model_id order by x.created_at desc limit 1;
      if v_ok is null then raise exception 'Mô hình chưa được xác minh IFC. Chấm điểm trước khi chia sẻ.'; end if;
      if not v_ok then raise exception 'Mô hình chưa đạt xác minh IFC (điểm %, ngưỡng %).', v_score, v_min; end if;
    end if;
  end if;
  if p_ma_phu_hop is not null and not (
       (p_den = 'shared' and p_ma_phu_hop in ('S1', 'S2', 'S3', 'S4'))
    or (p_den = 'wip' and p_ma_phu_hop = 'S0')
    or (p_den = 'archived')) then
    raise exception 'Mã phù hợp % không dùng cho vùng %.', p_ma_phu_hop, p_den;
  end if;
  update public.document_cde_containers
     set vung = p_den,
         ma_phu_hop = coalesce(p_ma_phu_hop, case p_den when 'wip' then 'S0' when 'shared' then 'S2' else ma_phu_hop end),
         so_phien_ban = case when v_from = 'published' and p_den = 'wip' then so_phien_ban + 1 else so_phien_ban end,
         ma_sua_doi = case when v_from = 'published' and p_den = 'wip'
                           then 'P' || lpad((so_phien_ban + 1)::text, 2, '0') else ma_sua_doi end,
         updated_at = now()
   where id = c.id returning * into c;
  perform sxd_bim_document_private.cde_write(c.project_id, c.id, null, 'chuyen_vung', v_from, p_den,
    jsonb_build_object('ma_phu_hop', c.ma_phu_hop, 'ma_sua_doi', c.ma_sua_doi, 'ghi_chu', nullif(btrim(p_ghi_chu), '')));
  perform sxd_bim_document_private.cde_sync_model(c.id);
  return c;
end $$;

create function public.document_cde_submit(p_project uuid, p_tieu_de text, p_containers uuid[], p_ma_phu_hop_dich text,
  p_reviewers uuid[], p_ghi_chu text default null) returns public.document_cde_submissions
language plpgsql security definer set search_path = '' as $$
declare s public.document_cde_submissions; v_steps integer := coalesce(cardinality(p_reviewers), 0); i integer;
begin
  perform sxd_bim_document_private.cde_require_write(p_project);
  if coalesce(cardinality(p_containers), 0) = 0 then raise exception 'Chọn ít nhất một tệp để đệ trình.'; end if;
  if v_steps = 0 then raise exception 'Chọn ít nhất một người thẩm tra.'; end if;
  if v_steps > 10 then raise exception 'Chuỗi thẩm tra tối đa 10 bước.'; end if;
  if auth.uid() = any (p_reviewers) then raise exception 'Người đệ trình không tự thẩm tra hồ sơ của mình.'; end if;
  if (select count(distinct r) from unnest(p_reviewers) r) <> v_steps then
    raise exception 'Mỗi người chỉ thẩm tra một bước.';
  end if;
  if exists (select 1 from unnest(p_reviewers) r where r is null or not bim_private.is_project_person(p_project, r)) then
    raise exception 'Người thẩm tra phải là thành viên dự án.';
  end if;
  if exists (select 1 from unnest(p_containers) x(id) where not exists (
       select 1 from public.document_cde_containers c where c.id = x.id and c.project_id = p_project
          and c.deleted_at is null and c.vung = 'shared' and not c.dang_de_trinh)) then
    raise exception 'Chỉ đệ trình tệp ở vùng Chia sẻ (SHARED) của dự án và chưa nằm trong đệ trình khác.';
  end if;
  insert into public.document_cde_submissions (project_id, tieu_de, ma_phu_hop_dich, so_buoc, ghi_chu, nguoi_de_trinh_uid)
  values (p_project, btrim(p_tieu_de), p_ma_phu_hop_dich, v_steps, nullif(btrim(p_ghi_chu), ''), auth.uid())
  returning * into s;
  insert into public.document_cde_submission_items (submission_id, container_id, ma_sua_doi)
  select s.id, c.id, c.ma_sua_doi from public.document_cde_containers c where c.id = any (p_containers);
  for i in 1..v_steps loop
    insert into public.document_cde_reviews (submission_id, buoc, reviewer_id) values (s.id, i, p_reviewers[i]);
  end loop;
  update public.document_cde_containers set dang_de_trinh = true, ma_phu_hop = 'S4', updated_at = now()
   where id = any (p_containers);
  perform sxd_bim_document_private.cde_sync_model(x) from unnest(p_containers) x;
  perform sxd_bim_document_private.cde_write(p_project, null, s.id, 'de_trinh', 'shared', null,
    jsonb_build_object('tieu_de', s.tieu_de, 'so_tep', cardinality(p_containers), 'ma_phu_hop_dich', p_ma_phu_hop_dich,
                       'so_buoc', v_steps));
  return s;
end $$;

create function public.document_cde_decide(p_submission uuid, p_quyet_dinh text, p_ly_do text default null)
returns public.document_cde_submissions
language plpgsql security definer set search_path = '' as $$
declare s public.document_cde_submissions; r public.document_cde_reviews; c public.document_cde_containers;
begin
  select * into s from public.document_cde_submissions where id = p_submission for update;
  if not found or not sxd_bim_document_private.project_access(s.project_id) then raise exception 'Không tìm thấy đệ trình.'; end if;
  if s.trang_thai <> 'cho_tham_tra' then raise exception 'Đệ trình đã kết thúc.'; end if;
  select * into r from public.document_cde_reviews where submission_id = s.id and buoc = s.buoc_hien_tai for update;
  if r.reviewer_id is distinct from auth.uid() then
    raise exception 'Bước % do người khác thẩm tra.', s.buoc_hien_tai using errcode = '42501';
  end if;
  if p_quyet_dinh not in ('duyet', 'tra_lai') then raise exception 'Quyết định không hợp lệ.'; end if;
  if p_quyet_dinh = 'tra_lai' and coalesce(btrim(p_ly_do), '') = '' then raise exception 'Trả lại phải ghi lý do.'; end if;
  update public.document_cde_reviews set quyet_dinh = p_quyet_dinh, ly_do = nullif(btrim(p_ly_do), ''), quyet_dinh_luc = now()
   where id = r.id;
  perform sxd_bim_document_private.cde_write(s.project_id, null, s.id,
    case p_quyet_dinh when 'duyet' then 'tham_tra_duyet' else 'tham_tra_tra_lai' end, null, null,
    jsonb_build_object('buoc', s.buoc_hien_tai, 'ly_do', nullif(btrim(p_ly_do), '')));
  if p_quyet_dinh = 'tra_lai' then
    update public.document_cde_reviews set quyet_dinh = 'bo_qua' where submission_id = s.id and buoc > s.buoc_hien_tai;
    update public.document_cde_submissions set trang_thai = 'tra_lai', ket_thuc_luc = now() where id = s.id returning * into s;
    update public.document_cde_containers set dang_de_trinh = false, ma_phu_hop = 'S3', updated_at = now()
     where id in (select container_id from public.document_cde_submission_items where submission_id = s.id);
  elsif s.buoc_hien_tai < s.so_buoc then
    update public.document_cde_submissions set buoc_hien_tai = buoc_hien_tai + 1 where id = s.id returning * into s;
  else
    update public.document_cde_submissions set trang_thai = 'da_duyet', ket_thuc_luc = now() where id = s.id returning * into s;
    for c in
      update public.document_cde_containers
         set vung = 'published', dang_de_trinh = false, ma_phu_hop = s.ma_phu_hop_dich,
             so_lan_phat_hanh = so_lan_phat_hanh + 1, ma_sua_doi = 'C' || lpad((so_lan_phat_hanh + 1)::text, 2, '0'),
             updated_at = now()
       where id in (select container_id from public.document_cde_submission_items where submission_id = s.id)
      returning *
    loop
      perform sxd_bim_document_private.cde_write(c.project_id, c.id, s.id, 'phat_hanh', 'shared', 'published',
        jsonb_build_object('ma_phu_hop', c.ma_phu_hop, 'ma_sua_doi', c.ma_sua_doi));
    end loop;
  end if;
  perform sxd_bim_document_private.cde_sync_model(i.container_id)
     from public.document_cde_submission_items i where i.submission_id = s.id;
  return s;
end $$;

create function public.document_cde_cancel(p_submission uuid, p_ly_do text default null)
returns public.document_cde_submissions
language plpgsql security definer set search_path = '' as $$
declare s public.document_cde_submissions;
begin
  select * into s from public.document_cde_submissions where id = p_submission for update;
  if not found or not sxd_bim_document_private.project_access(s.project_id) then raise exception 'Không tìm thấy đệ trình.'; end if;
  if s.trang_thai <> 'cho_tham_tra' then raise exception 'Đệ trình đã kết thúc.'; end if;
  if s.nguoi_de_trinh_uid is distinct from auth.uid() and not bim_private.can_manage(s.project_id) then
    raise exception 'Chỉ người đệ trình hoặc quản lý dự án hủy được.' using errcode = '42501';
  end if;
  update public.document_cde_submissions set trang_thai = 'huy', ket_thuc_luc = now() where id = s.id returning * into s;
  update public.document_cde_reviews set quyet_dinh = 'bo_qua' where submission_id = s.id and quyet_dinh = 'cho';
  update public.document_cde_containers set dang_de_trinh = false, ma_phu_hop = 'S2', updated_at = now()
   where id in (select container_id from public.document_cde_submission_items where submission_id = s.id);
  perform sxd_bim_document_private.cde_sync_model(i.container_id)
     from public.document_cde_submission_items i where i.submission_id = s.id;
  perform sxd_bim_document_private.cde_write(s.project_id, null, s.id, 'huy_de_trinh', null, null,
    jsonb_build_object('ly_do', nullif(btrim(p_ly_do), '')));
  return s;
end $$;

-- Naming template and BIM stage; changing the template re-checks every container name of the project.
create function public.document_cde_settings_save(p_project uuid, p_mau_ten text, p_giai_doan text)
returns public.document_cde_settings
language plpgsql security definer set search_path = '' as $$
declare r public.document_cde_settings;
begin
  if not bim_private.can_manage(p_project) then
    raise exception 'Chỉ chủ dự án, quản lý dự án hoặc quản trị đơn vị đổi cấu hình CDE.' using errcode = '42501';
  end if;
  insert into public.document_cde_settings (project_id, mau_ten, giai_doan_bim, updated_by, updated_at)
  values (p_project, nullif(btrim(p_mau_ten), ''), coalesce(p_giai_doan, 'thiet_ke'), auth.uid(), now())
  on conflict (project_id) do update set mau_ten = excluded.mau_ten, giai_doan_bim = excluded.giai_doan_bim,
    updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  update public.document_cde_containers set loi_ten = public.document_cde_name_problem(ma_tep, r.mau_ten)
   where project_id = p_project;
  perform sxd_bim_document_private.cde_write(p_project, null, null, 'cau_hinh', null, null,
    jsonb_build_object('mau_ten', r.mau_ten, 'giai_doan_bim', r.giai_doan_bim));
  return r;
end $$;

-- ── 7. IFC verification (7 groups × 2 criteria, weights and thresholds by project stage) ────────────────────────
create table public.bim_ifc_cau_hinh (
  giai_doan text primary key check (giai_doan in ('chuan_bi', 'thiet_ke', 'thi_cong', 'ban_giao', 'van_hanh')),
  trong_so jsonb not null check (jsonb_typeof(trong_so) = 'object'),
  diem_toi_thieu numeric not null check (diem_toi_thieu between 0 and 100),
  nhom_bat_buoc jsonb not null default '{}' check (jsonb_typeof(nhom_bat_buoc) = 'object')
);
alter table public.bim_ifc_cau_hinh enable row level security;
create policy bim_ifc_cau_hinh_read on public.bim_ifc_cau_hinh for select to authenticated using (true);
revoke all on public.bim_ifc_cau_hinh from anon, authenticated;
grant select on public.bim_ifc_cau_hinh to authenticated;
insert into public.bim_ifc_cau_hinh (giai_doan, trong_so, diem_toi_thieu, nhom_bat_buoc) values
  ('chuan_bi', '{"dinh_danh":20,"phan_loai":15,"khong_gian":15,"vat_lieu":10,"khoi_luong":10,"thuoc_tinh":15,"tep":15}', 50, '{"dinh_danh":80}'),
  ('thiet_ke', '{"dinh_danh":20,"phan_loai":15,"khong_gian":15,"vat_lieu":10,"khoi_luong":15,"thuoc_tinh":15,"tep":10}', 60, '{"dinh_danh":90}'),
  ('thi_cong', '{"dinh_danh":15,"phan_loai":15,"khong_gian":15,"vat_lieu":15,"khoi_luong":20,"thuoc_tinh":10,"tep":10}', 70, '{"dinh_danh":95,"khoi_luong":60}'),
  ('ban_giao', '{"dinh_danh":15,"phan_loai":15,"khong_gian":15,"vat_lieu":15,"khoi_luong":15,"thuoc_tinh":15,"tep":10}', 80, '{"dinh_danh":100,"thuoc_tinh":70}'),
  ('van_hanh', '{"dinh_danh":15,"phan_loai":15,"khong_gian":20,"vat_lieu":10,"khoi_luong":10,"thuoc_tinh":20,"tep":10}', 80, '{"dinh_danh":100,"khong_gian":80}');

create table public.bim_ifc_xac_minh (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.bim_models(id) on delete cascade,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  giai_doan text not null,
  diem_tong numeric not null,
  diem_toi_thieu numeric not null,
  dat boolean not null,
  ly_do_khong_dat text[] not null default '{}',
  nhom jsonb not null,
  so_cau_kien integer not null,
  nguoi_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_ifc_xac_minh_model on public.bim_ifc_xac_minh (model_id, created_at desc);
create index bim_ifc_xac_minh_project on public.bim_ifc_xac_minh (project_id, created_at desc);
alter table public.bim_ifc_xac_minh enable row level security;
create policy bim_ifc_xac_minh_read on public.bim_ifc_xac_minh for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_ifc_xac_minh from anon, authenticated;
grant select on public.bim_ifc_xac_minh to authenticated;

-- Caller: a project member with write access, or the converter (service role: no auth.uid()) right after conversion.
create function public.bim_ifc_cham_diem(p_model uuid) returns public.bim_ifc_xac_minh
language plpgsql security definer set search_path = '' as $$
declare
  m public.bim_models; c record; cfg public.bim_ifc_cau_hinh; v_stage text;
  v_groups jsonb := '[]'; v_sum numeric := 0; v_weights numeric := 0; v_reasons text[] := '{}';
  v_result public.bim_ifc_xac_minh; v_schema numeric; v_file numeric; g record; v_score numeric; v_w numeric; v_min numeric;
  non_physical constant text[] := array['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT'];
begin
  select * into m from public.bim_models where id = p_model and deleted_at is null;
  if not found then raise exception 'Không tìm thấy mô hình.'; end if;
  if auth.uid() is not null and not bim_private.can_write(m.project_id) then
    raise exception 'Bạn không có quyền chấm điểm mô hình của dự án này.' using errcode = '42501';
  end if;
  if m.status <> 'ready' then raise exception 'Mô hình chưa chuyển đổi xong, chưa chấm điểm được.'; end if;
  select count(*)::numeric as tong,
         count(distinct global_id)::numeric as guid_duy_nhat,
         count(*) filter (where global_id ~ '^[0-9A-Za-z_$]{22}$')::numeric as guid_dung,
         count(*) filter (where upper(loai_cau_kien) <> 'IFCBUILDINGELEMENTPROXY')::numeric as khong_proxy,
         count(*) filter (where loai_cau_kien ~* '^IFC[A-Z0-9]+$')::numeric as co_loai,
         count(*) filter (where coalesce(btrim(phan_doan_tang), '') <> '')::numeric as co_tang,
         count(*) filter (where parent_express_id is not null)::numeric as co_cha,
         count(*) filter (where coalesce(btrim(vat_lieu), '') <> '')::numeric as co_vat_lieu,
         count(*) filter (where coalesce(btrim(vat_lieu), '') <> ''
                            and vat_lieu !~* '^(<unnamed>|unnamed|default|mặc định|none|n/a|-)$')::numeric as vat_lieu_ro,
         count(*) filter (where upper(loai_cau_kien) <> all (non_physical))::numeric as can_kl,
         count(*) filter (where upper(loai_cau_kien) <> all (non_physical)
                            and coalesce(the_tich_be_tong, dien_tich, chieu_dai, trong_luong) is not null)::numeric as co_kl,
         count(*) filter (where upper(loai_cau_kien) <> all (non_physical) and nguon_khoi_luong = 'qto')::numeric as kl_khai_bao,
         count(*) filter (where coalesce(btrim(ten_cau_kien), '') <> '')::numeric as co_ten,
         count(*) filter (where jsonb_typeof(thuoc_tinh -> 'psets') = 'object' and thuoc_tinh -> 'psets' <> '{}')::numeric as co_pset
    into c from public.bim_elements where model_id = p_model;
  if c.tong = 0 then raise exception 'Mô hình không có cấu kiện trong CSDL.'; end if;
  v_schema := (case when upper(coalesce(m.ifc_schema, '')) ~ '^IFC(2X3|4|4X1|4X2|4X3)' then 0.5 else 0 end)
            + (case when coalesce(btrim(m.phan_mem_tao), '') <> '' then 0.5 else 0 end);
  v_file := (case when coalesce(m.file_hash, '') <> '' then 0.5 else 0 end)
          + (case when coalesce((m.canh_bao ->> 'thieu_qto_ty_le')::numeric, 0) <= 0.5 then 0.5 else 0 end);
  select coalesce((select s.giai_doan_bim from public.document_cde_settings s where s.project_id = m.project_id), 'thiet_ke')
    into v_stage;
  select * into cfg from public.bim_ifc_cau_hinh where giai_doan = v_stage;
  for g in
    select * from (values
      ('dinh_danh', 'Định danh', 'guid_duy_nhat', 'GUID không trùng', c.guid_duy_nhat / c.tong, 'Tạo lại GlobalId cho cấu kiện trùng trước khi xuất IFC.',
                                 'guid_dung', 'GUID đúng định dạng 22 ký tự', c.guid_dung / c.tong, 'Kiểm tra bộ xuất IFC: GlobalId phải là chuỗi nén 22 ký tự.'),
      ('phan_loai', 'Phân loại IFC', 'khong_proxy', 'Không dùng IfcBuildingElementProxy', c.khong_proxy / c.tong, 'Ánh xạ lớp IFC đúng loại (cột, dầm, tường…) thay cho Proxy.',
                                 'co_loai', 'Có lớp IFC hợp lệ', c.co_loai / c.tong, 'Gán lớp IFC cho mọi cấu kiện xuất ra.'),
      ('khong_gian', 'Vị trí không gian', 'co_tang', 'Gán tầng', c.co_tang / c.tong, 'Đặt cấu kiện vào IfcBuildingStorey tương ứng.',
                                 'co_cha', 'Nằm trong cây không gian', c.co_cha / c.tong, 'Kiểm tra quan hệ IfcRelContainedInSpatialStructure.'),
      ('vat_lieu', 'Vật liệu', 'co_vat_lieu', 'Có vật liệu', c.co_vat_lieu / c.tong, 'Gán vật liệu (IfcMaterial) cho cấu kiện.',
                                 'vat_lieu_ro', 'Vật liệu có tên cụ thể', c.vat_lieu_ro / c.tong, 'Đổi tên vật liệu mặc định thành tên vật liệu thật.'),
      ('khoi_luong', 'Khối lượng', 'co_kl', 'Có đại lượng khối lượng', case when c.can_kl = 0 then 1 else c.co_kl / c.can_kl end, 'Xuất Base Quantities (Qto) khi xuất IFC.',
                                 'kl_khai_bao', 'Khối lượng khai báo, không ước tính hình học', case when c.can_kl = 0 then 1 else c.kl_khai_bao / c.can_kl end, 'Bật xuất Qto thay cho tính lại từ hình học.'),
      ('thuoc_tinh', 'Thuộc tính', 'co_ten', 'Có tên cấu kiện', c.co_ten / c.tong, 'Đặt tên cấu kiện theo quy ước của dự án.',
                                 'co_pset', 'Có bộ thuộc tính (Pset)', c.co_pset / c.tong, 'Xuất Pset chuẩn và Pset dự án theo yêu cầu thông tin (EIR).'),
      ('tep', 'Tệp và nguồn gốc', 'schema', 'Schema IFC và phần mềm tạo', v_schema, 'Xuất IFC2X3/IFC4 và ghi phần mềm tạo trong header.',
                                 'toan_ven', 'Tệp nguyên vẹn, ít cảnh báo chuyển đổi', v_file, 'Tải lại tệp gốc; kiểm tra cảnh báo thiếu Qto khi chuyển đổi.')
    ) as t(ma, ten, ma1, ten1, ty1, kn1, ma2, ten2, ty2, kn2)
  loop
    v_score := round(((g.ty1 + g.ty2) / 2) * 100, 1);
    v_w := coalesce((cfg.trong_so ->> g.ma)::numeric, 0);
    v_sum := v_sum + v_score * v_w;
    v_weights := v_weights + v_w;
    v_min := (cfg.nhom_bat_buoc ->> g.ma)::numeric;
    if v_min is not null and v_score < v_min then
      v_reasons := v_reasons || format('Nhóm %s đạt %s, cần tối thiểu %s.', g.ten, v_score, v_min);
    end if;
    v_groups := v_groups || jsonb_build_object('ma', g.ma, 'ten', g.ten, 'diem', v_score, 'trong_so', v_w, 'toi_thieu', v_min,
      'tieu_chi', jsonb_build_array(
        jsonb_build_object('ma', g.ma1, 'ten', g.ten1, 'ty_le', round(g.ty1, 4), 'khuyen_nghi', case when g.ty1 < 1 then g.kn1 end),
        jsonb_build_object('ma', g.ma2, 'ten', g.ten2, 'ty_le', round(g.ty2, 4), 'khuyen_nghi', case when g.ty2 < 1 then g.kn2 end)));
  end loop;
  v_score := case when v_weights = 0 then 0 else round(v_sum / v_weights, 1) end;
  if v_score < cfg.diem_toi_thieu then
    v_reasons := array_prepend(format('Điểm tổng %s thấp hơn ngưỡng %s của giai đoạn.', v_score, cfg.diem_toi_thieu), v_reasons);
  end if;
  insert into public.bim_ifc_xac_minh (model_id, project_id, giai_doan, diem_tong, diem_toi_thieu, dat, ly_do_khong_dat, nhom,
    so_cau_kien, nguoi_uid)
  values (p_model, m.project_id, cfg.giai_doan, v_score, cfg.diem_toi_thieu, cardinality(v_reasons) = 0, v_reasons, v_groups,
    c.tong::integer, auth.uid())
  returning * into v_result;
  perform sxd_bim_document_private.cde_write(m.project_id, (select id from public.document_cde_containers where model_id = p_model),
    null, 'xac_minh_ifc', null, null,
    jsonb_build_object('model_id', p_model, 'diem', v_score, 'dat', v_result.dat, 'giai_doan', cfg.giai_doan));
  return v_result;
end $$;

-- Elements failing one criterion (highlight in the viewer, attach to the report). At most 200.
create function public.bim_ifc_mau_loi(p_model uuid, p_tieu_chi text, p_limit integer default 50)
returns table (express_id integer, global_id text, ten_cau_kien text, loai_cau_kien text)
language sql stable security invoker set search_path = '' as $$
  select e.express_id, e.global_id::text, e.ten_cau_kien, e.loai_cau_kien
    from public.bim_elements e
   where e.model_id = p_model
     and case p_tieu_chi
       when 'guid_duy_nhat' then e.global_id in (select x.global_id from public.bim_elements x where x.model_id = p_model
                                                  group by x.global_id having count(*) > 1)
       when 'guid_dung' then e.global_id !~ '^[0-9A-Za-z_$]{22}$'
       when 'khong_proxy' then upper(e.loai_cau_kien) = 'IFCBUILDINGELEMENTPROXY'
       when 'co_loai' then e.loai_cau_kien !~* '^IFC[A-Z0-9]+$'
       when 'co_tang' then coalesce(btrim(e.phan_doan_tang), '') = ''
       when 'co_cha' then e.parent_express_id is null
       when 'co_vat_lieu' then coalesce(btrim(e.vat_lieu), '') = ''
       when 'vat_lieu_ro' then coalesce(btrim(e.vat_lieu), '') = '' or e.vat_lieu ~* '^(<unnamed>|unnamed|default|mặc định|none|n/a|-)$'
       when 'co_kl' then upper(e.loai_cau_kien) not in ('IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT')
                         and coalesce(e.the_tich_be_tong, e.dien_tich, e.chieu_dai, e.trong_luong) is null
       when 'kl_khai_bao' then upper(e.loai_cau_kien) not in ('IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT')
                         and coalesce(e.nguon_khoi_luong, '') <> 'qto'
       when 'co_ten' then coalesce(btrim(e.ten_cau_kien), '') = ''
       when 'co_pset' then jsonb_typeof(e.thuoc_tinh -> 'psets') is distinct from 'object' or e.thuoc_tinh -> 'psets' = '{}'
       else false end
   order by e.express_id
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- ── 8. Information quality ──────────────────────────────────────────────────────────────────────────────────────
create function public.bim_quality_check(p_model uuid, p_samples integer default 50) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with e as (
    select el.express_id, el.global_id::text as global_id, el.ten_cau_kien, el.loai_cau_kien, el.phan_doan_tang, el.vat_lieu,
           el.the_tich_be_tong, el.dien_tich, el.chieu_dai, el.nguon_khoi_luong, el.thuoc_tinh,
           row_number() over (partition by el.global_id order by el.express_id) as guid_rank
      from public.bim_elements el where el.model_id = p_model
  ), flags as (
    select e.express_id, e.global_id, e.ten_cau_kien, e.loai_cau_kien, rule
      from e cross join lateral (values
        ('thieu_ten', btrim(coalesce(e.ten_cau_kien, '')) = '' or btrim(e.ten_cau_kien) ~* '^(unnamed|no ?name|default)$'),
        ('thieu_vat_lieu', coalesce(e.vat_lieu, '') = ''),
        ('thieu_tang', coalesce(e.phan_doan_tang, '') = ''),
        ('thieu_khoi_luong', not (coalesce(e.the_tich_be_tong, 0) > 0 or coalesce(e.dien_tich, 0) > 0 or coalesce(e.chieu_dai, 0) > 0)),
        ('khoi_luong_uoc_tinh', (coalesce(e.the_tich_be_tong, 0) > 0 or coalesce(e.dien_tich, 0) > 0 or coalesce(e.chieu_dai, 0) > 0)
                                and e.nguon_khoi_luong = 'hinh_hoc'),
        ('thieu_pset', jsonb_typeof(e.thuoc_tinh -> 'psets') is distinct from 'object' or e.thuoc_tinh -> 'psets' = '{}'),
        ('thieu_kieu', coalesce(e.thuoc_tinh -> 'kieu' ->> 'ten', '') = ''),
        ('trung_guid', e.guid_rank > 1)
      ) r(rule, hit)
     where r.hit
  ), ranked as (
    select f.*, row_number() over (partition by f.rule order by f.express_id) as n from flags f
  )
  select jsonb_build_object(
    'total', (select count(*) from e),
    'counts', coalesce((select jsonb_object_agg(rule, c) from (select rule, count(*) c from flags group by rule) s), '{}'),
    'samples', coalesce((select jsonb_object_agg(rule, s) from (
        select rule, jsonb_agg(jsonb_build_object('express_id', express_id, 'global_id', global_id,
          'ten_cau_kien', ten_cau_kien, 'loai_cau_kien', loai_cau_kien) order by express_id) s
          from ranked where n <= greatest(0, least(coalesce(p_samples, 50), 200)) group by rule) x), '{}'),
    'checked_at', now())
$$;

create function public.bim_field_quality(p_project uuid) returns table (model_id uuid, chat_luong jsonb)
language sql stable security invoker set search_path = '' as $$
  select e.model_id, jsonb_build_object('so_cau_kien', count(*),
    'co_qto', count(*) filter (where e.nguon_khoi_luong = 'qto'),
    -- Quantities declared in a property set (lib/dataQuality adds them to Qto); the converter reads Qto only today.
    'co_pset', count(*) filter (where e.nguon_khoi_luong = 'pset'),
    'uoc_tinh', count(*) filter (where e.nguon_khoi_luong = 'hinh_hoc'),
    'khong_khoi_luong', count(*) filter (where e.the_tich_be_tong is null and e.dien_tich is null and e.chieu_dai is null
                                            and e.trong_luong is null),
    'co_vat_lieu', count(*) filter (where nullif(btrim(e.vat_lieu), '') is not null),
    'co_tang', count(*) filter (where nullif(btrim(e.phan_doan_tang), '') is not null),
    'co_ten', count(*) filter (where nullif(btrim(e.ten_cau_kien), '') is not null),
    'proxy', count(*) filter (where upper(e.loai_cau_kien) = 'IFCBUILDINGELEMENTPROXY'),
    'co_van_khuon', count(*) filter (where e.dien_tich_van_khuon is not null),
    'co_phan_loai', count(*) filter (where jsonb_typeof(e.thuoc_tinh -> 'phan_loai') = 'array' and e.thuoc_tinh -> 'phan_loai' <> '[]'))
    from public.bim_elements e join public.bim_models m on m.id = e.model_id and m.status = 'ready' and m.deleted_at is null
   where e.project_id = p_project and m.project_id = p_project
   group by e.model_id
$$;

-- ── 9. LOD 500 (as-built) ───────────────────────────────────────────────────────────────────────────────────────
-- Imports field verification rows (Excel/CSV); every GlobalId must exist in the model.
create function public.bim_xac_minh_ghi(p_model uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_n integer; v_bad text;
begin
  select project_id into v_project from public.bim_models where id = p_model and deleted_at is null;
  if v_project is null then raise exception 'Không tìm thấy mô hình.'; end if;
  if not bim_private.can_write(v_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Không có phiếu xác minh.'; end if;
  if jsonb_array_length(p_rows) > 20000 then raise exception 'Tối đa 20.000 dòng mỗi lần nhập.'; end if;
  select string_agg(distinct r ->> 'global_id', ', ') into v_bad from jsonb_array_elements(p_rows) r
   where not exists (select 1 from public.bim_elements e where e.model_id = p_model and e.global_id = r ->> 'global_id');
  if v_bad is not null then raise exception 'GlobalId không có trong mô hình: %', left(v_bad, 300); end if;
  insert into public.bim_xac_minh_hien_truong (project_id, model_id, global_id, ket_qua, ngay_xac_minh, don_vi_xac_minh,
    phuong_phap, sai_so_mm, dung_sai_mm, bien_ban, ly_do, nguoi_nhap_uid, nguon)
  select v_project, p_model, r ->> 'global_id', r ->> 'ket_qua', nullif(r ->> 'ngay_xac_minh', '')::date,
         nullif(btrim(r ->> 'don_vi_xac_minh'), ''), nullif(r ->> 'phuong_phap', ''), nullif(r ->> 'sai_so_mm', '')::numeric,
         nullif(r ->> 'dung_sai_mm', '')::numeric, nullif(btrim(r ->> 'bien_ban'), ''), nullif(btrim(r ->> 'ly_do'), ''),
         auth.uid(), 'excel'
    from (select distinct on (x ->> 'global_id') x as r from jsonb_array_elements(p_rows) x) d
  on conflict (model_id, global_id) do update
     set ket_qua = excluded.ket_qua, ngay_xac_minh = excluded.ngay_xac_minh, don_vi_xac_minh = excluded.don_vi_xac_minh,
         phuong_phap = excluded.phuong_phap, sai_so_mm = excluded.sai_so_mm, dung_sai_mm = excluded.dung_sai_mm,
         bien_ban = excluded.bien_ban, ly_do = excluded.ly_do, nguoi_nhap_uid = auth.uid(), nguon = 'excel',
         phieu_id = null, updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create table public.bim_lod_danh_gia (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.bim_models(id) on delete cascade,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  muc_lod integer not null default 500 check (muc_lod = 500),
  dat boolean not null,
  tieu_chi jsonb not null,
  so_cau_kien integer not null,
  so_trong_pham_vi integer not null,
  so_ngoai_pham_vi integer not null,
  nguoi_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_lod_danh_gia_model on public.bim_lod_danh_gia (model_id, created_at desc);
alter table public.bim_lod_danh_gia enable row level security;
create policy bim_lod_danh_gia_read on public.bim_lod_danh_gia for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_lod_danh_gia from anon, authenticated;
grant select on public.bim_lod_danh_gia to authenticated;
create function bim_private.lod_locked() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Kết quả đánh giá LOD là bản ghi lịch sử, không sửa hoặc xóa.';
end $$;
create trigger bim_lod_danh_gia_locked before update or delete on public.bim_lod_danh_gia
  for each row execute function bim_private.lod_locked();

create function public.bim_lod500_danh_gia(p_model uuid) returns public.bim_lod_danh_gia
language plpgsql security definer set search_path = '' as $$
declare
  m public.bim_models; c record; v_criteria jsonb; v_pass boolean; v_result public.bim_lod_danh_gia; v_samples jsonb;
  t_geom numeric; t_verified numeric; t_tolerance numeric; t_record numeric;
  non_physical constant text[] := array['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT'];
  -- Elements counted by piece (terminals, equipment, doors, valves…): the count is their quantity.
  by_piece constant text := '(TERMINAL|FIXTURE|DOOR|WINDOW|VALVE|BOARD|EQUIPMENT|CHILLER|TANK|PUMP|FAN|BOILER|SENSOR|ALARM|OUTLET|SWITCHINGDEVICE|APPLIANCE|FURNISHING|DAMPER|CONTROLLER|TRANSFORMER|GENERATOR|COOLINGTOWER|COMPRESSOR|TRANSPORTELEMENT)';
begin
  select * into m from public.bim_models where id = p_model and deleted_at is null;
  if not found or not sxd_bim_document_private.project_access(m.project_id) then raise exception 'Không tìm thấy mô hình.'; end if;
  if m.status <> 'ready' then raise exception 'Mô hình chưa chuyển đổi xong.'; end if;
  select count(*)::numeric tong,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and coalesce(x.ket_qua, '') <> 'ngoai_pham_vi')::numeric pham_vi,
         count(*) filter (where x.ket_qua = 'ngoai_pham_vi')::numeric ngoai,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and coalesce(x.ket_qua, '') <> 'ngoai_pham_vi'
                            and (coalesce(e.the_tich_be_tong, e.dien_tich, e.chieu_dai, e.trong_luong) is not null
                                 or upper(e.loai_cau_kien) ~ by_piece))::numeric co_kl,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and x.ket_qua = 'dat')::numeric da_dat,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and x.ket_qua = 'sai_lech')::numeric sai_lech,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and x.ket_qua in ('dat', 'sai_lech')
                            and length(btrim(coalesce(x.bien_ban, ''))) > 0)::numeric co_bien_ban
    into c
    from public.bim_elements e
    left join public.bim_xac_minh_hien_truong x on x.model_id = e.model_id and x.global_id = e.global_id
   where e.model_id = p_model;
  if c.tong = 0 then raise exception 'Mô hình không có cấu kiện trong CSDL.'; end if;
  t_geom := case when c.pham_vi = 0 then null else round(c.co_kl / c.pham_vi * 100, 1) end;
  t_verified := case when c.pham_vi = 0 then null else round(c.da_dat / c.pham_vi * 100, 1) end;
  t_tolerance := case when c.da_dat + c.sai_lech = 0 then null else round(c.da_dat / (c.da_dat + c.sai_lech) * 100, 1) end;
  t_record := case when c.da_dat + c.sai_lech = 0 then null else round(c.co_bien_ban / (c.da_dat + c.sai_lech) * 100, 1) end;
  select coalesce(jsonb_agg(g), '[]') into v_samples from (
    select e.global_id g from public.bim_elements e
      left join public.bim_xac_minh_hien_truong x on x.model_id = e.model_id and x.global_id = e.global_id
     where e.model_id = p_model and upper(e.loai_cau_kien) <> all (non_physical) and x.id is null
     order by e.express_id limit 10) s;
  v_criteria := jsonb_build_array(
    jsonb_build_object('ma', 'hinh_hoc', 'ten', 'Hình học và khối lượng', 'ty_le', t_geom, 'nguong', 95,
      'mo_ta', 'Cấu kiện trong phạm vi có đại lượng (thể tích, diện tích, chiều dài, trọng lượng; thiết bị và đầu cuối tính theo cái).'),
    jsonb_build_object('ma', 'xac_minh', 'ten', 'Xác minh hiện trường', 'ty_le', t_verified, 'nguong', 95,
      'mo_ta', 'Cấu kiện trong phạm vi có phiếu xác minh kết quả đạt.', 'guid_chua_xac_minh', v_samples),
    jsonb_build_object('ma', 'dung_sai', 'ten', 'Dung sai', 'ty_le', t_tolerance, 'nguong', 100,
      'mo_ta', 'Không còn phiếu sai lệch vượt dung sai chưa xử lý.', 'so_sai_lech', c.sai_lech),
    jsonb_build_object('ma', 'bien_ban', 'ten', 'Biên bản / hồ sơ hoàn công', 'ty_le', t_record, 'nguong', 100,
      'mo_ta', 'Phiếu xác minh có số biên bản nghiệm thu hoặc hồ sơ hoàn công.'));
  select bool_and((t ->> 'ty_le') is not null and (t ->> 'ty_le')::numeric >= (t ->> 'nguong')::numeric)
    into v_pass from jsonb_array_elements(v_criteria) t;
  insert into public.bim_lod_danh_gia (model_id, project_id, dat, tieu_chi, so_cau_kien, so_trong_pham_vi, so_ngoai_pham_vi, nguoi_uid)
  values (p_model, m.project_id, coalesce(v_pass, false), v_criteria, c.tong::integer, c.pham_vi::integer, c.ngoai::integer, auth.uid())
  returning * into v_result;
  return v_result;
end $$;

-- ── 10. Organization data standards (IDS 1.0 files) ─────────────────────────────────────────────────────────────
create table public.bim_chuan_du_lieu (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sxd_bim_organizations(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  phien_ban text check (phien_ban is null or length(phien_ban) <= 40),
  mo_ta text check (mo_ta is null or length(mo_ta) <= 2000),
  ids_xml text not null check (length(ids_xml) between 50 and 2000000 and ids_xml ~ '<([A-Za-z0-9_]+:)?ids[\s>]'),
  sha256 text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, sha256)
);
create function bim_private.standard_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.sha256 := encode(extensions.digest(convert_to(new.ids_xml, 'UTF8'), 'sha256'), 'hex');
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
create trigger bim_chuan_du_lieu_stamp before insert on public.bim_chuan_du_lieu
  for each row execute function bim_private.standard_stamp();
alter table public.bim_chuan_du_lieu enable row level security;
create policy bim_chuan_du_lieu_read on public.bim_chuan_du_lieu for select to authenticated
  using (sxd_bim_appraisal_private.org_access(organization_id, false));
create policy bim_chuan_du_lieu_insert on public.bim_chuan_du_lieu for insert to authenticated
  with check (sxd_bim_appraisal_private.org_access(organization_id, true));
create policy bim_chuan_du_lieu_delete on public.bim_chuan_du_lieu for delete to authenticated
  using (sxd_bim_appraisal_private.org_access(organization_id, true));
revoke all on public.bim_chuan_du_lieu from anon, authenticated;
grant select, insert, delete on public.bim_chuan_du_lieu to authenticated;

-- ── 11. Add-in upload keys (bim-ingest Edge Function) ───────────────────────────────────────────────────────────
create table public.bim_addin_token (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 120),
  tien_to text not null,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  nguoi_tao_uid uuid not null,
  created_at timestamptz not null default now(),
  het_han timestamptz not null,
  thu_hoi_luc timestamptz,
  lan_dung_cuoi timestamptz,
  so_lan_dung integer not null default 0
);
alter table public.bim_addin_token enable row level security;
revoke all on public.bim_addin_token from anon, authenticated;
-- The hash column is never readable by app users.
grant select (id, project_id, ten, tien_to, nguoi_tao_uid, created_at, het_han, thu_hoi_luc, lan_dung_cuoi, so_lan_dung)
  on public.bim_addin_token to authenticated;
create policy bim_addin_token_read on public.bim_addin_token for select to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]));

-- Returns the clear key ONCE; only its SHA-256 is stored.
create function public.bim_addin_tao_khoa(p_project uuid, p_ten text, p_so_ngay integer default 90) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.uid() is null or not bim_private.can_write(p_project) then
    raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501';
  end if;
  if p_so_ngay is null or p_so_ngay not between 1 and 365 then raise exception 'Thời hạn khóa từ 1 đến 365 ngày.'; end if;
  v_token := 'bimk_' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.bim_addin_token (project_id, ten, tien_to, token_sha256, nguoi_tao_uid, het_han)
  values (p_project, btrim(p_ten), left(v_token, 12), encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
          auth.uid(), now() + make_interval(days => p_so_ngay));
  return v_token;
end $$;
create function public.bim_addin_thu_hoi(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select project_id into v from public.bim_addin_token where id = p_id;
  if v is null or auth.uid() is null or not bim_private.can_write(v) then raise exception 'Không tìm thấy khóa.'; end if;
  update public.bim_addin_token set thu_hoi_luc = coalesce(thu_hoi_luc, now()) where id = p_id;
end $$;

-- Service role only (bim-ingest): validate a key and count its use.
create function public.bim_addin_xac_thuc(p_token text) returns table (token_id uuid, project_id uuid, tien_to text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.bim_addin_token t set lan_dung_cuoi = now(), so_lan_dung = t.so_lan_dung + 1
   where t.token_sha256 = encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex')
     and t.thu_hoi_luc is null and t.het_han > now()
  returning t.id, t.project_id, t.tien_to;
end $$;
-- Same rules as bim_register_model_upload: path in the project's models folder, SHA-256, no duplicate, server version.
create function public.bim_addin_dang_ky_mo_hinh(p_token text, p_ifc_path text, p_file_name text, p_file_size bigint,
  p_file_hash text, p_discipline text default 'TOAN_THE', p_previous_model uuid default null)
returns public.bim_models
language plpgsql security definer set search_path = '' as $$
declare k record; v_prev public.bim_models; v_dup public.bim_models; v_root uuid; v_version integer := 1; v_row public.bim_models;
begin
  select * into k from public.bim_addin_xac_thuc(p_token);
  if k.project_id is null then raise exception 'Khóa add-in không hợp lệ, đã hết hạn hoặc đã thu hồi.' using errcode = '28000'; end if;
  if p_ifc_path is null or p_ifc_path not like 'models/' || k.project_id::text || '/%' then
    raise exception 'Đường dẫn tệp không thuộc thư mục mô hình của dự án.';
  end if;
  if coalesce(p_file_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Thiếu mã băm SHA-256 của tệp.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'bim-models' and o.name = p_ifc_path) then
    raise exception 'Không tìm thấy tệp đã tải lên (%).', p_ifc_path;
  end if;
  perform pg_advisory_xact_lock(hashtext('bim_models:' || k.project_id::text));
  select * into v_dup from public.bim_models where project_id = k.project_id and file_hash = p_file_hash and deleted_at is null limit 1;
  if v_dup.id is not null then
    raise exception using errcode = 'unique_violation', message = format('Tệp này đã có trong dự án (mô hình "%s").', v_dup.file_name),
      detail = v_dup.id::text;
  end if;
  if p_previous_model is not null then
    select * into v_prev from public.bim_models where id = p_previous_model;
    if v_prev.id is null or v_prev.project_id <> k.project_id or v_prev.deleted_at is not null then
      raise exception 'Phiên bản trước không thuộc dự án của khóa.';
    end if;
    v_root := coalesce(v_prev.model_root_id, v_prev.id);
    select coalesce(max(m.phien_ban), 0) + 1 into v_version from public.bim_models m where m.model_root_id = v_root;
  end if;
  insert into public.bim_models (project_id, file_name, file_size, ifc_path, status, discipline, uploaded_by, file_hash,
    phien_ban, model_goc_id)
  values (k.project_id, left(p_file_name, 300), p_file_size, p_ifc_path, 'uploaded',
          coalesce(v_prev.discipline, nullif(p_discipline, ''), 'TOAN_THE'), 'addin:' || k.tien_to, p_file_hash, v_version, v_prev.id)
  returning * into v_row;
  return v_row;
end $$;
create function public.bim_addin_trang_thai(p_token text, p_model uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k record; m public.bim_models; x jsonb;
begin
  select * into k from public.bim_addin_xac_thuc(p_token);
  if k.project_id is null then raise exception 'Khóa add-in không hợp lệ, đã hết hạn hoặc đã thu hồi.' using errcode = '28000'; end if;
  select * into m from public.bim_models where id = p_model and project_id = k.project_id;
  if not found then raise exception 'Không tìm thấy mô hình trong dự án của khóa.'; end if;
  select to_jsonb(v) - 'nhom' into x from public.bim_ifc_xac_minh v where v.model_id = m.id order by v.created_at desc limit 1;
  return jsonb_build_object('model_id', m.id, 'project_id', m.project_id, 'status', m.status, 'element_count', m.element_count,
    'error_message', m.error_message, 'phien_ban', m.phien_ban, 'xac_minh_ifc', x);
end $$;

-- ── 12. Execute grants ──────────────────────────────────────────────────────────────────────────────────────────
revoke all on function sxd_bim_document_private.cde_log_locked(), sxd_bim_document_private.cde_write(uuid, uuid, uuid, text, text, text, jsonb),
  sxd_bim_document_private.cde_template(uuid), sxd_bim_document_private.cde_require_write(uuid), sxd_bim_document_private.cde_name_from(uuid, text, uuid),
  sxd_bim_document_private.cde_sync_model(uuid), sxd_bim_document_private.cde_cancel_for(uuid, text), sxd_bim_document_private.cde_new_revision(uuid, jsonb),
  sxd_bim_document_private.cde_from_document(), sxd_bim_document_private.cde_from_model(), sxd_bim_document_private.cde_model_purged(),
  bim_private.lod_locked(), bim_private.standard_stamp() from public, anon, authenticated;
revoke all on function public.document_cde_field_count(text), public.document_cde_name_problem(text, text),
  public.document_cde_rename(uuid, text, text), public.document_cde_move(uuid, text, text, text),
  public.document_cde_submit(uuid, text, uuid[], text, uuid[], text), public.document_cde_decide(uuid, text, text),
  public.document_cde_cancel(uuid, text), public.document_cde_settings_save(uuid, text, text),
  public.bim_ifc_cham_diem(uuid), public.bim_ifc_mau_loi(uuid, text, integer), public.bim_quality_check(uuid, integer),
  public.bim_field_quality(uuid), public.bim_xac_minh_ghi(uuid, jsonb), public.bim_lod500_danh_gia(uuid),
  public.bim_addin_tao_khoa(uuid, text, integer), public.bim_addin_thu_hoi(uuid) from public, anon;
grant execute on function public.document_cde_field_count(text), public.document_cde_name_problem(text, text),
  public.document_cde_rename(uuid, text, text), public.document_cde_move(uuid, text, text, text),
  public.document_cde_submit(uuid, text, uuid[], text, uuid[], text), public.document_cde_decide(uuid, text, text),
  public.document_cde_cancel(uuid, text), public.document_cde_settings_save(uuid, text, text),
  public.bim_ifc_cham_diem(uuid), public.bim_ifc_mau_loi(uuid, text, integer), public.bim_quality_check(uuid, integer),
  public.bim_field_quality(uuid), public.bim_xac_minh_ghi(uuid, jsonb), public.bim_lod500_danh_gia(uuid),
  public.bim_addin_tao_khoa(uuid, text, integer), public.bim_addin_thu_hoi(uuid) to authenticated;
grant execute on function public.bim_ifc_cham_diem(uuid) to service_role;
revoke all on function public.bim_addin_xac_thuc(text),
  public.bim_addin_dang_ky_mo_hinh(text, text, text, bigint, text, text, uuid), public.bim_addin_trang_thai(text, uuid)
  from public, anon, authenticated;
grant execute on function public.bim_addin_xac_thuc(text),
  public.bim_addin_dang_ky_mo_hinh(text, text, text, bigint, text, text, uuid), public.bim_addin_trang_thai(text, uuid)
  to service_role;

notify pgrst, 'reload schema';

-- Upstream: 20261027130000_bim_schedule_cost.sql
-- BIM module phase B5 (ACC Schedule and Cost): 4D schedule, quantities, unit prices and estimates, bids, cash flow and
-- EVM, budget, contracts with BOQ items, change orders linked to elements, design options.
-- cic-hud ran 4D on the ERP construction-progress table, BOQ on ERP contracts and change orders on ERP contract
-- appendices. BuildSIA has no ERP: schedule tasks, contracts/BOQ, budget lines and change orders are BIM-owned tables of
-- the project. RPC names stay those of cic-hud where the ported client calls them. Other changes:
--   * one schedule per project (cic-hud: per ERP work item); summary rows are a column, not a note marker;
--   * norms come from the BuildSIA construction norm library (TT12/2021, served by /api/construction-norms):
--     bim_don_gia.ma_dinh_muc keeps the norm id; there is no second norm table;
--   * approving an estimate or a change order needs the project manager role (can_manage), not the submitter's;
--   * signed contracts keep their BOQ: quantities and prices change only through approved change orders;
--   * EVM reads the BIM schedule; actual cost (AC) is entered when closing a period (no ERP disbursements).

-- ── 1. Schedule (4D) ────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_schedule_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ma_wbs text not null check (length(btrim(ma_wbs)) between 1 and 60),
  ten text not null check (length(btrim(ten)) between 1 and 500),
  bat_dau date,
  ket_thuc date,
  bat_dau_thuc_te date,
  ket_thuc_thuc_te date,
  phan_tram_thuc_te numeric check (phan_tram_thuc_te is null or phan_tram_thuc_te between 0 and 100),
  ty_trong numeric not null default 0 check (ty_trong >= 0),
  tien_nhiem_id uuid references public.bim_schedule_tasks(id) on delete set null,
  vi_tri text,
  bo_mon text,
  la_tom_tat boolean not null default false,
  thu_tu integer not null default 0,
  ghi_chu text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ma_wbs),
  check (ket_thuc is null or bat_dau is null or ket_thuc >= bat_dau),
  check (ket_thuc_thuc_te is null or bat_dau_thuc_te is null or ket_thuc_thuc_te >= bat_dau_thuc_te),
  check (tien_nhiem_id is null or tien_nhiem_id <> id)
);
create index bim_schedule_tasks_project on public.bim_schedule_tasks (project_id, thu_tu, ma_wbs);
create function bim_private.schedule_task_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.tien_nhiem_id is not null and not exists (
       select 1 from public.bim_schedule_tasks t where t.id = new.tien_nhiem_id and t.project_id = new.project_id) then
    raise exception 'Công việc tiền nhiệm phải thuộc cùng dự án.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_schedule_tasks_guard before insert or update on public.bim_schedule_tasks
  for each row execute function bim_private.schedule_task_guard();
alter table public.bim_schedule_tasks enable row level security;
create policy bim_schedule_tasks_read on public.bim_schedule_tasks for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_schedule_tasks_write on public.bim_schedule_tasks for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_schedule_tasks from anon, authenticated;
grant select, insert, update, delete on public.bim_schedule_tasks to authenticated;

-- Element ↔ task: one row per element per task (leaf tasks only).
create table public.bim_schedule_links (
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  task_id uuid not null references public.bim_schedule_tasks(id) on delete cascade,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  global_id varchar(22) not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (task_id, model_id, global_id)
);
create index bim_schedule_links_element on public.bim_schedule_links (project_id, model_id, global_id);
create function bim_private.schedule_link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.bim_schedule_tasks t where t.id = new.task_id and t.project_id = new.project_id
                   and not t.la_tom_tat) then
    raise exception 'Chỉ gắn cấu kiện vào công việc chi tiết của dự án.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.bim_elements e join public.bim_models m on m.id = e.model_id
                  where e.model_id = new.model_id and e.global_id = new.global_id and m.project_id = new.project_id) then
    raise exception 'Cấu kiện không thuộc mô hình của dự án.' using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  return new;
end $$;
create trigger bim_schedule_links_guard before insert on public.bim_schedule_links
  for each row execute function bim_private.schedule_link_guard();
alter table public.bim_schedule_links enable row level security;
create policy bim_schedule_links_read on public.bim_schedule_links for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_schedule_links from anon, authenticated;
grant select on public.bim_schedule_links to authenticated;

-- Link or unlink the viewer selection ([{modelId, guid}]) to a task, all or nothing.
create function public.bim_link_schedule_selection(p_project uuid, p_task uuid, p_elements jsonb, p_remove boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if jsonb_typeof(p_elements) <> 'array' or jsonb_array_length(p_elements) not between 1 and 20000 then
    raise exception 'Chọn từ 1 đến 20.000 cấu kiện.';
  end if;
  if p_remove then
    delete from public.bim_schedule_links l
     using jsonb_array_elements(p_elements) x
     where l.task_id = p_task and l.project_id = p_project
       and l.model_id = (x ->> 'modelId')::uuid and l.global_id = x ->> 'guid';
  else
    insert into public.bim_schedule_links (project_id, task_id, model_id, global_id)
    select distinct p_project, p_task, (x ->> 'modelId')::uuid, x ->> 'guid' from jsonb_array_elements(p_elements) x
    on conflict do nothing;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Baselines: snapshot of tasks, links and models taken by the server; insert only.
create table public.bim_schedule_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  tasks jsonb not null default '{}',
  links jsonb not null default '{}',
  models jsonb not null default '[]',
  created_by uuid,
  created_at timestamptz not null default now()
);
create function bim_private.schedule_baseline_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  -- Same shape as TaskBaseline in lib/schedule4d.ts ({title, start, end}) plus the WBS fields.
  new.tasks := coalesce((select jsonb_object_agg(t.id, jsonb_build_object('title', t.ma_wbs || ' · ' || t.ten, 'start', t.bat_dau,
      'end', t.ket_thuc, 'ma_wbs', t.ma_wbs, 'vi_tri', t.vi_tri, 'bo_mon', t.bo_mon, 'tien_nhiem_id', t.tien_nhiem_id))
    from public.bim_schedule_tasks t where t.project_id = new.project_id and not t.la_tom_tat), '{}');
  new.links := coalesce((select jsonb_object_agg(g.global_id, g.tasks) from (
      select l.global_id, jsonb_agg(distinct l.task_id) as tasks from public.bim_schedule_links l
       where l.project_id = new.project_id group by l.global_id) g), '{}');
  new.models := coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'file_name', m.file_name, 'phien_ban', m.phien_ban,
      'discipline', m.discipline) order by m.file_name)
    from public.bim_models m where m.project_id = new.project_id and m.deleted_at is null
      and m.id in (select distinct l.model_id from public.bim_schedule_links l where l.project_id = new.project_id)), '[]');
  return new;
end $$;
create trigger bim_schedule_baselines_capture before insert on public.bim_schedule_baselines
  for each row execute function bim_private.schedule_baseline_capture();
alter table public.bim_schedule_baselines enable row level security;
create policy bim_schedule_baselines_read on public.bim_schedule_baselines for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_schedule_baselines_insert on public.bim_schedule_baselines for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_schedule_baselines from anon, authenticated;
grant select, insert on public.bim_schedule_baselines to authenticated;
create function public.bim_save_schedule_baseline(p_project uuid, p_ten text) returns public.bim_schedule_baselines
language sql security invoker set search_path = '' as $$
  insert into public.bim_schedule_baselines (project_id, ten) values (p_project, btrim(p_ten)) returning *
$$;

-- Floor order: basements negative, roof last, otherwise the trailing number of the name.
create function public.bim_tang_thu_tu(p_tang text) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_tang is null or btrim(p_tang) = '' then 0
    when p_tang ~* '(hầm|ham|basement)\s*([0-9]+)' then -((regexp_match(p_tang, '(?i)(hầm|ham|basement)\s*([0-9]+)'))[2])::numeric
    when p_tang ~* '(^|[^a-z])b([0-9]+)($|[^0-9])' then -((regexp_match(p_tang, '(?i)(^|[^a-z])b([0-9]+)'))[2])::numeric
    when p_tang ~* '(mái|mai|tum|roof)' then 999
    when p_tang ~ '[0-9]+' then ((regexp_match(p_tang, '([0-9]+)[^0-9]*$'))[1])::numeric
    else 0 end
$$;

-- Sequence templates (system templates have no project).
create table public.bim_4d_mau_trinh_tu (
  id text primary key default gen_random_uuid()::text,
  project_id uuid references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  mo_ta text,
  loai_du_an text not null default 'dan_dung' check (loai_du_an in ('dan_dung', 'cong_nghiep', 'ha_tang', 'giao_thong', 'khac')),
  buoc jsonb not null check (jsonb_typeof(buoc) = 'array' and jsonb_array_length(buoc) between 1 and 50),
  he_thong boolean not null default false,
  nguoi_tao_uid uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (he_thong = (project_id is null))
);
alter table public.bim_4d_mau_trinh_tu enable row level security;
create policy bim_4d_mau_read on public.bim_4d_mau_trinh_tu for select to authenticated
  using (he_thong or project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_4d_mau_write on public.bim_4d_mau_trinh_tu for all to authenticated
  using (not he_thong and project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (not he_thong and project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_4d_mau_trinh_tu from anon, authenticated;
grant select, insert, update, delete on public.bim_4d_mau_trinh_tu to authenticated;
-- Durations are default planning values for one floor; projects copy and adjust them.
insert into public.bim_4d_mau_trinh_tu (id, ten, mo_ta, loai_du_an, buoc, he_thong, nguoi_tao_uid) values
('mau-btct-toan-khoi', 'Kết cấu BTCT toàn khối theo tầng', 'Cột: cốt thép → ván khuôn → bê tông; dầm sàn: ván khuôn → cốt thép → bê tông; tháo ván khuôn.', 'dan_dung',
 '[{"ten":"Cột, vách · cốt thép","cong_tac":"cot_thep","loai_cau_kien":["IFCCOLUMN","IFCWALL","IFCWALLSTANDARDCASE"],"thoi_luong_ngay":2,"ty_trong":1},
   {"ten":"Cột, vách · ván khuôn","cong_tac":"van_khuon","loai_cau_kien":["IFCCOLUMN","IFCWALL","IFCWALLSTANDARDCASE"],"thoi_luong_ngay":2,"ty_trong":1},
   {"ten":"Cột, vách · đổ bê tông","cong_tac":"be_tong","loai_cau_kien":["IFCCOLUMN","IFCWALL","IFCWALLSTANDARDCASE"],"thoi_luong_ngay":1,"ty_trong":2},
   {"ten":"Dầm, sàn · ván khuôn","cong_tac":"van_khuon","loai_cau_kien":["IFCBEAM","IFCSLAB"],"thoi_luong_ngay":3,"ty_trong":1},
   {"ten":"Dầm, sàn · cốt thép","cong_tac":"cot_thep","loai_cau_kien":["IFCBEAM","IFCSLAB"],"thoi_luong_ngay":3,"ty_trong":1},
   {"ten":"Dầm, sàn · đổ bê tông","cong_tac":"be_tong","loai_cau_kien":["IFCBEAM","IFCSLAB"],"thoi_luong_ngay":1,"ty_trong":2},
   {"ten":"Tháo ván khuôn","cong_tac":"thao_van_khuon","loai_cau_kien":["IFCCOLUMN","IFCBEAM","IFCSLAB","IFCWALL","IFCWALLSTANDARDCASE"],"thoi_luong_ngay":2,"ty_trong":0.5}]', true, null),
('mau-hoan-thien', 'Hoàn thiện kiến trúc theo tầng', 'Xây → cửa → lát, ốp → trần → lan can.', 'dan_dung',
 '[{"ten":"Xây tường","cong_tac":"xay","loai_cau_kien":["IFCWALL","IFCWALLSTANDARDCASE"],"thoi_luong_ngay":5,"ty_trong":2},
   {"ten":"Lắp cửa đi, cửa sổ","cong_tac":"cua","loai_cau_kien":["IFCDOOR","IFCWINDOW"],"thoi_luong_ngay":3,"ty_trong":1},
   {"ten":"Lát sàn, ốp","cong_tac":"lat_op","loai_cau_kien":["IFCCOVERING","IFCSLAB"],"thoi_luong_ngay":4,"ty_trong":1.5},
   {"ten":"Trần","cong_tac":"tran","loai_cau_kien":["IFCCOVERING"],"thoi_luong_ngay":3,"ty_trong":1},
   {"ten":"Lan can, cầu thang","cong_tac":"lan_can","loai_cau_kien":["IFCRAILING","IFCSTAIR","IFCSTAIRFLIGHT"],"thoi_luong_ngay":2,"ty_trong":0.5}]', true, null),
('mau-co-dien', 'Cơ điện (MEP) theo tầng', 'Đường ống, máng → thiết bị → đấu nối, chạy thử.', 'dan_dung',
 '[{"ten":"Ống, máng, ống gió","cong_tac":"duong_ong","loai_cau_kien":["IFCPIPESEGMENT","IFCDUCTSEGMENT","IFCCABLECARRIERSEGMENT","IFCPIPEFITTING","IFCDUCTFITTING","IFCCABLECARRIERFITTING","IFCFLOWSEGMENT","IFCFLOWFITTING"],"thoi_luong_ngay":5,"ty_trong":2},
   {"ten":"Lắp thiết bị","cong_tac":"thiet_bi","loai_cau_kien":["IFCUNITARYEQUIPMENT","IFCPUMP","IFCFAN","IFCCHILLER","IFCELECTRICDISTRIBUTIONBOARD","IFCLIGHTFIXTURE","IFCAIRTERMINAL","IFCFIRESUPPRESSIONTERMINAL","IFCVALVE","IFCSANITARYTERMINAL","IFCFLOWTERMINAL"],"thoi_luong_ngay":4,"ty_trong":2},
   {"ten":"Đấu nối, chạy thử","cong_tac":"chay_thu","loai_cau_kien":["IFCUNITARYEQUIPMENT","IFCPUMP","IFCFAN","IFCCHILLER","IFCELECTRICDISTRIBUTIONBOARD"],"thoi_luong_ngay":2,"ty_trong":1}]', true, null),
('mau-ha-tang', 'Hạ tầng giao thông theo đoạn', 'Nền → móng, mặt đường → cống, rãnh; "tầng" là đoạn hoặc lý trình trong mô hình.', 'giao_thong',
 '[{"ten":"Nền đường","cong_tac":"nen","loai_cau_kien":["IFCEARTHWORKSFILL","IFCEARTHWORKSCUT","IFCCOURSE"],"thoi_luong_ngay":10,"ty_trong":2},
   {"ten":"Móng, mặt đường","cong_tac":"mat_duong","loai_cau_kien":["IFCPAVEMENT","IFCCOURSE","IFCSLAB"],"thoi_luong_ngay":8,"ty_trong":3},
   {"ten":"Cống, rãnh, phụ trợ","cong_tac":"phu_tro","loai_cau_kien":["IFCPIPESEGMENT","IFCKERB","IFCRAILING","IFCSIGN"],"thoi_luong_ngay":5,"ty_trong":1}]', true, null);

-- Generate floor × step tasks from a template and link the matching elements.
create function public.bim_4d_sinh_tien_do(p_project uuid, p_mau text, p_model_ids uuid[], p_bat_dau date,
  p_tien_to text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  mau public.bim_4d_mau_trinh_tu; f record; b record; v_cursor date := p_bat_dau; v_prev uuid; v_task uuid;
  v_tasks integer := 0; v_links integer := 0; v_n integer; v_prefix text := upper(coalesce(nullif(btrim(p_tien_to), ''), 'TD'));
  v_floor integer := 0; v_step integer; v_ids uuid[] := '{}';
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if p_bat_dau is null then raise exception 'Chọn ngày bắt đầu.'; end if;
  select * into mau from public.bim_4d_mau_trinh_tu where id = p_mau and (he_thong or project_id = p_project);
  if not found then raise exception 'Không tìm thấy mẫu trình tự.'; end if;
  if coalesce(cardinality(p_model_ids), 0) = 0 then raise exception 'Chọn ít nhất một mô hình.'; end if;
  if exists (select 1 from unnest(p_model_ids) x(id) where not exists (
      select 1 from public.bim_models m where m.id = x.id and m.project_id = p_project and m.status = 'ready' and m.deleted_at is null)) then
    raise exception 'Mô hình không thuộc dự án hoặc chưa sẵn sàng.';
  end if;
  if exists (select 1 from public.bim_schedule_tasks where project_id = p_project and ma_wbs like v_prefix || '.%') then
    raise exception 'Mã WBS % đã có trong tiến độ; chọn tiền tố khác.', v_prefix;
  end if;
  for f in
    select coalesce(nullif(btrim(e.phan_doan_tang), ''), 'Chưa gán tầng') as tang
      from public.bim_elements e where e.model_id = any (p_model_ids)
     group by 1 order by public.bim_tang_thu_tu(min(e.phan_doan_tang)), 1
  loop
    v_floor := v_floor + 1; v_step := 0;
    for b in
      select (s.value ->> 'ten') as ten, greatest(coalesce((s.value ->> 'thoi_luong_ngay')::integer, 1), 1) as dur,
             coalesce((s.value ->> 'ty_trong')::numeric, 1) as ty_trong,
             array(select upper(x) from jsonb_array_elements_text(s.value -> 'loai_cau_kien') x) as loai
        from jsonb_array_elements(mau.buoc) with ordinality s order by s.ordinality
    loop
      select count(*) into v_n from public.bim_elements e
       where e.model_id = any (p_model_ids) and upper(e.loai_cau_kien) = any (b.loai)
         and coalesce(nullif(btrim(e.phan_doan_tang), ''), 'Chưa gán tầng') = f.tang;
      continue when v_n = 0;
      v_step := v_step + 1;
      insert into public.bim_schedule_tasks (project_id, ma_wbs, ten, bat_dau, ket_thuc, ty_trong, tien_nhiem_id, vi_tri,
        thu_tu, ghi_chu)
      values (p_project, v_prefix || '.' || v_floor || '.' || v_step, f.tang || ' · ' || b.ten, v_cursor, v_cursor + b.dur - 1,
        b.ty_trong, v_prev, f.tang, v_floor * 100 + v_step, 'Sinh từ mẫu: ' || mau.ten)
      returning id into v_task;
      v_ids := v_ids || v_task;
      insert into public.bim_schedule_links (project_id, task_id, model_id, global_id)
      select p_project, v_task, e.model_id, e.global_id from public.bim_elements e
       where e.model_id = any (p_model_ids) and upper(e.loai_cau_kien) = any (b.loai)
         and coalesce(nullif(btrim(e.phan_doan_tang), ''), 'Chưa gán tầng') = f.tang
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_links := v_links + v_n;
      v_tasks := v_tasks + 1;
      v_prev := v_task;
      v_cursor := v_cursor + b.dur;
    end loop;
  end loop;
  if v_tasks = 0 then raise exception 'Mô hình không có cấu kiện thuộc loại nào trong mẫu.'; end if;
  return jsonb_build_object('so_cong_viec', v_tasks, 'so_lien_ket', v_links, 'so_tang', v_floor, 'bat_dau', p_bat_dau,
    'ket_thuc', v_cursor - 1);
end $$;

-- Import (Excel / MS Project): upsert by WBS code, resolve predecessors by WBS, link optional GUIDs of one model.
create function public.bim_4d_nhap_tien_do(p_project uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_id uuid; v_new integer := 0; v_upd integer := 0; v_links integer := 0; v_n integer; v_errors jsonb := '[]';
  v_order integer := 0; v_name text; v_wbs text; v_start date; v_end date;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Tệp không có dòng công việc.'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Tối đa 5.000 công việc mỗi lần nhập.'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_order := v_order + 1;
    v_name := nullif(btrim(r ->> 'ten'), '');
    v_wbs := nullif(btrim(r ->> 'ma_wbs'), '');
    v_start := nullif(r ->> 'bat_dau', '')::date;
    v_end := nullif(r ->> 'ket_thuc', '')::date;
    if v_name is null or v_wbs is null then
      v_errors := v_errors || jsonb_build_object('dong', v_order, 'loi', 'Thiếu mã WBS hoặc tên công việc'); continue;
    end if;
    if v_start is not null and v_end is not null and v_end < v_start then
      v_errors := v_errors || jsonb_build_object('dong', v_order, 'wbs', v_wbs, 'loi', 'Ngày kết thúc trước ngày bắt đầu'); continue;
    end if;
    select id into v_id from public.bim_schedule_tasks where project_id = p_project and ma_wbs = v_wbs;
    if v_id is null then
      insert into public.bim_schedule_tasks (project_id, ma_wbs, ten, bat_dau, ket_thuc, ty_trong, phan_tram_thuc_te, vi_tri,
        bo_mon, la_tom_tat, thu_tu, ghi_chu)
      values (p_project, v_wbs, v_name, v_start, v_end, coalesce((r ->> 'ty_trong')::numeric, 0),
        least(100, greatest(0, (r ->> 'phan_tram_thuc_te')::numeric)), nullif(r ->> 'vi_tri', ''), nullif(r ->> 'bo_mon', ''),
        coalesce((r ->> 'la_tom_tat')::boolean, false), v_order, 'Nhập từ tệp tiến độ')
      returning id into v_id;
      v_new := v_new + 1;
    else
      update public.bim_schedule_tasks
         set ten = v_name, bat_dau = coalesce(v_start, bat_dau), ket_thuc = coalesce(v_end, ket_thuc),
             ty_trong = coalesce((r ->> 'ty_trong')::numeric, ty_trong),
             phan_tram_thuc_te = coalesce(least(100, greatest(0, (r ->> 'phan_tram_thuc_te')::numeric)), phan_tram_thuc_te),
             vi_tri = coalesce(nullif(r ->> 'vi_tri', ''), vi_tri), bo_mon = coalesce(nullif(r ->> 'bo_mon', ''), bo_mon),
             la_tom_tat = coalesce((r ->> 'la_tom_tat')::boolean, la_tom_tat), thu_tu = v_order
       where id = v_id;
      v_upd := v_upd + 1;
    end if;
    if nullif(r ->> 'model_id', '') is not null and jsonb_typeof(r -> 'guid') = 'array'
       and not coalesce((r ->> 'la_tom_tat')::boolean, false) then
      insert into public.bim_schedule_links (project_id, task_id, model_id, global_id)
      select p_project, v_id, m.id, e.global_id
        from jsonb_array_elements_text(r -> 'guid') g(guid)
        join public.bim_models m on m.id = (r ->> 'model_id')::uuid and m.project_id = p_project
        join public.bim_elements e on e.model_id = m.id and e.global_id = g.guid
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_links := v_links + v_n;
    end if;
  end loop;
  update public.bim_schedule_tasks t set tien_nhiem_id = p.id
    from jsonb_array_elements(p_rows) x(value)
    join public.bim_schedule_tasks p on p.project_id = p_project and p.ma_wbs = btrim(x.value ->> 'tien_nhiem_wbs')
   where t.project_id = p_project and t.ma_wbs = btrim(x.value ->> 'ma_wbs')
     and nullif(btrim(x.value ->> 'tien_nhiem_wbs'), '') is not null and p.id <> t.id;
  return jsonb_build_object('them', v_new, 'cap_nhat', v_upd, 'lien_ket', v_links, 'loi', v_errors);
end $$;

-- ── 2. Quantities (5D) ──────────────────────────────────────────────────────────────────────────────────────────
-- Groups of v_bim_khoi_luong_tong_hop with the completed quantity: an element counts with the smallest progress of
-- its linked tasks; a group without progress for every element has no completed value (never 0 for unknown).
create function public.bim_5d_overview(p_project uuid, p_model_ids uuid[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with models as (
    select m.id from public.bim_models m
     where m.id = any (p_model_ids) and m.project_id = p_project and m.deleted_at is null
  ), linked as (
    select l.model_id, l.global_id, bool_and(t.phan_tram_thuc_te is not null) as known,
           min(greatest(0, least(100, t.phan_tram_thuc_te))) / 100.0 as fraction
      from public.bim_schedule_links l
      join models m on m.id = l.model_id
      join public.bim_schedule_tasks t on t.id = l.task_id
     where l.project_id = p_project
     group by l.model_id, l.global_id
  ), measured as (
    select e.model_id, e.loai_cau_kien, coalesce(e.vat_lieu, '') as vat_lieu, coalesce(e.phan_doan_tang, '') as phan_doan_tang,
           count(lk.global_id) filter (where lk.known) as lien_ket_tien_do,
           bool_and(lk.known is true) as du_tien_do,
           sum(e.the_tich_be_tong * lk.fraction) filter (where lk.known) as ht_m3,
           bool_and(coalesce(e.the_tich_be_tong >= 0 and e.the_tich_be_tong < 'Infinity'::float8, false)) as co_m3,
           sum(e.dien_tich * lk.fraction) filter (where lk.known) as ht_m2,
           bool_and(coalesce(e.dien_tich >= 0 and e.dien_tich < 'Infinity'::float8, false)) as co_m2,
           sum(e.chieu_dai * lk.fraction) filter (where lk.known) as ht_m,
           bool_and(coalesce(e.chieu_dai >= 0 and e.chieu_dai < 'Infinity'::float8, false)) as co_m,
           sum(e.trong_luong * lk.fraction) filter (where lk.known) as ht_kg,
           bool_and(coalesce(e.trong_luong >= 0 and e.trong_luong < 'Infinity'::float8, false)) as co_kg,
           sum(lk.fraction) filter (where lk.known) as ht_cai
      from public.bim_elements e
      join models m on m.id = e.model_id
      left join linked lk on lk.model_id = e.model_id and lk.global_id = e.global_id
     group by 1, 2, 3, 4
  ), groups as (
    select q.*, coalesce(me.lien_ket_tien_do, 0) as lien_ket_tien_do,
           case when me.du_tien_do then jsonb_build_object(
             'm3', case when me.co_m3 then me.ht_m3 end, 'm2', case when me.co_m2 then me.ht_m2 end,
             'm', case when me.co_m then me.ht_m end, 'kg', case when me.co_kg then me.ht_kg end, 'cai', me.ht_cai) end as hoan_thanh
      from public.v_bim_khoi_luong_tong_hop q
      join models m on m.id = q.model_id
      left join measured me on me.model_id = q.model_id and me.loai_cau_kien = q.loai_cau_kien
       and me.vat_lieu = q.vat_lieu and me.phan_doan_tang = q.phan_doan_tang
  )
  select jsonb_build_object(
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.model_id, g.loai_cau_kien, g.vat_lieu, g.phan_doan_tang) from groups g), '[]'),
    'element_total', coalesce((select sum(g.so_luong) from groups g), 0),
    'computed_at', now())
$$;

create function public.bim_quantity_group_elements(p_groups jsonb) returns table (model_id uuid, express_id integer)
language sql stable security invoker set search_path = '' as $$
  select e.model_id, e.express_id
    from jsonb_to_recordset(coalesce(p_groups, '[]')) as g(model_id uuid, loai_cau_kien text, vat_lieu text, phan_doan_tang text)
    join public.bim_elements e on e.model_id = g.model_id and e.loai_cau_kien = g.loai_cau_kien
     and coalesce(e.vat_lieu, '') = coalesce(g.vat_lieu, '') and coalesce(e.phan_doan_tang, '') = coalesce(g.phan_doan_tang, '')
   order by e.model_id, e.express_id
$$;

-- Field progress per element for model colouring: acceptance first, then the linked schedule tasks.
create function public.bim_field_actual(p_project uuid)
returns table (model_id uuid, global_id text, trang_thai text)
language sql stable security invoker set search_path = '' as $$
  with today as (select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d),
  accepted as (
    select a.model_id, a.global_id from public.bim_workspace_acceptance(p_project) a
     where a.status in ('dat', 'dat_co_dieu_kien') and a.model_id is not null
  ), tasks as (
    select l.model_id, l.global_id::text as global_id,
           bool_and(coalesce(t.phan_tram_thuc_te, 0) >= 100 or t.ket_thuc_thuc_te is not null) as xong,
           bool_or(t.ket_thuc < (select d from today) and coalesce(t.phan_tram_thuc_te, 0) < 100 and t.ket_thuc_thuc_te is null) as cham,
           bool_or(coalesce(t.phan_tram_thuc_te, 0) > 0 or t.bat_dau_thuc_te is not null) as bat_dau
      from public.bim_schedule_links l join public.bim_schedule_tasks t on t.id = l.task_id
     where l.project_id = p_project
     group by l.model_id, l.global_id
  )
  select coalesce(a.model_id, t.model_id), coalesce(a.global_id, t.global_id),
         case when a.global_id is not null then 'da_nghiem_thu' when t.xong then 'da_thi_cong' when t.cham then 'cham'
              when t.bat_dau then 'dang_thi_cong' else 'chua_bat_dau' end
    from accepted a full join tasks t on t.model_id = a.model_id and t.global_id = a.global_id
$$;

-- ── 3. Unit prices, price versions, estimates ───────────────────────────────────────────────────────────────────
create table public.bim_don_gia (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  loai_cau_kien text not null check (length(btrim(loai_cau_kien)) between 1 and 100),
  vat_lieu text,
  -- Norm id of the BuildSIA construction norm library (/api/construction-norms?id=…).
  ma_dinh_muc text check (ma_dinh_muc is null or length(ma_dinh_muc) <= 100),
  don_vi text not null check (don_vi in ('m3', 'm2', 'm', 'kg', 'cai')),
  don_gia numeric not null check (don_gia >= 0 and don_gia < 'Infinity'::numeric),
  ghi_chu text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index bim_don_gia_key on public.bim_don_gia
  (project_id, upper(btrim(loai_cau_kien)), lower(btrim(coalesce(vat_lieu, ''))), don_vi);
create function bim_private.price_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.project_id := old.project_id; new.created_at := old.created_at; end if;
  new.loai_cau_kien := upper(btrim(new.loai_cau_kien));
  new.updated_at := now();
  return new;
end $$;
create trigger bim_don_gia_stamp before insert or update on public.bim_don_gia
  for each row execute function bim_private.price_stamp();
alter table public.bim_don_gia enable row level security;
create policy bim_don_gia_read on public.bim_don_gia for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_don_gia_write on public.bim_don_gia for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_don_gia from anon, authenticated;
grant select, insert, update, delete on public.bim_don_gia to authenticated;

create function public.bim_import_unit_prices(p_project uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 10000 then
    raise exception 'Danh sách đơn giá không hợp lệ (1–10.000 dòng).';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r
              group by upper(btrim(r ->> 'loai_cau_kien')), lower(btrim(coalesce(r ->> 'vat_lieu', ''))), r ->> 'don_vi'
             having count(*) > 1) then
    raise exception 'Trùng loại/vật liệu/đơn vị trong tệp. Chọn lại các dòng trước khi nhập.';
  end if;
  insert into public.bim_don_gia (project_id, loai_cau_kien, vat_lieu, ma_dinh_muc, don_vi, don_gia, ghi_chu, created_by)
  select p_project, upper(btrim(r ->> 'loai_cau_kien')), nullif(btrim(r ->> 'vat_lieu'), ''), nullif(r ->> 'ma_dinh_muc', ''),
         r ->> 'don_vi', (r ->> 'don_gia')::numeric, r ->> 'ghi_chu', auth.uid()::text
    from jsonb_array_elements(p_rows) r
  on conflict (project_id, upper(btrim(loai_cau_kien)), lower(btrim(coalesce(vat_lieu, ''))), don_vi)
  do update set don_gia = excluded.don_gia, ma_dinh_muc = excluded.ma_dinh_muc, ghi_chu = excluded.ghi_chu, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Saved price lists (immutable): published price lists by province and period, or project lists.
create table public.bim_unit_price_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  effective_date date,
  source text,
  tinh_thanh text,
  ky_cong_bo text,
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 1 and 10000),
  created_by text,
  created_at timestamptz not null default now()
);
create function bim_private.created_now() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
create trigger bim_unit_price_sets_stamp before insert on public.bim_unit_price_sets
  for each row execute function bim_private.created_now();
alter table public.bim_unit_price_sets enable row level security;
create policy bim_unit_price_sets_read on public.bim_unit_price_sets for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_unit_price_sets_insert on public.bim_unit_price_sets for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_unit_price_sets from anon, authenticated;
grant select, insert on public.bim_unit_price_sets to authenticated;

create table public.bim_cost_estimates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  -- [{"id": model uuid, "file_name", "phien_ban"}]
  models jsonb not null check (jsonb_typeof(models) = 'array'),
  -- Cost rows (lib/costing): model_id, loai_cau_kien, vat_lieu, phan_doan_tang, don_vi, khoi_luong, don_gia, thanh_tien, issue
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  tax_percent numeric not null default 0 check (tax_percent between 0 and 100),
  source text,
  created_by text,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz
);
create index bim_cost_estimates_project on public.bim_cost_estimates (project_id, created_at desc);
create function bim_private.estimate_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' and pg_trigger_depth() <= 1 then raise exception 'Dự toán đã duyệt không xóa được.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then raise exception 'Dự toán đã duyệt không được sửa.'; end if;
    new.project_id := old.project_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
    new.approved_by := null;
    new.approved_at := null;
  end if;
  if jsonb_array_length(new.models) = 0 then raise exception 'Cần mô hình nguồn.'; end if;
  if exists (select 1 from jsonb_array_elements(new.models) m where not exists (
       select 1 from public.bim_models b where b.id::text = m ->> 'id' and b.project_id = new.project_id)) then
    raise exception 'Phiên bản mô hình không thuộc dự án.';
  end if;
  if new.status = 'approved' then
    if not bim_private.can_manage(new.project_id) then
      raise exception 'Cần quyền quản lý dự án để duyệt dự toán.' using errcode = '42501';
    end if;
    if jsonb_array_length(new.rows) = 0 or exists (select 1 from jsonb_array_elements(new.rows) r
         where r ->> 'issue' is not null or r ->> 'thanh_tien' is null or r ->> 'khoi_luong' is null or r ->> 'don_gia' is null) then
      raise exception 'Còn dòng dự toán chưa tính được.';
    end if;
    if exists (select 1 from jsonb_array_elements(new.rows) r
                where (r ->> 'khoi_luong')::numeric < 0 or (r ->> 'don_gia')::numeric < 0
                   or abs((r ->> 'thanh_tien')::numeric - (r ->> 'khoi_luong')::numeric * (r ->> 'don_gia')::numeric) > 0.01) then
      raise exception 'Thành tiền không khớp khối lượng và đơn giá.';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end $$;
create trigger bim_cost_estimates_lock before insert or update or delete on public.bim_cost_estimates
  for each row execute function bim_private.estimate_lock();
alter table public.bim_cost_estimates enable row level security;
create policy bim_cost_estimates_read on public.bim_cost_estimates for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_cost_estimates_write on public.bim_cost_estimates for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_cost_estimates from anon, authenticated;
grant select, insert, update, delete on public.bim_cost_estimates to authenticated;

-- ── 4. Bids ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_gia_du_thau (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  goi_thau text not null check (length(btrim(goi_thau)) between 1 and 200),
  nha_thau text not null check (length(btrim(nha_thau)) between 1 and 300),
  stt integer not null,
  ma_hieu text,
  ten_cong_viec text not null,
  don_vi text,
  khoi_luong numeric check (khoi_luong is null or khoi_luong >= 0),
  don_gia numeric check (don_gia is null or don_gia >= 0),
  nguoi_nhap_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_gia_du_thau_goi on public.bim_gia_du_thau (project_id, goi_thau, nha_thau, stt);
alter table public.bim_gia_du_thau enable row level security;
create policy bim_gia_du_thau_read on public.bim_gia_du_thau for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_gia_du_thau from anon, authenticated;
grant select on public.bim_gia_du_thau to authenticated;
-- Re-importing a bidder replaces all its lines in one transaction.
create function public.bim_gia_du_thau_nhap(p_project uuid, p_goi_thau text, p_nha_thau text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 20000 then raise exception 'Tệp không có dòng giá.'; end if;
  delete from public.bim_gia_du_thau where project_id = p_project and goi_thau = btrim(p_goi_thau) and nha_thau = btrim(p_nha_thau);
  insert into public.bim_gia_du_thau (project_id, goi_thau, nha_thau, stt, ma_hieu, ten_cong_viec, don_vi, khoi_luong, don_gia, nguoi_nhap_uid)
  select p_project, btrim(p_goi_thau), btrim(p_nha_thau), r.ordinality::integer, nullif(upper(btrim(r.value ->> 'ma_hieu')), ''),
         btrim(r.value ->> 'ten_cong_viec'), nullif(btrim(r.value ->> 'don_vi'), ''),
         (r.value ->> 'khoi_luong')::numeric, (r.value ->> 'don_gia')::numeric, auth.uid()
    from jsonb_array_elements(p_rows) with ordinality r
   where nullif(btrim(r.value ->> 'ten_cong_viec'), '') is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
create function public.bim_gia_du_thau_xoa(p_project uuid, p_goi_thau text, p_nha_thau text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  delete from public.bim_gia_du_thau where project_id = p_project and goi_thau = p_goi_thau and nha_thau = p_nha_thau;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── 5. Cash flow and EVM ────────────────────────────────────────────────────────────────────────────────────────
-- Each estimate row (model, type, material, floor) is split evenly over its elements, each element evenly over its
-- linked tasks; elements without a task stay unallocated. Values include the estimate's tax.
create function public.bim_5d_phan_bo(p_estimate uuid)
returns table (task_id uuid, gia_tri numeric, bat_dau date, ket_thuc date, phan_tram_thuc_te numeric)
language sql stable security invoker set search_path = '' as $$
  with est as (
    select e.id, e.project_id, (1 + coalesce(e.tax_percent, 0) / 100.0) as he_so,
           array(select (m ->> 'id')::uuid from jsonb_array_elements(e.models) m) as model_ids, e.rows
      from public.bim_cost_estimates e where e.id = p_estimate
  ), dong as (
    select r.ordinality as dong, nullif(r.value ->> 'model_id', '')::uuid as model_id, r.value ->> 'loai_cau_kien' as loai,
           coalesce(r.value ->> 'vat_lieu', '') as vat_lieu, coalesce(r.value ->> 'phan_doan_tang', '') as tang,
           coalesce((r.value ->> 'thanh_tien')::numeric, 0) * est.he_so as gia_tri, est.model_ids, est.project_id
      from est, jsonb_array_elements(est.rows) with ordinality r
  ), ck as (
    select d.dong, d.gia_tri, e.model_id, e.global_id, d.project_id, count(*) over (partition by d.dong) as so_ck
      from dong d
      join public.bim_elements e on e.model_id = any (d.model_ids) and (d.model_id is null or e.model_id = d.model_id)
       and e.loai_cau_kien = d.loai and coalesce(e.vat_lieu, '') = d.vat_lieu and coalesce(e.phan_doan_tang, '') = d.tang
  ), ck_task as (
    select ck.gia_tri / ck.so_ck as gia_tri_ck, l.task_id,
           count(*) over (partition by ck.dong, ck.model_id, ck.global_id) as so_task
      from ck join public.bim_schedule_links l on l.project_id = ck.project_id and l.model_id = ck.model_id and l.global_id = ck.global_id
  )
  select t.id, sum(ct.gia_tri_ck / ct.so_task), t.bat_dau, t.ket_thuc, least(100, greatest(0, coalesce(t.phan_tram_thuc_te, 0)))
    from ck_task ct join public.bim_schedule_tasks t on t.id = ct.task_id
   group by t.id, t.bat_dau, t.ket_thuc, t.phan_tram_thuc_te
$$;
create function public.bim_5d_bac(p_estimate uuid) returns numeric
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(coalesce((r ->> 'thanh_tien')::numeric, 0)), 0) * (1 + coalesce(max(e.tax_percent), 0) / 100.0)
    from public.bim_cost_estimates e, jsonb_array_elements(e.rows) r where e.id = p_estimate
$$;
-- PV at a date: share of the value by elapsed planned days (inclusive). Tasks without dates add nothing.
create function public.bim_5d_pv(p_estimate uuid, p_ngay date) returns numeric
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(case when bat_dau is null or ket_thuc is null then 0 when p_ngay < bat_dau then 0
    when p_ngay >= ket_thuc then gia_tri else gia_tri * ((p_ngay - bat_dau + 1)::numeric / (ket_thuc - bat_dau + 1)) end), 0)
    from public.bim_5d_phan_bo(p_estimate)
$$;
create function public.bim_5d_dong_tien(p_estimate uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_bac numeric; v_alloc numeric; v_start date; v_end date; v_months jsonb := '[]'; m date; v_cum numeric := 0; v_pv numeric;
  v_ev numeric; v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not exists (select 1 from public.bim_cost_estimates where id = p_estimate) then
    raise exception 'Không tìm thấy dự toán hoặc không có quyền xem.';
  end if;
  v_bac := public.bim_5d_bac(p_estimate);
  select coalesce(sum(gia_tri), 0), min(bat_dau), max(ket_thuc), coalesce(sum(gia_tri * phan_tram_thuc_te / 100.0), 0)
    into v_alloc, v_start, v_end, v_ev from public.bim_5d_phan_bo(p_estimate);
  if v_start is not null and v_end is not null and v_end - v_start <= 3660 then
    m := date_trunc('month', v_start)::date;
    while m <= v_end loop
      v_pv := public.bim_5d_pv(p_estimate, least((m + interval '1 month' - interval '1 day')::date, v_end));
      v_months := v_months || jsonb_build_object('thang', to_char(m, 'YYYY-MM'), 'ke_hoach', v_pv - v_cum, 'luy_ke_ke_hoach', v_pv);
      v_cum := v_pv;
      m := (m + interval '1 month')::date;
    end loop;
  end if;
  return jsonb_build_object('bac', v_bac, 'phan_bo', v_alloc, 'chua_phan_bo', greatest(v_bac - v_alloc, 0), 'bat_dau', v_start,
    'ket_thuc', v_end, 'thang', v_months, 'pv_hom_nay', public.bim_5d_pv(p_estimate, v_today), 'ev_hien_tai', v_ev, 'ngay', v_today);
end $$;

create table public.bim_evm_ky (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  estimate_id uuid not null references public.bim_cost_estimates(id) on delete cascade,
  ngay_chot date not null,
  bac numeric not null, pv numeric not null, ev numeric not null, ac numeric,
  spi numeric, cpi numeric, eac numeric, etc numeric, vac numeric, sv numeric, cv numeric,
  nguon_ac text check (nguon_ac is null or nguon_ac in ('nhap_tay', 'hop_dong')),
  ghi_chu text check (ghi_chu is null or length(ghi_chu) <= 2000),
  canh_bao text[] not null default '{}',
  nguoi_chot_uid uuid,
  created_at timestamptz not null default now(),
  unique (estimate_id, ngay_chot)
);
alter table public.bim_evm_ky enable row level security;
create policy bim_evm_ky_read on public.bim_evm_ky for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_evm_ky from anon, authenticated;
grant select on public.bim_evm_ky to authenticated;
create function bim_private.evm_locked() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Kỳ EVM đã chốt không sửa hoặc xóa được.';
end $$;
create trigger bim_evm_ky_locked before update or delete on public.bim_evm_ky
  for each row execute function bim_private.evm_locked();
-- The estimate trigger blocks deleting approved estimates; EVM periods belong to approved or draft estimates alike.

create function public.bim_evm_tinh(p_estimate uuid, p_ngay date, p_ac numeric default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_bac numeric; v_pv numeric; v_ev numeric; v_spi numeric; v_cpi numeric; v_eac numeric; v_warn text[] := '{}';
begin
  if not exists (select 1 from public.bim_cost_estimates where id = p_estimate) then
    raise exception 'Không tìm thấy dự toán hoặc không có quyền xem.';
  end if;
  v_bac := public.bim_5d_bac(p_estimate);
  v_pv := public.bim_5d_pv(p_estimate, p_ngay);
  select coalesce(sum(gia_tri * phan_tram_thuc_te / 100.0), 0) into v_ev from public.bim_5d_phan_bo(p_estimate);
  v_spi := case when v_pv > 0 then round(v_ev / v_pv, 3) end;
  v_cpi := case when p_ac > 0 then round(v_ev / p_ac, 3) end;
  v_eac := case when v_cpi > 0 then round(v_bac / v_cpi, 0) end;
  if v_spi is not null and v_spi < 0.9 then v_warn := v_warn || format('Chậm tiến độ: SPI %s < 0,9', v_spi); end if;
  if v_cpi is not null and v_cpi < 0.9 then v_warn := v_warn || format('Vượt chi phí: CPI %s < 0,9', v_cpi); end if;
  if v_bac > 0 and (select coalesce(sum(gia_tri), 0) from public.bim_5d_phan_bo(p_estimate)) < v_bac * 0.5 then
    v_warn := v_warn || 'Dưới một nửa giá trị dự toán đã gắn công việc 4D: PV và EV chưa đại diện cho toàn gói.';
  end if;
  return jsonb_build_object('ngay', p_ngay, 'bac', v_bac, 'pv', v_pv, 'ev', v_ev, 'ac', p_ac, 'spi', v_spi, 'cpi', v_cpi,
    'eac', v_eac, 'etc', case when v_eac is not null then v_eac - p_ac end, 'vac', case when v_eac is not null then v_bac - v_eac end,
    'sv', v_ev - v_pv, 'cv', case when p_ac is not null then v_ev - p_ac end, 'canh_bao', to_jsonb(v_warn));
end $$;
create function public.bim_evm_chot(p_estimate uuid, p_ngay date, p_ac numeric, p_nguon_ac text default 'nhap_tay',
  p_ghi_chu text default null) returns public.bim_evm_ky
language plpgsql security definer set search_path = '' as $$
declare e public.bim_cost_estimates; x jsonb; k public.bim_evm_ky;
begin
  select * into e from public.bim_cost_estimates where id = p_estimate;
  if not found then raise exception 'Không tìm thấy dự toán.'; end if;
  if not bim_private.can_write(e.project_id) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if p_ngay is null or p_ngay > (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Ngày chốt không được ở tương lai.'; end if;
  if p_ac is not null and p_ac < 0 then raise exception 'Chi phí thực tế không âm.'; end if;
  x := public.bim_evm_tinh(p_estimate, p_ngay, p_ac);
  insert into public.bim_evm_ky (project_id, estimate_id, ngay_chot, bac, pv, ev, ac, spi, cpi, eac, etc, vac, sv, cv, nguon_ac,
    ghi_chu, canh_bao, nguoi_chot_uid)
  values (e.project_id, p_estimate, p_ngay, (x ->> 'bac')::numeric, (x ->> 'pv')::numeric, (x ->> 'ev')::numeric, p_ac,
    (x ->> 'spi')::numeric, (x ->> 'cpi')::numeric, (x ->> 'eac')::numeric, (x ->> 'etc')::numeric, (x ->> 'vac')::numeric,
    (x ->> 'sv')::numeric, (x ->> 'cv')::numeric, case when p_ac is null then null else coalesce(p_nguon_ac, 'nhap_tay') end,
    nullif(btrim(p_ghi_chu), ''), array(select jsonb_array_elements_text(x -> 'canh_bao')), auth.uid())
  returning * into k;
  return k;
end $$;

-- ── 6. Budget, contracts and BOQ (ACC Cost) ─────────────────────────────────────────────────────────────────────
create table public.bim_budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ma text not null check (length(btrim(ma)) between 1 and 40),
  ten text not null check (length(btrim(ten)) between 1 and 300),
  ngan_sach numeric not null default 0 check (ngan_sach >= 0),
  ghi_chu text,
  thu_tu integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ma)
);
create table public.bim_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  so_hop_dong text not null check (length(btrim(so_hop_dong)) between 1 and 100),
  ten text not null check (length(btrim(ten)) between 1 and 300),
  nha_thau text,
  budget_line_id uuid references public.bim_budget_lines(id) on delete set null,
  ngay_ky date,
  trang_thai text not null default 'nhap' check (trang_thai in ('nhap', 'da_ky', 'thanh_ly')),
  ghi_chu text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, so_hop_dong)
);
create table public.bim_contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.bim_contracts(id) on delete cascade,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  thu_tu integer not null default 0,
  ma_hieu text,
  ten_cong_viec text not null check (length(btrim(ten_cong_viec)) between 1 and 1000),
  don_vi text,
  khoi_luong numeric check (khoi_luong is null or khoi_luong >= 0),
  don_gia numeric check (don_gia is null or don_gia >= 0),
  thanh_tien numeric generated always as (khoi_luong * don_gia) stored,
  khoi_luong_nghiem_thu numeric check (khoi_luong_nghiem_thu is null or khoi_luong_nghiem_thu >= 0),
  ghi_chu text
);
create index bim_contract_items_contract on public.bim_contract_items (contract_id, thu_tu);
create index bim_contract_items_code on public.bim_contract_items (project_id, upper(btrim(ma_hieu)));

create function bim_private.cost_row_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  -- PL/pgSQL does not short-circuit AND, so contract-only fields are read inside this branch.
  if tg_table_name = 'bim_contracts' then
    if new.budget_line_id is not null and not exists (
         select 1 from public.bim_budget_lines b where b.id = new.budget_line_id and b.project_id = new.project_id) then
      raise exception 'Dòng ngân sách không thuộc dự án.' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' then
      if old.trang_thai <> 'nhap' and new.trang_thai = 'nhap' then
        raise exception 'Hợp đồng đã ký không trở lại bản nháp.';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger bim_budget_lines_guard before insert or update on public.bim_budget_lines
  for each row execute function bim_private.cost_row_guard();
create trigger bim_contracts_guard before insert or update on public.bim_contracts
  for each row execute function bim_private.cost_row_guard();

-- BOQ items belong to the contract's project; after signing only accepted quantities change (scope changes go
-- through change orders).
create function bim_private.contract_item_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.bim_contracts;
begin
  select * into c from public.bim_contracts where id = coalesce(new.contract_id, old.contract_id);
  if tg_op = 'DELETE' then
    if c.trang_thai <> 'nhap' and pg_trigger_depth() <= 1 then raise exception 'Hợp đồng đã ký: không xóa dòng BOQ.'; end if;
    return old;
  end if;
  new.project_id := c.project_id;
  if tg_op = 'UPDATE' then new.contract_id := old.contract_id; end if;
  if c.trang_thai <> 'nhap' and (tg_op = 'INSERT' or new.khoi_luong is distinct from old.khoi_luong
       or new.don_gia is distinct from old.don_gia or new.ten_cong_viec is distinct from old.ten_cong_viec
       or new.ma_hieu is distinct from old.ma_hieu or new.don_vi is distinct from old.don_vi) then
    raise exception 'Hợp đồng đã ký: khối lượng, đơn giá chỉ đổi qua lệnh thay đổi.';
  end if;
  return new;
end $$;
create trigger bim_contract_items_guard before insert or update or delete on public.bim_contract_items
  for each row execute function bim_private.contract_item_guard();

alter table public.bim_budget_lines enable row level security;
alter table public.bim_contracts enable row level security;
alter table public.bim_contract_items enable row level security;
create policy bim_budget_lines_read on public.bim_budget_lines for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_budget_lines_write on public.bim_budget_lines for all to authenticated
  using (bim_private.can_manage(project_id)) with check (bim_private.can_manage(project_id));
create policy bim_contracts_read on public.bim_contracts for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_contracts_write on public.bim_contracts for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
-- Signing and closing a contract: project managers (checked in bim_contract_set_status).
create policy bim_contract_items_read on public.bim_contract_items for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_contract_items_write on public.bim_contract_items for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (exists (select 1 from public.bim_contracts c where c.id = contract_id
                       and c.project_id = any ((select bim_private.writable_projects())::uuid[])));
revoke all on public.bim_budget_lines, public.bim_contracts, public.bim_contract_items from anon, authenticated;
grant select, insert, update, delete on public.bim_budget_lines, public.bim_contract_items to authenticated;
grant select, insert, delete on public.bim_contracts to authenticated;
grant update (so_hop_dong, ten, nha_thau, budget_line_id, ngay_ky, ghi_chu) on public.bim_contracts to authenticated;

create function public.bim_contract_set_status(p_contract uuid, p_trang_thai text, p_ngay_ky date default null)
returns public.bim_contracts language plpgsql security definer set search_path = '' as $$
declare c public.bim_contracts;
begin
  select * into c from public.bim_contracts where id = p_contract for update;
  if not found then raise exception 'Không tìm thấy hợp đồng.'; end if;
  if not bim_private.can_manage(c.project_id) then
    raise exception 'Cần quyền quản lý dự án để ký hoặc thanh lý hợp đồng.' using errcode = '42501';
  end if;
  if not ((c.trang_thai = 'nhap' and p_trang_thai = 'da_ky') or (c.trang_thai = 'da_ky' and p_trang_thai = 'thanh_ly')) then
    raise exception 'Không chuyển hợp đồng từ % sang %.', c.trang_thai, p_trang_thai;
  end if;
  if p_trang_thai = 'da_ky' and not exists (select 1 from public.bim_contract_items i where i.contract_id = c.id) then
    raise exception 'Hợp đồng chưa có dòng BOQ.';
  end if;
  update public.bim_contracts set trang_thai = p_trang_thai,
         ngay_ky = case when p_trang_thai = 'da_ky' then coalesce(p_ngay_ky, ngay_ky, (now() at time zone 'Asia/Ho_Chi_Minh')::date) else ngay_ky end
   where id = c.id returning * into c;
  return c;
end $$;

-- Import BOQ lines into a draft contract (replace or append).
create function public.bim_contract_items_import(p_contract uuid, p_rows jsonb, p_replace boolean default true) returns integer
language plpgsql security definer set search_path = '' as $$
declare c public.bim_contracts; v_n integer; v_base integer;
begin
  select * into c from public.bim_contracts where id = p_contract;
  if not found then raise exception 'Không tìm thấy hợp đồng.'; end if;
  if not bim_private.can_write(c.project_id) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if c.trang_thai <> 'nhap' then raise exception 'Hợp đồng đã ký: BOQ chỉ đổi qua lệnh thay đổi.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 20000 then raise exception 'Tệp không có dòng BOQ.'; end if;
  if p_replace then delete from public.bim_contract_items where contract_id = c.id; end if;
  select coalesce(max(thu_tu), 0) into v_base from public.bim_contract_items where contract_id = c.id;
  insert into public.bim_contract_items (contract_id, project_id, thu_tu, ma_hieu, ten_cong_viec, don_vi, khoi_luong, don_gia)
  select c.id, c.project_id, v_base + r.ordinality::integer, nullif(upper(btrim(r.value ->> 'ma_hieu')), ''),
         left(btrim(r.value ->> 'ten_cong_viec'), 1000), nullif(btrim(r.value ->> 'don_vi'), ''),
         (r.value ->> 'khoi_luong')::numeric, (r.value ->> 'don_gia')::numeric
    from jsonb_array_elements(p_rows) with ordinality r
   where nullif(btrim(r.value ->> 'ten_cong_viec'), '') is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- BOQ item ↔ model elements (one mapping per item).
create table public.bim_boq_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  boq_id uuid not null unique references public.bim_contract_items(id) on delete cascade,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  global_ids text[] not null check (cardinality(global_ids) > 0),
  unit text not null check (unit in ('m3', 'm2', 'm', 'kg', 'cai')),
  coefficient numeric not null default 1 check (coefficient > 0),
  task_id uuid references public.bim_schedule_tasks(id) on delete set null,
  notes text,
  updated_at timestamptz not null default now()
);
create function bim_private.boq_mapping_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.bim_contract_items i where i.id = new.boq_id and i.project_id = new.project_id) then
    raise exception 'Dòng BOQ không thuộc dự án.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.bim_models m where m.id = new.model_id and m.project_id = new.project_id) then
    raise exception 'Mô hình không thuộc dự án.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.global_ids) g where not exists (
       select 1 from public.bim_elements e where e.model_id = new.model_id and e.global_id = g)) then
    raise exception 'GUID không có trong mô hình.' using errcode = '23514';
  end if;
  if new.task_id is not null and not exists (select 1 from public.bim_schedule_tasks t where t.id = new.task_id and t.project_id = new.project_id) then
    raise exception 'Công việc tiến độ không thuộc dự án.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_boq_mappings_guard before insert or update on public.bim_boq_mappings
  for each row execute function bim_private.boq_mapping_guard();
alter table public.bim_boq_mappings enable row level security;
create policy bim_boq_mappings_read on public.bim_boq_mappings for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_boq_mappings_write on public.bim_boq_mappings for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_boq_mappings from anon, authenticated;
grant select, insert, update, delete on public.bim_boq_mappings to authenticated;

-- One element per GUID (highest express id), quantity by unit; estimated = quantity not from Qto.
create function public.bim_boq_measure(p_model uuid, p_guids text[], p_unit text)
returns table (selected integer, found integer, total double precision, missing integer, estimated integer)
language sql stable security invoker set search_path = '' as $$
  with g as (select distinct x as global_id from unnest(coalesce(p_guids, '{}'::text[])) x where x is not null),
  e as (
    select distinct on (el.global_id) el.global_id::text as global_id, el.the_tich_be_tong, el.dien_tich, el.chieu_dai,
           el.trong_luong, el.nguon_khoi_luong
      from public.bim_elements el where el.model_id = p_model and el.global_id = any (p_guids)
     order by el.global_id, el.express_id desc
  ), v as (
    select g.global_id, e.global_id is not null as found, e.nguon_khoi_luong,
           case when e.global_id is null then null when p_unit = 'cai' then 1::double precision when p_unit = 'm3' then e.the_tich_be_tong
                when p_unit = 'm2' then e.dien_tich when p_unit = 'm' then e.chieu_dai when p_unit = 'kg' then e.trong_luong end as value
      from g left join e using (global_id)
  )
  select count(*)::int, count(*) filter (where found)::int,
         coalesce(sum(value) filter (where value >= 0 and value < 'Infinity'::float8), 0),
         count(*) filter (where value is null or not (value >= 0 and value < 'Infinity'::float8))::int,
         count(*) filter (where nguon_khoi_luong is not null and nguon_khoi_luong <> 'qto')::int
    from v
$$;

-- BOQ items of the project's contracts with their mapping and measured quantity (keys as the ported client reads).
create function public.bim_boq_overview(p_project uuid, p_model_ids uuid[] default null, p_contract uuid default null,
  p_limit integer default 5000) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with items as (
    select i.id as ma_boq, i.contract_id as ma_hop_dong, i.ten_cong_viec, i.ma_hieu as ma_hieu_cong_viec, i.don_vi as don_vi_tinh,
           i.khoi_luong, i.don_gia, i.khoi_luong_nghiem_thu, i.thanh_tien, i.khoi_luong_nghiem_thu * i.don_gia as gia_tri_nghiem_thu,
           i.thu_tu
      from public.bim_contract_items i join public.bim_contracts c on c.id = i.contract_id
     where c.project_id = p_project and (p_contract is null or c.id = p_contract)
  ), page as (
    select * from items order by ma_hop_dong, thu_tu nulls last, ma_boq limit greatest(1, least(coalesce(p_limit, 5000), 20000))
  ), rows as (
    select p.*, mp.id as mapping_id, mp.model_id, mp.unit, mp.coefficient, mp.task_id, mp.global_ids,
           (p_model_ids is null or mp.model_id = any (p_model_ids)) as in_scope,
           ms.selected, ms.found, ms.total, ms.missing, ms.estimated
      from page p
      left join public.bim_boq_mappings mp on mp.boq_id = p.ma_boq and mp.project_id = p_project
      left join lateral (select * from public.bim_boq_measure(mp.model_id, mp.global_ids, mp.unit)
                          where mp.id is not null and (p_model_ids is null or mp.model_id = any (p_model_ids))) ms on true
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'ma_boq', r.ma_boq, 'ma_hop_dong', r.ma_hop_dong, 'ten_cong_viec', r.ten_cong_viec, 'ma_hieu_cong_viec', r.ma_hieu_cong_viec,
        'don_vi_tinh', r.don_vi_tinh, 'khoi_luong', r.khoi_luong, 'don_gia', r.don_gia, 'khoi_luong_nghiem_thu', r.khoi_luong_nghiem_thu,
        'thanh_tien', r.thanh_tien, 'gia_tri_nghiem_thu', r.gia_tri_nghiem_thu,
        'mapping', case when r.mapping_id is null then null else jsonb_build_object(
          'id', r.mapping_id, 'model_id', r.model_id, 'unit', r.unit, 'coefficient', r.coefficient, 'task_id', r.task_id,
          'in_scope', r.in_scope, 'so_guid', cardinality(r.global_ids),
          'measure', case when r.selected is null then null else jsonb_build_object('selected', r.selected, 'found', r.found,
            'total', r.total, 'missing', r.missing, 'estimated', r.estimated) end) end)
        order by r.ma_hop_dong, r.thu_tu nulls last, r.ma_boq) from rows r), '[]'),
    'total', (select count(*) from items), 'loaded', (select count(*) from page),
    'truncated', (select count(*) from items) > (select count(*) from page), 'computed_at', now())
$$;
create function public.bim_boq_facets(p_model uuid) returns table (loai_cau_kien text, phan_doan_tang text, so_luong integer)
language sql stable security invoker set search_path = '' as $$
  select e.loai_cau_kien, e.phan_doan_tang, count(*)::int from public.bim_elements e
   where e.model_id = p_model and coalesce(e.global_id, '') <> '' group by 1, 2 order by 1, 2 nulls first
$$;
-- The server computes the GUID set from (model, type, floor); the browser never loads the elements.
create function public.bim_boq_save_mapping(p_project uuid, p_boq uuid, p_model uuid, p_category text, p_floor text, p_unit text,
  p_coefficient numeric, p_task uuid default null) returns public.bim_boq_mappings
language plpgsql security invoker set search_path = '' as $$
declare v_guids text[]; v_row public.bim_boq_mappings;
begin
  if p_unit not in ('m3', 'm2', 'm', 'kg', 'cai') then raise exception 'Đơn vị đo bóc không hợp lệ: %', p_unit; end if;
  if p_coefficient is null or p_coefficient <= 0 then raise exception 'Hệ số phân bổ phải lớn hơn 0'; end if;
  select array_agg(distinct e.global_id::text order by e.global_id::text) into v_guids from public.bim_elements e
   where e.model_id = p_model and coalesce(e.global_id, '') <> ''
     and (coalesce(p_category, '') = '' or e.loai_cau_kien = p_category) and (coalesce(p_floor, '') = '' or e.phan_doan_tang = p_floor);
  if coalesce(cardinality(v_guids), 0) = 0 then raise exception 'Tập cấu kiện nguồn đang rỗng.'; end if;
  insert into public.bim_boq_mappings (project_id, boq_id, model_id, global_ids, unit, coefficient, task_id)
  values (p_project, p_boq, p_model, v_guids, p_unit, p_coefficient, p_task)
  on conflict (boq_id) do update set model_id = excluded.model_id, global_ids = excluded.global_ids, unit = excluded.unit,
    coefficient = excluded.coefficient, task_id = excluded.task_id
  returning * into v_row;
  return v_row;
end $$;
create function public.bim_boq_mapping_elements(p_boq uuid) returns table (model_id uuid, express_id integer, global_id text)
language sql stable security invoker set search_path = '' as $$
  select e.model_id, e.express_id, e.global_id::text from public.bim_boq_mappings mp
    join public.bim_elements e on e.model_id = mp.model_id and e.global_id = any (mp.global_ids)
   where mp.boq_id = p_boq order by e.express_id
$$;

-- Automatic BOQ links: IfcClassificationReference code of an element = BOQ item code (ma_hieu), unique matches only.
create function public.bim_field_match_boq(p_project uuid, p_models uuid[], p_contracts uuid[])
returns table (model_id uuid, global_id text, ma_boq uuid, code text, name text, unit text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if exists (select 1 from unnest(p_models) x where not exists (select 1 from public.bim_models m where m.id = x and m.project_id = p_project))
     or exists (select 1 from unnest(p_contracts) x where not exists (select 1 from public.bim_contracts c where c.id = x and c.project_id = p_project)) then
    raise exception 'Mô hình hoặc hợp đồng khác dự án' using errcode = '23514';
  end if;
  return query
  with codes as (
    select distinct e.model_id, e.global_id::text as global_id, upper(btrim(split_part(c.value, ' - ', 1))) as code
      from public.bim_elements e
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(e.thuoc_tinh -> 'phan_loai') = 'array'
                                                        then e.thuoc_tinh -> 'phan_loai' else '[]' end) c
     where e.project_id = p_project and e.model_id = any (p_models) and e.global_id is not null
  ), candidates as (
    select c.model_id, c.global_id, i.id as ma_boq, c.code, i.ten_cong_viec,
           case lower(btrim(i.don_vi)) when 'm³' then 'm3' when 'm3' then 'm3' when 'm²' then 'm2' when 'm2' then 'm2' when 'm' then 'm'
                when 'kg' then 'kg' when 'cái' then 'cai' when 'cai' then 'cai' end as normalized_unit,
           count(*) over (partition by c.model_id, c.global_id, c.code) as n
      from codes c join public.bim_contract_items i on upper(btrim(i.ma_hieu)) = c.code and i.contract_id = any (p_contracts)
  )
  select c.model_id, c.global_id, c.ma_boq, c.code, c.ten_cong_viec, c.normalized_unit from candidates c
   where c.n = 1 and c.normalized_unit is not null
     and not exists (select 1 from candidates y where y.ma_boq = c.ma_boq and y.model_id <> c.model_id)
     and not exists (select 1 from public.bim_boq_mappings b where b.boq_id = c.ma_boq and (b.model_id <> c.model_id or c.global_id = any (b.global_ids)))
   order by c.model_id, c.code, c.global_id;
end $$;
create function public.bim_field_apply_boq(p_project uuid, p_models uuid[], p_contracts uuid[], p_expected_keys text[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer; matches jsonb; actual text[];
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('bim-field-boq:' || p_project::text));
  select coalesce(jsonb_agg(x), '[]'), coalesce(array_agg(x.model_id || ':' || x.global_id || ':' || x.ma_boq
           order by x.model_id || ':' || x.global_id || ':' || x.ma_boq), '{}')
    into matches, actual from public.bim_field_match_boq(p_project, p_models, p_contracts) x;
  if actual is distinct from (select coalesce(array_agg(k order by k), '{}') from unnest(p_expected_keys) k) then
    raise exception 'Dữ liệu BOQ đã thay đổi. Hãy xem trước lại trước khi gắn.' using errcode = '40001';
  end if;
  with m as materialized (
    select * from jsonb_to_recordset(matches) as x(model_id uuid, global_id text, ma_boq uuid, code text, name text, unit text)
  ), mapped as (
    insert into public.bim_boq_mappings (project_id, boq_id, model_id, global_ids, unit, coefficient, notes)
    select p_project, m.ma_boq, m.model_id, array_agg(distinct m.global_id), max(m.unit), 1, 'Gắn theo mã phân loại IFC đã xem trước'
      from m group by m.ma_boq, m.model_id
    on conflict (boq_id) do update set global_ids = (select array_agg(distinct x) from unnest(public.bim_boq_mappings.global_ids || excluded.global_ids) x)
     where public.bim_boq_mappings.project_id = p_project and public.bim_boq_mappings.model_id = excluded.model_id
    returning boq_id
  ), linked as (
    insert into public.bim_lien_ket_tai_lieu (project_id, model_id, global_id, loai_doi_tuong, doi_tuong_id, ten_hien_thi)
    select p_project, m.model_id, m.global_id, 'boq', m.ma_boq::text, m.name from m join mapped x on x.boq_id = m.ma_boq
    on conflict (project_id, global_id, loai_doi_tuong, doi_tuong_id) do nothing returning 1
  ) select count(*) into n from linked;
  return n;
end $$;

-- Element links: BOQ items join documents, workspace tasks and acceptance records (phase B3).
alter table public.bim_lien_ket_tai_lieu drop constraint bim_lien_ket_tai_lieu_loai_doi_tuong_check;
alter table public.bim_lien_ket_tai_lieu add constraint bim_lien_ket_tai_lieu_loai_doi_tuong_check
  check (loai_doi_tuong in ('tai_lieu', 'nghiem_thu', 'cong_viec', 'boq'));
create or replace function bim_private.link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.nguoi_tao_uid := auth.uid(); else new.nguoi_tao_uid := old.nguoi_tao_uid; end if;
  if not exists (select 1 from public.bim_elements e where e.project_id = new.project_id and e.global_id = new.global_id
                   and (new.model_id is null or e.model_id = new.model_id)) then
    raise exception 'Cấu kiện không thuộc dự án hoặc mô hình đã chọn' using errcode = '23514';
  end if;
  if new.doi_tuong_id !~ '^[0-9a-f-]{36}$' then raise exception 'Mã đối tượng không hợp lệ' using errcode = '23514'; end if;
  if new.loai_doi_tuong = 'tai_lieu' and not exists (
       select 1 from public.sxd_bim_documents d where d.id = new.doi_tuong_id::uuid and d.project_id = new.project_id and d.deleted_at is null) then
    raise exception 'Tài liệu không thuộc dự án' using errcode = '23514';
  end if;
  if new.loai_doi_tuong = 'cong_viec' and not exists (
       select 1 from public.sxd_bim_workspace_tasks t where t.id = new.doi_tuong_id::uuid and t.project_id = new.project_id) then
    raise exception 'Nhiệm vụ không thuộc dự án' using errcode = '23514';
  end if;
  if new.loai_doi_tuong = 'nghiem_thu' and not exists (
       select 1 from public.bim_nghiem_thu n where n.ma_nghiem_thu = new.doi_tuong_id::uuid and n.ma_du_an = new.project_id) then
    raise exception 'Biên bản nghiệm thu không thuộc dự án' using errcode = '23514';
  end if;
  if new.loai_doi_tuong = 'boq' and not exists (
       select 1 from public.bim_contract_items i where i.id = new.doi_tuong_id::uuid and i.project_id = new.project_id) then
    raise exception 'Dòng BOQ không thuộc dự án' using errcode = '23514';
  end if;
  return new;
end $$;

-- ── 7. Change orders ────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  contract_id uuid not null references public.bim_contracts(id) on delete cascade,
  so text,
  tieu_de text not null check (length(btrim(tieu_de)) between 1 and 300),
  ly_do text check (ly_do is null or length(ly_do) <= 4000),
  gia_tri_dieu_chinh numeric not null default 0,
  thoi_gian_dieu_chinh_ngay integer not null default 0,
  trang_thai text not null default 'nhap' check (trang_thai in ('nhap', 'de_xuat', 'da_duyet', 'tu_choi')),
  ly_do_quyet_dinh text,
  nguoi_duyet_uid uuid,
  ngay_duyet timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, so)
);
create function bim_private.change_order_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_next integer;
begin
  if tg_op = 'DELETE' then
    if old.trang_thai in ('da_duyet', 'tu_choi') and pg_trigger_depth() <= 1 then raise exception 'Lệnh thay đổi đã quyết định không xóa được.'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.bim_contracts c where c.id = new.contract_id and c.project_id = new.project_id and c.trang_thai = 'da_ky') then
      raise exception 'Lệnh thay đổi chỉ lập cho hợp đồng đã ký của dự án.' using errcode = '23514';
    end if;
    perform pg_advisory_xact_lock(hashtext('bim_change_orders:' || new.project_id::text));
    select coalesce(max(substring(so from '[0-9]+$')::integer), 0) + 1 into v_next from public.bim_change_orders where project_id = new.project_id;
    new.so := 'CO-' || lpad(v_next::text, 4, '0');
    new.created_by := auth.uid();
    new.created_at := now();
    if new.trang_thai not in ('nhap', 'de_xuat') then raise exception 'Lệnh thay đổi mới là bản nháp hoặc đề xuất.'; end if;
    new.nguoi_duyet_uid := null; new.ngay_duyet := null;
  else
    if old.trang_thai in ('da_duyet', 'tu_choi') and current_setting('bim.change_order_decide', true) is distinct from 'on' then
      raise exception 'Lệnh thay đổi đã quyết định không sửa được.';
    end if;
    if new.trang_thai in ('da_duyet', 'tu_choi') and current_setting('bim.change_order_decide', true) is distinct from 'on' then
      raise exception 'Duyệt hoặc từ chối qua bim_change_order_decide.';
    end if;
    new.so := old.so; new.project_id := old.project_id; new.contract_id := old.contract_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_change_orders_guard before insert or update or delete on public.bim_change_orders
  for each row execute function bim_private.change_order_guard();
alter table public.bim_change_orders enable row level security;
create policy bim_change_orders_read on public.bim_change_orders for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_change_orders_write on public.bim_change_orders for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_change_orders from anon, authenticated;
grant select, insert, update, delete on public.bim_change_orders to authenticated;

create function public.bim_change_order_decide(p_id uuid, p_duyet boolean, p_ly_do text default null)
returns public.bim_change_orders language plpgsql security definer set search_path = '' as $$
declare o public.bim_change_orders;
begin
  select * into o from public.bim_change_orders where id = p_id for update;
  if not found then raise exception 'Không tìm thấy lệnh thay đổi.'; end if;
  if not bim_private.can_manage(o.project_id) then
    raise exception 'Cần quyền quản lý dự án để duyệt lệnh thay đổi.' using errcode = '42501';
  end if;
  if o.trang_thai <> 'de_xuat' then raise exception 'Chỉ quyết định lệnh thay đổi đang đề xuất.'; end if;
  if o.created_by = auth.uid() then raise exception 'Người lập không tự duyệt lệnh thay đổi.'; end if;
  if not p_duyet and coalesce(btrim(p_ly_do), '') = '' then raise exception 'Từ chối phải ghi lý do.'; end if;
  perform set_config('bim.change_order_decide', 'on', true);
  update public.bim_change_orders set trang_thai = case when p_duyet then 'da_duyet' else 'tu_choi' end,
         ly_do_quyet_dinh = nullif(btrim(p_ly_do), ''), nguoi_duyet_uid = auth.uid(), ngay_duyet = now()
   where id = o.id returning * into o;
  perform set_config('bim.change_order_decide', 'off', true);
  return o;
end $$;

-- Change order ↔ elements (GUIDs of one model and/or a floor).
create table public.bim_phat_sinh_lien_ket (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  change_order_id uuid not null references public.bim_change_orders(id) on delete cascade,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  global_ids text[] not null default '{}',
  tang text,
  ghi_chu text,
  nguoi_uid uuid,
  created_at timestamptz not null default now(),
  check (cardinality(global_ids) > 0 or tang is not null)
);
create index bim_phat_sinh_lien_ket_order on public.bim_phat_sinh_lien_ket (change_order_id);
alter table public.bim_phat_sinh_lien_ket enable row level security;
create policy bim_phat_sinh_lien_ket_read on public.bim_phat_sinh_lien_ket for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_phat_sinh_lien_ket from anon, authenticated;
grant select on public.bim_phat_sinh_lien_ket to authenticated;
create function public.bim_phat_sinh_gan(p_change_order uuid, p_model uuid, p_global_ids text[], p_tang text default null,
  p_ghi_chu text default null) returns public.bim_phat_sinh_lien_ket
language plpgsql security definer set search_path = '' as $$
declare o public.bim_change_orders; r public.bim_phat_sinh_lien_ket;
begin
  select * into o from public.bim_change_orders where id = p_change_order;
  if not found then raise exception 'Không tìm thấy lệnh thay đổi.'; end if;
  if not bim_private.can_write(o.project_id) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if not exists (select 1 from public.bim_models m where m.id = p_model and m.project_id = o.project_id) then
    raise exception 'Mô hình không thuộc dự án.';
  end if;
  if coalesce(cardinality(p_global_ids), 0) = 0 and nullif(btrim(p_tang), '') is null then raise exception 'Chọn cấu kiện hoặc tầng.'; end if;
  if exists (select 1 from unnest(coalesce(p_global_ids, '{}')) g where not exists (
       select 1 from public.bim_elements e where e.model_id = p_model and e.global_id = g)) then
    raise exception 'GUID không có trong mô hình.';
  end if;
  if nullif(btrim(p_tang), '') is not null and not exists (
       select 1 from public.bim_elements e where e.model_id = p_model and e.phan_doan_tang = btrim(p_tang)) then
    raise exception 'Tầng không có trong mô hình.';
  end if;
  insert into public.bim_phat_sinh_lien_ket (project_id, change_order_id, model_id, global_ids, tang, ghi_chu, nguoi_uid)
  values (o.project_id, o.id, p_model, coalesce(p_global_ids, '{}'), nullif(btrim(p_tang), ''), nullif(btrim(p_ghi_chu), ''), auth.uid())
  returning * into r;
  return r;
end $$;
create function public.bim_phat_sinh_go(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select project_id into v from public.bim_phat_sinh_lien_ket where id = p_id;
  if v is null then raise exception 'Không tìm thấy liên kết.'; end if;
  if not bim_private.can_write(v) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  delete from public.bim_phat_sinh_lien_ket where id = p_id;
end $$;
-- Per contract: BOQ value, approved and pending change orders, revised value, linked element count.
create function public.bim_phat_sinh_tong_hop(p_project uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'contract_id', c.id, 'so_hop_dong', c.so_hop_dong, 'ten', c.ten, 'nha_thau', c.nha_thau, 'trang_thai', c.trang_thai,
    'gia_tri_goc', coalesce((select sum(i.thanh_tien) from public.bim_contract_items i where i.contract_id = c.id), 0),
    'da_duyet', coalesce((select sum(o.gia_tri_dieu_chinh) from public.bim_change_orders o where o.contract_id = c.id and o.trang_thai = 'da_duyet'), 0),
    'cho_duyet', coalesce((select sum(o.gia_tri_dieu_chinh) from public.bim_change_orders o where o.contract_id = c.id and o.trang_thai = 'de_xuat'), 0),
    'ngay_dieu_chinh', coalesce((select sum(o.thoi_gian_dieu_chinh_ngay) from public.bim_change_orders o where o.contract_id = c.id and o.trang_thai = 'da_duyet'), 0),
    'lenh', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'so', o.so, 'tieu_de', o.tieu_de, 'trang_thai', o.trang_thai,
        'gia_tri', o.gia_tri_dieu_chinh, 'ngay', o.thoi_gian_dieu_chinh_ngay,
        'so_lien_ket', (select count(*) from public.bim_phat_sinh_lien_ket l where l.change_order_id = o.id)) order by o.so)
      from public.bim_change_orders o where o.contract_id = c.id), '[]')) order by c.so_hop_dong), '[]')
    from public.bim_contracts c where c.project_id = p_project
$$;
-- Budget summary (ACC Cost): budget, committed (signed contracts' BOQ), approved changes, revised commitment.
create function public.bim_cost_summary(p_project uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with lines as (select * from public.bim_budget_lines where project_id = p_project),
  committed as (
    select c.budget_line_id, sum(i.thanh_tien) filter (where c.trang_thai <> 'nhap') as cam_ket,
           sum(i.thanh_tien) filter (where c.trang_thai = 'nhap') as du_kien
      from public.bim_contracts c left join public.bim_contract_items i on i.contract_id = c.id
     where c.project_id = p_project group by c.budget_line_id
  ), changes as (
    select c.budget_line_id, sum(o.gia_tri_dieu_chinh) filter (where o.trang_thai = 'da_duyet') as da_duyet,
           sum(o.gia_tri_dieu_chinh) filter (where o.trang_thai = 'de_xuat') as cho_duyet
      from public.bim_change_orders o join public.bim_contracts c on c.id = o.contract_id
     where o.project_id = p_project group by c.budget_line_id
  )
  select jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'ma', l.ma, 'ten', l.ten, 'ngan_sach', l.ngan_sach,
        'cam_ket', coalesce(cm.cam_ket, 0), 'du_kien', coalesce(cm.du_kien, 0), 'thay_doi_duyet', coalesce(ch.da_duyet, 0),
        'thay_doi_cho', coalesce(ch.cho_duyet, 0),
        'con_lai', l.ngan_sach - coalesce(cm.cam_ket, 0) - coalesce(ch.da_duyet, 0)) order by l.thu_tu, l.ma)
      from lines l left join committed cm on cm.budget_line_id = l.id left join changes ch on ch.budget_line_id = l.id), '[]'),
    'chua_gan_ngan_sach', jsonb_build_object('cam_ket', coalesce((select cam_ket from committed where budget_line_id is null), 0),
      'thay_doi_duyet', coalesce((select da_duyet from changes where budget_line_id is null), 0)),
    'tong_ngan_sach', coalesce((select sum(ngan_sach) from lines), 0))
$$;

-- ── 8. Design options ───────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_phuong_an (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  mo_ta text check (mo_ta is null or length(mo_ta) <= 4000),
  model_ids uuid[] not null check (cardinality(model_ids) between 1 and 20),
  nguoi_uid uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ten)
);
alter table public.bim_phuong_an enable row level security;
create policy bim_phuong_an_read on public.bim_phuong_an for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_phuong_an from anon, authenticated;
grant select on public.bim_phuong_an to authenticated;
create function public.bim_phuong_an_luu(p_project uuid, p_id uuid, p_ten text, p_mo_ta text, p_model_ids uuid[])
returns public.bim_phuong_an language plpgsql security definer set search_path = '' as $$
declare r public.bim_phuong_an;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if exists (select 1 from unnest(p_model_ids) x where not exists (
       select 1 from public.bim_models m where m.id = x and m.project_id = p_project and m.deleted_at is null)) then
    raise exception 'Mô hình không thuộc dự án.';
  end if;
  if p_id is null then
    insert into public.bim_phuong_an (project_id, ten, mo_ta, model_ids, nguoi_uid)
    values (p_project, btrim(p_ten), nullif(btrim(p_mo_ta), ''), p_model_ids, auth.uid()) returning * into r;
  else
    update public.bim_phuong_an set ten = btrim(p_ten), mo_ta = nullif(btrim(p_mo_ta), ''), model_ids = p_model_ids, updated_at = now()
     where id = p_id and project_id = p_project returning * into r;
    if not found then raise exception 'Không tìm thấy phương án.'; end if;
  end if;
  return r;
end $$;
create function public.bim_phuong_an_xoa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select project_id into v from public.bim_phuong_an where id = p_id;
  if v is null then raise exception 'Không tìm thấy phương án.'; end if;
  if not bim_private.can_write(v) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  delete from public.bim_phuong_an where id = p_id;
end $$;
-- Metrics measured from the models of each option (site, planning and carbon metrics arrive with phase B6).
create function public.bim_phuong_an_chi_so(p_project uuid)
returns table (id uuid, ten text, mo_ta text, model_ids uuid[], so_cau_kien bigint, so_tang bigint, the_tich numeric,
  dien_tich numeric, chieu_dai numeric, trong_luong numeric, thieu_khoi_luong bigint, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.ten, p.mo_ta, p.model_ids, count(e.id), count(distinct nullif(btrim(e.phan_doan_tang), '')),
         round(sum(e.the_tich_be_tong)::numeric, 3), round(sum(e.dien_tich)::numeric, 3), round(sum(e.chieu_dai)::numeric, 3),
         round(sum(e.trong_luong)::numeric, 3),
         count(e.id) filter (where e.the_tich_be_tong is null and e.dien_tich is null and e.chieu_dai is null and e.trong_luong is null),
         p.updated_at
    from public.bim_phuong_an p left join public.bim_elements e on e.model_id = any (p.model_ids)
   where p.project_id = p_project
   group by p.id
   order by p.ten
$$;

-- ── 8b. Quick select by schedule task ──────────────────────────────────────────────────────────────────────────
-- Phase B2 accepted p_goi (work package) without filtering; it is now a leaf task of the project schedule, and the
-- facet returns the tasks linked to the filtered elements (group 'goi').
create or replace function public.bim_chon_nhanh_loc(
  p_model_ids uuid[], p_tang text[] default null, p_loai text[] default null, p_vat_lieu text[] default null,
  p_project uuid default null, p_goi uuid default null, p_nt text default 'all',
  p_nt_keys text[] default null, p_nt_guids text[] default null)
returns table (model_id uuid, express_id integer, global_id text, tang text, loai text, vat_lieu text,
  ok_tang boolean, ok_loai boolean, ok_vat_lieu boolean, ok_goi boolean, ok_nt boolean, da_nt boolean)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select e.model_id, e.express_id, e.global_id::text as guid,
           coalesce(nullif(btrim(split_part(coalesce(e.phan_doan_tang, ''), ' — ', 1)), ''), 'Không rõ tầng') as tang,
           coalesce(e.loai_cau_kien, '') as loai,
           coalesce(nullif(btrim(e.vat_lieu), ''), 'Chưa có vật liệu') as vat_lieu,
           case when cardinality(coalesce(p_nt_guids, '{}'::text[])) > 0
                then count(*) over (partition by e.global_id) else 0 end as so_guid
      from public.bim_elements e
     where e.model_id = any (p_model_ids)
  ), task_links as (
    select l.model_id, l.global_id from public.bim_schedule_links l
     where p_goi is not null and l.task_id = p_goi and l.model_id = any (p_model_ids)
  ), flags as (
    select b.*,
           (b.model_id::text || '|' || b.guid) = any (coalesce(p_nt_keys, '{}'::text[]))
             or (b.so_guid = 1 and b.guid = any (coalesce(p_nt_guids, '{}'::text[]))) as da_nt,
           p_goi is null or exists (select 1 from task_links t where t.model_id = b.model_id and t.global_id = b.guid) as in_goi
      from base b
  )
  select f.model_id, f.express_id, f.guid, f.tang, f.loai, f.vat_lieu,
         (cardinality(coalesce(p_tang, '{}'::text[])) = 0 or f.tang = any (p_tang)),
         (cardinality(coalesce(p_loai, '{}'::text[])) = 0 or f.loai = any (p_loai)),
         (cardinality(coalesce(p_vat_lieu, '{}'::text[])) = 0 or f.vat_lieu = any (p_vat_lieu)),
         f.in_goi,
         (coalesce(p_nt, 'all') = 'all' or (p_nt = 'da') = f.da_nt),
         f.da_nt
    from flags f
$$;

create or replace function public.bim_chon_nhanh_facet(
  p_model_ids uuid[], p_tang text[] default null, p_loai text[] default null, p_vat_lieu text[] default null,
  p_project uuid default null, p_goi uuid default null, p_nt text default 'all',
  p_nt_keys text[] default null, p_nt_guids text[] default null)
returns table (nhom text, gia_tri text, so_luong bigint)
language sql stable security invoker set search_path = '' as $$
  with loc as (
    select * from public.bim_chon_nhanh_loc(p_model_ids, p_tang, p_loai, p_vat_lieu, p_project, p_goi, p_nt, p_nt_keys, p_nt_guids)
  )
  select 'tang', tang, count(*) from loc where ok_loai and ok_vat_lieu and ok_goi and ok_nt group by tang
  union all
  select 'loai', loai, count(*) from loc where ok_tang and ok_vat_lieu and ok_goi and ok_nt group by loai
  union all
  select 'vat_lieu', vat_lieu, count(*) from loc where ok_tang and ok_loai and ok_goi and ok_nt group by vat_lieu
  union all
  select 'goi', l.task_id::text, count(*)
    from loc join public.bim_schedule_links l on l.model_id = loc.model_id and l.global_id = loc.global_id
   where ok_tang and ok_loai and ok_vat_lieu and ok_nt
   group by l.task_id
  union all
  select 'tong', null, count(*) from loc where ok_tang and ok_loai and ok_vat_lieu and ok_goi and ok_nt
  union all
  select 'da_nt', null, count(*) from loc where ok_tang and ok_loai and ok_vat_lieu and ok_goi and ok_nt and da_nt
  order by 1, 2
$$;

-- ── 9. Execute grants ───────────────────────────────────────────────────────────────────────────────────────────
revoke all on function bim_private.schedule_task_guard(), bim_private.schedule_link_guard(), bim_private.schedule_baseline_capture(),
  bim_private.price_stamp(), bim_private.created_now(), bim_private.estimate_lock(), bim_private.evm_locked(),
  bim_private.cost_row_guard(), bim_private.contract_item_guard(), bim_private.boq_mapping_guard(), bim_private.change_order_guard()
  from public, anon, authenticated;
revoke all on function public.bim_link_schedule_selection(uuid, uuid, jsonb, boolean), public.bim_save_schedule_baseline(uuid, text),
  public.bim_tang_thu_tu(text), public.bim_4d_sinh_tien_do(uuid, text, uuid[], date, text), public.bim_4d_nhap_tien_do(uuid, jsonb),
  public.bim_5d_overview(uuid, uuid[]), public.bim_quantity_group_elements(jsonb), public.bim_field_actual(uuid),
  public.bim_import_unit_prices(uuid, jsonb), public.bim_gia_du_thau_nhap(uuid, text, text, jsonb),
  public.bim_gia_du_thau_xoa(uuid, text, text), public.bim_5d_phan_bo(uuid), public.bim_5d_bac(uuid), public.bim_5d_pv(uuid, date),
  public.bim_5d_dong_tien(uuid), public.bim_evm_tinh(uuid, date, numeric), public.bim_evm_chot(uuid, date, numeric, text, text),
  public.bim_contract_set_status(uuid, text, date), public.bim_contract_items_import(uuid, jsonb, boolean),
  public.bim_boq_measure(uuid, text[], text), public.bim_boq_overview(uuid, uuid[], uuid, integer), public.bim_boq_facets(uuid),
  public.bim_boq_save_mapping(uuid, uuid, uuid, text, text, text, numeric, uuid), public.bim_boq_mapping_elements(uuid),
  public.bim_field_match_boq(uuid, uuid[], uuid[]), public.bim_field_apply_boq(uuid, uuid[], uuid[], text[]),
  public.bim_change_order_decide(uuid, boolean, text), public.bim_phat_sinh_gan(uuid, uuid, text[], text, text),
  public.bim_phat_sinh_go(uuid), public.bim_phat_sinh_tong_hop(uuid), public.bim_cost_summary(uuid),
  public.bim_phuong_an_luu(uuid, uuid, text, text, uuid[]), public.bim_phuong_an_xoa(uuid), public.bim_phuong_an_chi_so(uuid)
  from public, anon;
grant execute on function public.bim_link_schedule_selection(uuid, uuid, jsonb, boolean), public.bim_save_schedule_baseline(uuid, text),
  public.bim_tang_thu_tu(text), public.bim_4d_sinh_tien_do(uuid, text, uuid[], date, text), public.bim_4d_nhap_tien_do(uuid, jsonb),
  public.bim_5d_overview(uuid, uuid[]), public.bim_quantity_group_elements(jsonb), public.bim_field_actual(uuid),
  public.bim_import_unit_prices(uuid, jsonb), public.bim_gia_du_thau_nhap(uuid, text, text, jsonb),
  public.bim_gia_du_thau_xoa(uuid, text, text), public.bim_5d_phan_bo(uuid), public.bim_5d_bac(uuid), public.bim_5d_pv(uuid, date),
  public.bim_5d_dong_tien(uuid), public.bim_evm_tinh(uuid, date, numeric), public.bim_evm_chot(uuid, date, numeric, text, text),
  public.bim_contract_set_status(uuid, text, date), public.bim_contract_items_import(uuid, jsonb, boolean),
  public.bim_boq_measure(uuid, text[], text), public.bim_boq_overview(uuid, uuid[], uuid, integer), public.bim_boq_facets(uuid),
  public.bim_boq_save_mapping(uuid, uuid, uuid, text, text, text, numeric, uuid), public.bim_boq_mapping_elements(uuid),
  public.bim_field_match_boq(uuid, uuid[], uuid[]), public.bim_field_apply_boq(uuid, uuid[], uuid[], text[]),
  public.bim_change_order_decide(uuid, boolean, text), public.bim_phat_sinh_gan(uuid, uuid, text[], text, text),
  public.bim_phat_sinh_go(uuid), public.bim_phat_sinh_tong_hop(uuid), public.bim_cost_summary(uuid),
  public.bim_phuong_an_luu(uuid, uuid, text, text, uuid[]), public.bim_phuong_an_xoa(uuid), public.bim_phuong_an_chi_so(uuid)
  to authenticated;

notify pgrst, 'reload schema';

-- Upstream: 20261027140000_bim_site_sustain_reports.sql
-- BIM module phase B6 (ACC Forma site/sustainability, MEP trace, Insight reports).
-- Ported from cic-hud 20261024100000 / 20261024110000 / 20260919130000 / 20261022070000 §5 / 20261023120000 /
-- 20261025090000 / 20261025090100 / 20261024160000 / 20261016025231 / 20261022020300 / 20261024120000 with these changes:
--   * project site data (location, true north, planning limits, unit cost, floor area) is a BIM table of the project
--     instead of columns of the ERP project file (bim_du_an_ho_so); the unit cost is entered with its source (no QĐ 409
--     dataset); OSM context snapshots are files of the project in bim-models/boi-canh/ instead of CDE documents;
--   * emission factors belong to a project or to an organization (library managed by organization admins); a project
--     uses its own factors first, then those of its organization. Material mappings are per project;
--   * no demo data or demo flags in the logic, no IoT import, floor area from the project site only, LCC maintenance only
--     from the entered parameter (facility work orders arrive with phase B7), no cross-project portfolio;
--   * energy audit records link a document of the project library (documents) instead of a CDE file;
--   * MEP network writes need the converter (service role) or project write access; facility assets in the trace
--     result stay empty until phase B7;
--   * the weekly report reads BIM acceptance records (bim_nghiem_thu), adds schedule and change-order sections and drops
--     the facility section; it is written only through its RPC. bim_bao_cao_ky summarises any period for readers.
-- No regulatory values are seeded: factors, targets and design inputs come from files or users with their source.

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Organization a project is bound to (appraisal_project_profiles), and the organizations of readable projects.
create function bim_private.project_org(p_project uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.organization_id from public.sxd_bim_project_profiles a where a.project_id = p_project
$$;
create function bim_private.readable_project_orgs() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a.organization_id), '{}') from public.sxd_bim_project_profiles a
   where a.project_id = any (bim_private.readable_projects())
$$;
-- Stamp for rows written by project members: author and time from the server, project fixed after insert.
create function bim_private.site_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.project_id := old.project_id; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

-- ── 1. Project site (location, planning limits, unit cost, floor area) ──────────────────────────────────────────
create table public.bim_project_site (
  project_id uuid primary key references public.sxd_bim_projects(id) on delete cascade,
  vi_do numeric check (vi_do is null or vi_do between -90 and 90),
  kinh_do numeric check (kinh_do is null or kinh_do between -180 and 180),
  -- Angle from the viewer north (−Z) to true north, degrees clockwise seen from above.
  goc_bac_thuc numeric not null default 0 check (goc_bac_thuc > -360 and goc_bac_thuc < 360),
  dien_tich_khu_dat numeric check (dien_tich_khu_dat is null or dien_tich_khu_dat > 0),
  mat_do_toi_da numeric check (mat_do_toi_da is null or mat_do_toi_da between 0 and 100),
  hsdd_toi_da numeric check (hsdd_toi_da is null or hsdd_toi_da > 0),
  chieu_cao_toi_da numeric check (chieu_cao_toi_da is null or chieu_cao_toi_da > 0),
  can_cu_quy_hoach text check (can_cu_quy_hoach is null or length(can_cu_quy_hoach) <= 2000),
  -- Unit investment cost per m² of floor area, entered by the user with its source.
  suat_von numeric check (suat_von is null or suat_von >= 0),
  suat_von_nguon text check (suat_von_nguon is null or length(suat_von_nguon) <= 1000),
  dien_tich_san numeric check (dien_tich_san is null or dien_tich_san > 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
comment on column public.bim_project_site.goc_bac_thuc is 'Góc Bắc thật so với trục −Z của trình xem, độ, chiều kim đồng hồ.';
comment on column public.bim_project_site.dien_tich_san is 'Tổng diện tích sàn (m²): mẫu số EUI, WUI, carbon/m² và khái toán.';
create trigger bim_project_site_stamp before insert or update on public.bim_project_site
  for each row execute function bim_private.site_stamp();
alter table public.bim_project_site enable row level security;
create policy bim_project_site_read on public.bim_project_site for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_project_site_insert on public.bim_project_site for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_project_site_update on public.bim_project_site for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_project_site from anon, authenticated;
grant select, insert, update on public.bim_project_site to authenticated;

-- ── 2. Basemap under the models (image or OSM tiles) ────────────────────────────────────────────────────────────
create table public.bim_nen_ban_do (
  project_id uuid primary key references public.sxd_bim_projects(id) on delete cascade,
  loai text not null default 'anh' check (loai in ('anh', 'osm')),
  -- Image in bim-models/nen/{project}/… (loai = 'anh').
  duong_dan text,
  min_x numeric not null default 0,
  min_z numeric not null default 0,
  max_x numeric not null default 100,
  max_z numeric not null default 100,
  do_mo numeric not null default 0.9 check (do_mo between 0 and 1),
  cao_do numeric,
  ten_nguoi_cap_nhat text,
  updated_at timestamptz not null default now(),
  check (max_x >= min_x and max_z >= min_z),
  check (duong_dan is null or duong_dan like 'nen/' || project_id::text || '/%')
);
create function bim_private.basemap_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.project_id := old.project_id; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_nen_ban_do_stamp before insert or update on public.bim_nen_ban_do
  for each row execute function bim_private.basemap_stamp();
alter table public.bim_nen_ban_do enable row level security;
create policy bim_nen_ban_do_read on public.bim_nen_ban_do for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_nen_ban_do_write on public.bim_nen_ban_do for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_nen_ban_do from anon, authenticated;
grant select, insert, update, delete on public.bim_nen_ban_do to authenticated;

-- ── 3. Planning metrics ─────────────────────────────────────────────────────────────────────────────────────────
-- Floor area per storey from IfcSlab of the chosen models (default: latest ready versions). With a structural model only
-- structural slabs count (no double counting with architectural slabs); elements marked out of scope are skipped.
create function public.bim_quy_hoach_dien_tich_san(p_project uuid, p_model_ids uuid[] default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with m as (
    select b.id, b.discipline, b.model_goc_id from public.bim_models b
     where b.project_id = p_project and b.status = 'ready' and b.deleted_at is null
       and (p_model_ids is null or b.id = any (p_model_ids))
  ), latest as (
    select * from m where p_model_ids is not null or not exists (select 1 from m n where n.model_goc_id = m.id)
  ), slabs as (
    select e.model_id, l.discipline, coalesce(nullif(btrim(e.phan_doan_tang), ''), '(chưa gán tầng)') as tang, e.dien_tich
      from public.bim_elements e join latest l on l.id = e.model_id
     where upper(e.loai_cau_kien) = 'IFCSLAB' and e.dien_tich > 0
       and not exists (select 1 from public.bim_xac_minh_hien_truong x
                        where x.model_id = e.model_id and x.global_id = e.global_id and x.ket_qua = 'ngoai_pham_vi')
  ), pick as (
    select * from slabs
     where not exists (select 1 from slabs k where k.discipline = 'KET_CAU') or discipline = 'KET_CAU'
  )
  select jsonb_build_object(
    'tong', coalesce((select round(sum(dien_tich)::numeric, 1) from pick), 0),
    'nguon', case when exists (select 1 from slabs where discipline = 'KET_CAU') then 'san_ket_cau' else 'tat_ca_san' end,
    'mo_hinh', coalesce((select jsonb_agg(distinct model_id) from pick), '[]'),
    'so_san', (select count(*) from pick),
    'theo_tang', coalesce((select jsonb_agg(t order by t.tang) from (
        select tang, round(sum(dien_tich)::numeric, 1) as dien_tich, count(*) as so_san from pick group by tang) t), '[]'))
$$;

-- History of planning calculations (compared across design options).
create table public.bim_chi_so_quy_hoach (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  model_ids uuid[] not null check (cardinality(model_ids) between 1 and 50),
  dien_tich_san numeric,
  dien_tich_chiem_dat numeric,
  chieu_cao numeric,
  hsdd numeric,
  mat_do numeric,
  khai_toan numeric,
  chi_tiet jsonb not null default '{}' check (jsonb_typeof(chi_tiet) = 'object'),
  ghi_chu text check (ghi_chu is null or length(ghi_chu) <= 4000),
  nguoi_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_chi_so_quy_hoach_project on public.bim_chi_so_quy_hoach (project_id, created_at desc);
alter table public.bim_chi_so_quy_hoach enable row level security;
create policy bim_chi_so_quy_hoach_read on public.bim_chi_so_quy_hoach for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_chi_so_quy_hoach from anon, authenticated;
grant select on public.bim_chi_so_quy_hoach to authenticated;

create function public.bim_quy_hoach_luu(p_project uuid, p_row jsonb) returns public.bim_chi_so_quy_hoach
language plpgsql security definer set search_path = '' as $$
declare r public.bim_chi_so_quy_hoach; v_ids uuid[];
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_row -> 'model_ids', '[]')) <> 'array' then raise exception 'Danh sách mô hình không hợp lệ.'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(coalesce(p_row -> 'model_ids', '[]')) x;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception 'Cần ít nhất một mô hình.'; end if;
  if exists (select 1 from unnest(v_ids) i where not exists (
       select 1 from public.bim_models b where b.id = i and b.project_id = p_project and b.deleted_at is null)) then
    raise exception 'Mô hình không thuộc dự án.';
  end if;
  insert into public.bim_chi_so_quy_hoach (project_id, model_ids, dien_tich_san, dien_tich_chiem_dat, chieu_cao, hsdd, mat_do,
    khai_toan, chi_tiet, ghi_chu, nguoi_uid)
  values (p_project, v_ids, nullif(p_row ->> 'dien_tich_san', '')::numeric, nullif(p_row ->> 'dien_tich_chiem_dat', '')::numeric,
    nullif(p_row ->> 'chieu_cao', '')::numeric, nullif(p_row ->> 'hsdd', '')::numeric, nullif(p_row ->> 'mat_do', '')::numeric,
    nullif(p_row ->> 'khai_toan', '')::numeric,
    case when jsonb_typeof(p_row -> 'chi_tiet') = 'object' then p_row -> 'chi_tiet' else '{}'::jsonb end,
    nullif(btrim(p_row ->> 'ghi_chu'), ''), auth.uid())
  returning * into r;
  return r;
end $$;

-- ── 4. OpenStreetMap context snapshots ──────────────────────────────────────────────────────────────────────────
create table public.bim_boi_canh (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 300),
  -- GeoJSON in bim-models/boi-canh/{project}/osm-<ts>.geojson
  duong_dan text not null,
  tam_vi_do numeric check (tam_vi_do is null or tam_vi_do between -90 and 90),
  tam_kinh_do numeric check (tam_kinh_do is null or tam_kinh_do between -180 and 180),
  ban_kinh_m numeric check (ban_kinh_m is null or ban_kinh_m > 0),
  so_cong_trinh integer check (so_cong_trinh is null or so_cong_trinh >= 0),
  nguon text not null default 'OpenStreetMap' check (length(btrim(nguon)) between 1 and 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (duong_dan like 'boi-canh/' || project_id::text || '/%')
);
create index bim_boi_canh_project on public.bim_boi_canh (project_id, created_at desc);
create function bim_private.context_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
create trigger bim_boi_canh_stamp before insert on public.bim_boi_canh
  for each row execute function bim_private.context_stamp();
alter table public.bim_boi_canh enable row level security;
create policy bim_boi_canh_read on public.bim_boi_canh for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_boi_canh_insert on public.bim_boi_canh for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_boi_canh_delete on public.bim_boi_canh for delete to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.bim_boi_canh from anon, authenticated;
grant select, insert, delete on public.bim_boi_canh to authenticated;

create policy bim_boi_canh_files_read on storage.objects for select to authenticated
  using (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'boi-canh'
         and (storage.foldername(name))[2] = any ((select bim_private.readable_project_texts())::text[]));
create policy bim_boi_canh_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'boi-canh'
              and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[]));
create policy bim_boi_canh_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'boi-canh'
         and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[]));
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(coalesce(allowed_mime_types, '{}') || array['application/geo+json', 'application/json']))
 where id = 'bim-models';

-- ── 5. 6D: emission factors ─────────────────────────────────────────────────────────────────────────────────────
-- Factors carry their source, version, validity and confidence. Factors are never edited in place: a new version keeps
-- earlier results traceable. A factor belongs to exactly one project or one organization.
create table public.bim_6d_he_so (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.sxd_bim_projects(id) on delete cascade,
  organization_id uuid references public.sxd_bim_organizations(id) on delete cascade,
  ma_vat_lieu text not null check (ma_vat_lieu ~ '^[A-Z0-9_.-]{2,60}$'),
  ten text not null check (length(btrim(ten)) between 1 and 300),
  -- Unit of the quantity the factor multiplies.
  don_vi text not null check (don_vi in ('m3', 'm2', 'm', 'kg', 't', 'cai', 'kWh', 'm3_nuoc', 'm3_gas')),
  giai_doan text not null check (giai_doan in ('A1-A3', 'A4', 'A5', 'B6', 'B7', 'C1-C4')),
  he_so numeric not null check (he_so >= 0),
  nguon text not null check (length(btrim(nguon)) between 3 and 500),
  phien_ban text not null default '1' check (length(btrim(phien_ban)) between 1 and 40),
  do_tin_cay text not null check (do_tin_cay in ('epd_vn', 'epd_quoc_te', 'csdl_quoc_te', 'cong_bo_nha_nuoc', 'noi_bo', 'minh_hoa')),
  hieu_luc_tu date,
  hieu_luc_den date,
  -- Marks illustrative factors (do_tin_cay = 'minh_hoa'); shown as such, never treated differently in calculations.
  la_demo boolean not null default false,
  ghi_chu text check (ghi_chu is null or length(ghi_chu) <= 2000),
  nguoi_nhap_uid uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(project_id, organization_id) = 1),
  check (hieu_luc_den is null or hieu_luc_tu is null or hieu_luc_den >= hieu_luc_tu)
);
create unique index bim_6d_he_so_khoa on public.bim_6d_he_so (coalesce(project_id, organization_id), ma_vat_lieu, giai_doan, phien_ban);
create index bim_6d_he_so_org on public.bim_6d_he_so (organization_id) where organization_id is not null;
create index bim_6d_he_so_project on public.bim_6d_he_so (project_id) where project_id is not null;
alter table public.bim_6d_he_so enable row level security;
create policy bim_6d_he_so_read on public.bim_6d_he_so for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[])
         or organization_id = any ((select bim_private.readable_project_orgs())::uuid[])
         or (organization_id is not null and sxd_bim_appraisal_private.org_access(organization_id, false)));
revoke all on public.bim_6d_he_so from anon, authenticated;
grant select on public.bim_6d_he_so to authenticated;

-- Exactly one scope: p_project (project writers) or p_organization (organization admins).
create function public.bim_6d_he_so_nhap(p_project uuid, p_rows jsonb, p_organization uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if (p_project is null) = (p_organization is null) then
    raise exception 'Chọn đúng một phạm vi hệ số: dự án hoặc tổ chức.';
  end if;
  if p_organization is not null then
    if not sxd_bim_appraisal_private.org_access(p_organization, true) then
      raise exception 'Cần quyền quản trị tổ chức để nạp thư viện hệ số của tổ chức.' using errcode = '42501';
    end if;
  elsif not bim_private.can_write(p_project) then
    raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Tệp không có dòng hệ số.'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Mỗi lần nạp tối đa 5000 hệ số.'; end if;
  insert into public.bim_6d_he_so (project_id, organization_id, ma_vat_lieu, ten, don_vi, giai_doan, he_so, nguon, phien_ban,
    do_tin_cay, hieu_luc_tu, hieu_luc_den, la_demo, ghi_chu, nguoi_nhap_uid)
  select p_project, p_organization, upper(btrim(r ->> 'ma_vat_lieu')), btrim(r ->> 'ten'), btrim(r ->> 'don_vi'),
         coalesce(nullif(btrim(r ->> 'giai_doan'), ''), 'A1-A3'), (r ->> 'he_so')::numeric, btrim(r ->> 'nguon'),
         coalesce(nullif(btrim(r ->> 'phien_ban'), ''), '1'), btrim(r ->> 'do_tin_cay'),
         nullif(r ->> 'hieu_luc_tu', '')::date, nullif(r ->> 'hieu_luc_den', '')::date,
         btrim(r ->> 'do_tin_cay') = 'minh_hoa', nullif(btrim(r ->> 'ghi_chu'), ''), auth.uid()
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Factor in force at a date for a project: the project's own factors first, then its organization's; within a scope the
-- latest valid version.
create function public.bim_6d_he_so_hieu_luc(p_project uuid, p_ma text, p_giai_doan text, p_ngay date)
returns public.bim_6d_he_so
language sql stable security invoker set search_path = '' as $$
  select h.* from public.bim_6d_he_so h
   where h.ma_vat_lieu = p_ma and h.giai_doan = p_giai_doan
     and (h.project_id = p_project or (h.organization_id is not null and h.organization_id = bim_private.project_org(p_project)))
     and (h.hieu_luc_tu is null or h.hieu_luc_tu <= p_ngay) and (h.hieu_luc_den is null or h.hieu_luc_den >= p_ngay)
   order by (h.project_id is not null) desc, h.hieu_luc_tu desc nulls last, h.created_at desc, h.id
   limit 1
$$;

-- ── 6. 6D: model material → factor code ─────────────────────────────────────────────────────────────────────────
create table public.bim_6d_anh_xa (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  -- ILIKE pattern on bim_elements.vat_lieu.
  mau_vat_lieu text not null check (length(btrim(mau_vat_lieu)) between 1 and 200),
  loai_cau_kien text,
  ma_vat_lieu text not null check (length(ma_vat_lieu) between 1 and 60),
  dai_luong text not null check (dai_luong in ('m3', 'm2', 'm', 'kg', 'cai')),
  uu_tien integer not null default 100,
  nguoi_nhap_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_6d_anh_xa_project on public.bim_6d_anh_xa (project_id, uu_tien);
alter table public.bim_6d_anh_xa enable row level security;
create policy bim_6d_anh_xa_read on public.bim_6d_anh_xa for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_6d_anh_xa from anon, authenticated;
grant select on public.bim_6d_anh_xa to authenticated;

create function public.bim_6d_anh_xa_luu(p_project uuid, p_rows jsonb, p_thay boolean default true) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if p_rows is not null and jsonb_typeof(p_rows) <> 'array' then raise exception 'Danh sách ánh xạ không hợp lệ.'; end if;
  if coalesce(p_thay, true) then delete from public.bim_6d_anh_xa where project_id = p_project; end if;
  insert into public.bim_6d_anh_xa (project_id, mau_vat_lieu, loai_cau_kien, ma_vat_lieu, dai_luong, uu_tien, nguoi_nhap_uid)
  select p_project, btrim(r ->> 'mau_vat_lieu'), nullif(upper(btrim(r ->> 'loai_cau_kien')), ''), upper(btrim(r ->> 'ma_vat_lieu')),
         btrim(r ->> 'dai_luong'), coalesce(nullif(r ->> 'uu_tien', '')::integer, 100), auth.uid()
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
   where nullif(btrim(r ->> 'mau_vat_lieu'), '') is not null and nullif(btrim(r ->> 'ma_vat_lieu'), '') is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── 7. 6D: embodied carbon (A1–A3) per element ──────────────────────────────────────────────────────────────────
create table public.bim_6d_carbon (
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  express_id integer not null,
  global_id text not null,
  loai_cau_kien text,
  vat_lieu text,
  phan_doan_tang text,
  ma_vat_lieu text,
  he_so_id uuid references public.bim_6d_he_so(id) on delete set null,
  he_so numeric,
  dai_luong text,
  khoi_luong numeric,
  kgco2e numeric,
  trang_thai text not null check (trang_thai in ('da_tinh', 'thieu_anh_xa', 'thieu_he_so', 'thieu_khoi_luong', 'khong_ap_dung')),
  lan_tinh uuid not null,
  tinh_luc timestamptz not null default now(),
  primary key (model_id, express_id)
);
create index bim_6d_carbon_project on public.bim_6d_carbon (project_id, trang_thai);
create index bim_6d_carbon_run on public.bim_6d_carbon (lan_tinh);
alter table public.bim_6d_carbon enable row level security;
create policy bim_6d_carbon_read on public.bim_6d_carbon for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_6d_carbon from anon, authenticated;
grant select on public.bim_6d_carbon to authenticated;

-- Missing mapping, factor or quantity is recorded as such, never as 0.
create function public.bim_6d_tinh_carbon(p_project uuid, p_model_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lan uuid := gen_random_uuid(); v_ngay date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v jsonb;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if coalesce(cardinality(p_model_ids), 0) = 0 then raise exception 'Chọn ít nhất một mô hình.'; end if;
  if exists (select 1 from unnest(p_model_ids) x(id) where not exists (
       select 1 from public.bim_models m where m.id = x.id and m.project_id = p_project and m.status = 'ready' and m.deleted_at is null)) then
    raise exception 'Mô hình không thuộc dự án hoặc chưa sẵn sàng.';
  end if;
  delete from public.bim_6d_carbon where model_id = any (p_model_ids);
  insert into public.bim_6d_carbon (project_id, model_id, express_id, global_id, loai_cau_kien, vat_lieu, phan_doan_tang,
    ma_vat_lieu, he_so_id, he_so, dai_luong, khoi_luong, kgco2e, trang_thai, lan_tinh)
  select p_project, e.model_id, e.express_id, e.global_id, e.loai_cau_kien, e.vat_lieu, e.phan_doan_tang,
         ax.ma_vat_lieu, hs.id, hs.he_so, ax.dai_luong, q.kl,
         -- Not-applicable elements (spaces, openings…) carry no carbon even when a mapping matches.
         case when hs.id is not null and q.kl is not null
                   and upper(e.loai_cau_kien) not in ('IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT')
              then q.kl * hs.he_so * q.quy_doi end,
         case when upper(e.loai_cau_kien) in ('IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT') then 'khong_ap_dung'
              when ax.ma_vat_lieu is null then 'thieu_anh_xa'
              when hs.id is null then 'thieu_he_so'
              when q.kl is null then 'thieu_khoi_luong'
              else 'da_tinh' end,
         v_lan
    from public.bim_elements e
    left join lateral (
      select a.* from public.bim_6d_anh_xa a
       where a.project_id = p_project
         and coalesce(e.vat_lieu, '') ilike a.mau_vat_lieu
         and (a.loai_cau_kien is null or a.loai_cau_kien = upper(e.loai_cau_kien))
       order by (a.loai_cau_kien is not null) desc, a.uu_tien, length(a.mau_vat_lieu) desc, a.id
       limit 1) ax on true
    left join lateral (
      select f.* from public.bim_6d_he_so_hieu_luc(p_project, ax.ma_vat_lieu, 'A1-A3', v_ngay) f) hs on ax.ma_vat_lieu is not null
    left join lateral (
      select case ax.dai_luong when 'm3' then e.the_tich_be_tong when 'm2' then e.dien_tich when 'm' then e.chieu_dai
                               when 'kg' then e.trong_luong when 'cai' then 1 end::numeric as kl,
             -- A kg quantity with a factor per tonne.
             case when ax.dai_luong = 'kg' and hs.don_vi = 't' then 0.001 else 1 end::numeric as quy_doi) q on true
   where e.model_id = any (p_model_ids);

  select jsonb_build_object(
    'lan_tinh', v_lan,
    'tong_kgco2e', coalesce(sum(c.kgco2e), 0),
    'so_cau_kien', count(*),
    'trang_thai', (select jsonb_object_agg(s.t, s.n) from (
        select x.trang_thai as t, count(*) as n from public.bim_6d_carbon x where x.lan_tinh = v_lan group by 1) s),
    'theo_vat_lieu', (select coalesce(jsonb_agg(jsonb_build_object('ma', y.ma, 'kg', y.kg, 'n', y.n) order by y.kg desc, y.ma), '[]') from (
        select x.ma_vat_lieu as ma, sum(x.kgco2e) as kg, count(*) as n from public.bim_6d_carbon x
         where x.lan_tinh = v_lan and x.trang_thai = 'da_tinh' group by 1) y))
    into v
    from public.bim_6d_carbon c where c.lan_tinh = v_lan;
  return v;
end $$;

-- ── 8. 6D: monthly operating meters ─────────────────────────────────────────────────────────────────────────────
create table public.bim_6d_so_do (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  loai text not null check (loai in ('dien', 'nuoc', 'gas', 'tai_tao')),
  ky date not null check (extract(day from ky) = 1),
  gia_tri numeric not null check (gia_tri >= 0),
  don_vi text not null check (don_vi in ('kWh', 'm3_nuoc', 'm3_gas')),
  nguon text not null check (nguon in ('hoa_don', 'nhap_tay')),
  la_demo boolean not null default false,
  ghi_chu text check (ghi_chu is null or length(ghi_chu) <= 2000),
  nguoi_nhap_uid uuid,
  updated_at timestamptz not null default now(),
  unique (project_id, loai, ky, nguon)
);
alter table public.bim_6d_so_do enable row level security;
create policy bim_6d_so_do_read on public.bim_6d_so_do for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_6d_so_do from anon, authenticated;
grant select on public.bim_6d_so_do to authenticated;

create function public.bim_6d_so_do_nhap(p_project uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Không có số đo.'; end if;
  insert into public.bim_6d_so_do (project_id, loai, ky, gia_tri, don_vi, nguon, ghi_chu, nguoi_nhap_uid)
  select p_project, r ->> 'loai', date_trunc('month', (r ->> 'ky')::date)::date, (r ->> 'gia_tri')::numeric,
         case r ->> 'loai' when 'nuoc' then 'm3_nuoc' when 'gas' then 'm3_gas' else 'kWh' end,
         coalesce(nullif(r ->> 'nguon', ''), 'nhap_tay'), nullif(btrim(r ->> 'ghi_chu'), ''), auth.uid()
    from jsonb_array_elements(p_rows) r
  on conflict (project_id, loai, ky, nguon) do update
     set gia_tri = excluded.gia_tri, ghi_chu = excluded.ghi_chu, nguoi_nhap_uid = auth.uid(), updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── 9. 6D: targets ──────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_6d_muc_tieu (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  chi_so text not null check (chi_so in ('carbon_ngam_m2', 'eui', 'wui', 'carbon_van_hanh_m2', 'ty_le_tai_tao')),
  gia_tri numeric not null check (gia_tri >= 0),
  -- 'toi_da': the index must stay at or below the target; 'toi_thieu': at or above (renewable share).
  chieu text not null default 'toi_da' check (chieu in ('toi_da', 'toi_thieu')),
  khung text not null check (khung in ('QCVN09:2017', 'LOTUS', 'EDGE', 'LEED', 'noi_bo')),
  han date,
  ghi_chu text check (ghi_chu is null or length(ghi_chu) <= 2000),
  nguoi_nhap_uid uuid,
  created_at timestamptz not null default now(),
  unique (project_id, chi_so, khung)
);
alter table public.bim_6d_muc_tieu enable row level security;
create policy bim_6d_muc_tieu_read on public.bim_6d_muc_tieu for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_6d_muc_tieu from anon, authenticated;
grant select on public.bim_6d_muc_tieu to authenticated;

create function public.bim_6d_muc_tieu_luu(p_project uuid, p_chi_so text, p_gia_tri numeric, p_khung text,
  p_chieu text default 'toi_da', p_han date default null, p_ghi_chu text default null) returns public.bim_6d_muc_tieu
language plpgsql security definer set search_path = '' as $$
declare t public.bim_6d_muc_tieu;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  insert into public.bim_6d_muc_tieu (project_id, chi_so, gia_tri, chieu, khung, han, ghi_chu, nguoi_nhap_uid)
  values (p_project, p_chi_so, p_gia_tri, coalesce(p_chieu, 'toi_da'), p_khung, p_han, nullif(btrim(p_ghi_chu), ''), auth.uid())
  on conflict (project_id, chi_so, khung) do update
     set gia_tri = excluded.gia_tri, chieu = excluded.chieu, han = excluded.han, ghi_chu = excluded.ghi_chu,
         nguoi_nhap_uid = auth.uid()
  returning * into t;
  return t;
end $$;

create function public.bim_6d_muc_tieu_xoa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select project_id into v from public.bim_6d_muc_tieu where id = p_id;
  if v is null then raise exception 'Không tìm thấy mục tiêu.'; end if;
  if not bim_private.can_write(v) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  delete from public.bim_6d_muc_tieu where id = p_id;
end $$;

-- ── 10. 6D: project indices ─────────────────────────────────────────────────────────────────────────────────────
-- Current models: the default composition of the project when set, otherwise every ready, non-deleted model without
-- a newer version (options and old versions would double count carbon).
create function public.bim_6d_mo_hinh_hien_hanh(p_project uuid) returns uuid[]
language plpgsql stable security invoker set search_path = '' as $$
declare v jsonb; ids uuid[];
begin
  select s.to_hop_mac_dinh into v from public.bim_project_settings s where s.project_id = p_project;
  if jsonb_typeof(v) = 'object' and nullif(v ->> 'active', '') is not null then
    select array_agg(b.id order by b.id) into ids from public.bim_models b
     where b.project_id = p_project and b.deleted_at is null
       and b.id::text = any (array[v ->> 'active'] || array(
             select jsonb_array_elements_text(case when jsonb_typeof(v -> 'overlay') = 'array' then v -> 'overlay' else '[]'::jsonb end)));
    if ids is not null then return ids; end if;
  end if;
  select coalesce(array_agg(b.id order by b.id), '{}') into ids from public.bim_models b
   where b.project_id = p_project and b.deleted_at is null and b.status = 'ready'
     and not exists (select 1 from public.bim_models n where n.model_goc_id = b.id and n.deleted_at is null);
  return ids;
end $$;

create function public.bim_6d_chi_so(p_project uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_san numeric; v_ngam numeric; v_da integer; v_thieu integer; v_dien numeric; v_nuoc numeric; v_tai_tao numeric;
  v_thang integer; v_hs_dien public.bim_6d_he_so; v_hs_nuoc public.bim_6d_he_so; v_vh numeric;
  v_ngay date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_models uuid[] := public.bim_6d_mo_hinh_hien_hanh(p_project);
begin
  select s.dien_tich_san into v_san from public.bim_project_site s where s.project_id = p_project;
  select coalesce(sum(c.kgco2e), 0), count(*) filter (where c.trang_thai = 'da_tinh'),
         count(*) filter (where c.trang_thai in ('thieu_anh_xa', 'thieu_he_so', 'thieu_khoi_luong'))
    into v_ngam, v_da, v_thieu
    from public.bim_6d_carbon c where c.project_id = p_project and c.model_id = any (v_models);
  -- Last 12 months with readings; an invoice wins over a manual entry for the same month.
  with best as (
    select distinct on (d.loai, d.ky) d.loai, d.ky, d.gia_tri from public.bim_6d_so_do d
     where d.project_id = p_project and d.ky > (date_trunc('month', v_ngay) - interval '12 months')::date
     order by d.loai, d.ky, case d.nguon when 'hoa_don' then 1 else 2 end)
  select sum(b.gia_tri) filter (where b.loai = 'dien'), sum(b.gia_tri) filter (where b.loai = 'nuoc'),
         sum(b.gia_tri) filter (where b.loai = 'tai_tao'), count(distinct b.ky) filter (where b.loai = 'dien')
    into v_dien, v_nuoc, v_tai_tao, v_thang from best b;
  v_hs_dien := public.bim_6d_he_so_hieu_luc(p_project, 'LUOI_DIEN_VN', 'B6', v_ngay);
  v_hs_nuoc := public.bim_6d_he_so_hieu_luc(p_project, 'NUOC_CAP', 'B7', v_ngay);
  v_vh := case when v_dien is not null and v_hs_dien.id is not null then v_dien * v_hs_dien.he_so else null end
        + coalesce(case when v_nuoc is not null and v_hs_nuoc.id is not null then v_nuoc * v_hs_nuoc.he_so end, 0);
  return jsonb_build_object(
    'dien_tich_san', v_san,
    'carbon_ngam_kg', case when v_da > 0 then v_ngam end,
    'so_ck_da_tinh', coalesce(v_da, 0), 'so_ck_thieu', coalesce(v_thieu, 0),
    'carbon_ngam_m2', case when v_da > 0 and v_san > 0 then round(v_ngam / v_san, 2) end,
    'dien_kwh_12t', v_dien, 'nuoc_m3_12t', v_nuoc, 'tai_tao_kwh_12t', v_tai_tao, 'so_thang_dien', coalesce(v_thang, 0),
    'eui', case when v_dien is not null and v_san > 0 and v_thang = 12 then round(v_dien / v_san, 1) end,
    'wui', case when v_nuoc is not null and v_san > 0 and v_thang = 12 then round(v_nuoc / v_san, 2) end,
    'ty_le_tai_tao', case when v_dien > 0 and v_tai_tao is not null then round(v_tai_tao / v_dien * 100, 1) end,
    'carbon_van_hanh_kg_nam', case when v_thang = 12 then v_vh end,
    'carbon_van_hanh_m2', case when v_thang = 12 and v_vh is not null and v_san > 0 then round(v_vh / v_san, 2) end,
    'he_so_luoi_dien', case when v_hs_dien.id is not null then
      jsonb_build_object('he_so', v_hs_dien.he_so, 'nguon', v_hs_dien.nguon, 'phien_ban', v_hs_dien.phien_ban) end);
end $$;

-- ── 11. 6D: life-cycle assessment (LCA / LCC) ───────────────────────────────────────────────────────────────────
create table public.bim_6d_danh_gia (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  tham_so jsonb not null,
  ket_qua jsonb not null,
  trang_thai text not null default 'nhap' check (trang_thai in ('nhap', 'da_duyet')),
  nguoi_lap_uid uuid not null,
  nguoi_duyet_uid uuid,
  duyet_luc timestamptz,
  created_at timestamptz not null default now()
);
create index bim_6d_danh_gia_project on public.bim_6d_danh_gia (project_id, created_at desc);
alter table public.bim_6d_danh_gia enable row level security;
create policy bim_6d_danh_gia_read on public.bim_6d_danh_gia for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_6d_danh_gia from anon, authenticated;
grant select on public.bim_6d_danh_gia to authenticated;
create function bim_private.lca_locked() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 or old.trang_thai = 'nhap' then return old; end if;
    raise exception 'Đánh giá đã duyệt không xóa được.';
  end if;
  if old.trang_thai = 'da_duyet' then raise exception 'Đánh giá đã duyệt không sửa được.'; end if;
  return new;
end $$;
create trigger bim_6d_danh_gia_locked before update or delete on public.bim_6d_danh_gia
  for each row execute function bim_private.lca_locked();

-- Parameters: tuoi_tho_nam (default 50), ty_le_chiet_khau % (default 8), chi_phi_dau_tu (đồng; empty → latest approved
-- BIM estimate), don_gia_dien (đồng/kWh), don_gia_nuoc (đồng/m³), chi_phi_bao_tri_nam (đồng).
create function public.bim_6d_danh_gia_tinh(p_project uuid, p_tham_so jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  cs jsonb := public.bim_6d_chi_so(p_project);
  n integer := coalesce(nullif(p_tham_so ->> 'tuoi_tho_nam', '')::integer, 50);
  r numeric := coalesce(nullif(p_tham_so ->> 'ty_le_chiet_khau', '')::numeric, 8) / 100.0;
  v_capex numeric := nullif(p_tham_so ->> 'chi_phi_dau_tu', '')::numeric;
  v_bao_tri numeric := nullif(p_tham_so ->> 'chi_phi_bao_tri_nam', '')::numeric;
  v_opex numeric; v_pv_factor numeric; v_ngam numeric; v_vh numeric; v_ghi_chu text[] := '{}';
begin
  if n < 1 or n > 100 then raise exception 'Tuổi thọ phải từ 1 đến 100 năm.'; end if;
  if r < 0 or r > 0.3 then raise exception 'Tỷ lệ chiết khấu phải từ 0 đến 30%%.'; end if;
  if v_capex is null then
    select public.bim_5d_bac(e.id) into v_capex from public.bim_cost_estimates e
     where e.project_id = p_project and e.status = 'approved' order by e.approved_at desc nulls last, e.id limit 1;
    if v_capex is not null then v_ghi_chu := array_append(v_ghi_chu, 'Chi phí đầu tư lấy từ dự toán BIM đã duyệt mới nhất (phạm vi mô hình).'::text); end if;
  end if;
  v_ngam := (cs ->> 'carbon_ngam_kg')::numeric;
  v_vh := (cs ->> 'carbon_van_hanh_kg_nam')::numeric;
  v_opex := case when (cs ->> 'dien_kwh_12t') is not null and nullif(p_tham_so ->> 'don_gia_dien', '') is not null
                 then (cs ->> 'dien_kwh_12t')::numeric * (p_tham_so ->> 'don_gia_dien')::numeric end
          + coalesce(case when (cs ->> 'nuoc_m3_12t') is not null and nullif(p_tham_so ->> 'don_gia_nuoc', '') is not null
                 then (cs ->> 'nuoc_m3_12t')::numeric * (p_tham_so ->> 'don_gia_nuoc')::numeric end, 0)
          + coalesce(v_bao_tri, 0);
  v_pv_factor := case when r = 0 then n else (1 - power(1 + r, -n)) / r end;
  if v_ngam is null then v_ghi_chu := array_append(v_ghi_chu, 'Chưa có carbon ngầm: tính carbon theo cấu kiện trước.'::text); end if;
  if v_vh is null then v_ghi_chu := array_append(v_ghi_chu, 'Chưa đủ 12 tháng số đo điện hoặc chưa có hệ số lưới điện LUOI_DIEN_VN (B6): carbon vận hành để trống.'::text); end if;
  if v_opex is null then v_ghi_chu := array_append(v_ghi_chu, 'Thiếu đơn giá điện hoặc số đo điện: LCC chỉ gồm chi phí đầu tư và bảo trì.'::text); end if;
  return jsonb_build_object(
    'tuoi_tho_nam', n, 'ty_le_chiet_khau', r * 100,
    'carbon_ngam_kg', v_ngam, 'carbon_van_hanh_kg_nam', v_vh,
    'lca_kg', case when v_ngam is not null and v_vh is not null then v_ngam + v_vh * n end,
    'lca_kg_m2', case when v_ngam is not null and v_vh is not null and (cs ->> 'dien_tich_san')::numeric > 0
                      then round((v_ngam + v_vh * n) / (cs ->> 'dien_tich_san')::numeric, 1) end,
    'chi_phi_dau_tu', v_capex, 'chi_phi_van_hanh_nam', v_opex,
    'lcc', case when v_capex is not null then v_capex + coalesce(v_opex, coalesce(v_bao_tri, 0)) * v_pv_factor end,
    'he_so_hien_gia', round(v_pv_factor, 4), 'chi_so', cs, 'ghi_chu', to_jsonb(v_ghi_chu));
end $$;

create function public.bim_6d_danh_gia_luu(p_project uuid, p_ten text, p_tham_so jsonb) returns public.bim_6d_danh_gia
language plpgsql security definer set search_path = '' as $$
declare d public.bim_6d_danh_gia;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  insert into public.bim_6d_danh_gia (project_id, ten, tham_so, ket_qua, nguoi_lap_uid)
  values (p_project, btrim(p_ten), coalesce(p_tham_so, '{}'::jsonb),
          public.bim_6d_danh_gia_tinh(p_project, coalesce(p_tham_so, '{}'::jsonb)), auth.uid())
  returning * into d;
  return d;
end $$;

-- Another project writer approves; an approved assessment cannot be changed or deleted.
create function public.bim_6d_danh_gia_duyet(p_id uuid) returns public.bim_6d_danh_gia
language plpgsql security definer set search_path = '' as $$
declare d public.bim_6d_danh_gia;
begin
  select * into d from public.bim_6d_danh_gia where id = p_id for update;
  if not found then raise exception 'Không tìm thấy đánh giá.'; end if;
  if not bim_private.can_write(d.project_id) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if d.trang_thai = 'da_duyet' then raise exception 'Đánh giá đã duyệt.'; end if;
  if d.nguoi_lap_uid = auth.uid() then raise exception 'Người lập không tự duyệt đánh giá của mình.'; end if;
  update public.bim_6d_danh_gia set trang_thai = 'da_duyet', nguoi_duyet_uid = auth.uid(), duyet_luc = now()
   where id = p_id returning * into d;
  return d;
end $$;

-- ── 12. 6D: QCVN 04-3 design inputs, façade WWR, energy audits ──────────────────────────────────────────────────
create table public.bim_6d_qcvn_dau_vao (
  project_id uuid primary key references public.sxd_bim_projects(id) on delete cascade,
  loai_cong_trinh text check (loai_cong_trinh in ('van_phong', 'khach_san', 'benh_vien', 'truong_hoc', 'thuong_mai', 'chung_cu')),
  shgc_kinh numeric check (shgc_kinh > 0 and shgc_kinh <= 1),
  u_tuong numeric check (u_tuong > 0),
  r0_tuong numeric check (r0_tuong > 0),
  u_mai numeric check (u_mai > 0),
  r0_mai numeric check (r0_mai > 0),
  chiller_loai text check (chiller_loai in ('gio', 'truc_vit', 'ly_tam', 'hap_thu_gio_1', 'hap_thu_nuoc_1', 'hap_thu_2')),
  chiller_cong_suat_kw numeric check (chiller_cong_suat_kw > 0),
  chiller_cop numeric check (chiller_cop > 0),
  lpd_thiet_ke numeric check (lpd_thiet_ke >= 0),
  edge_eui_co_so numeric check (edge_eui_co_so > 0),
  edge_wui_co_so numeric check (edge_wui_co_so > 0),
  edge_vat_lieu_co_so numeric check (edge_vat_lieu_co_so > 0),
  nguon text,
  -- [{mat, cot, dien_tich, dien_tich_kinh, wwr, shgc_toi_da}] computed in the browser from the models.
  wwr_theo_huong jsonb,
  wwr_model_ids uuid[],
  wwr_tinh_luc timestamptz,
  la_demo boolean not null default false,
  nguoi_uid uuid,
  updated_at timestamptz not null default now()
);
alter table public.bim_6d_qcvn_dau_vao enable row level security;
create policy bim_6d_qcvn_dau_vao_read on public.bim_6d_qcvn_dau_vao for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_6d_qcvn_dau_vao from anon, authenticated;
grant select on public.bim_6d_qcvn_dau_vao to authenticated;

-- Replaces the design inputs (WWR results kept). Any value needs its source.
create function public.bim_6d_qcvn_luu(p_project uuid, p_row jsonb) returns public.bim_6d_qcvn_dau_vao
language plpgsql security definer set search_path = '' as $$
declare r public.bim_6d_qcvn_dau_vao; v_has boolean;
  n text[] := array['shgc_kinh', 'u_tuong', 'r0_tuong', 'u_mai', 'r0_mai', 'chiller_cong_suat_kw', 'chiller_cop', 'lpd_thiet_ke',
                    'edge_eui_co_so', 'edge_wui_co_so', 'edge_vat_lieu_co_so'];
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'Thông số không hợp lệ.'; end if;
  select exists (select 1 from unnest(n) k where nullif(p_row ->> k, '') is not null) into v_has;
  if v_has and length(btrim(coalesce(p_row ->> 'nguon', ''))) < 3 then
    raise exception 'Cần ghi nguồn của thông số (hồ sơ thiết kế, catalogue, chứng nhận…).';
  end if;
  insert into public.bim_6d_qcvn_dau_vao as t (project_id, loai_cong_trinh, shgc_kinh, u_tuong, r0_tuong, u_mai, r0_mai, chiller_loai,
    chiller_cong_suat_kw, chiller_cop, lpd_thiet_ke, edge_eui_co_so, edge_wui_co_so, edge_vat_lieu_co_so, nguon, nguoi_uid, updated_at)
  values (p_project, nullif(p_row ->> 'loai_cong_trinh', ''), nullif(p_row ->> 'shgc_kinh', '')::numeric,
    nullif(p_row ->> 'u_tuong', '')::numeric, nullif(p_row ->> 'r0_tuong', '')::numeric, nullif(p_row ->> 'u_mai', '')::numeric,
    nullif(p_row ->> 'r0_mai', '')::numeric, nullif(p_row ->> 'chiller_loai', ''), nullif(p_row ->> 'chiller_cong_suat_kw', '')::numeric,
    nullif(p_row ->> 'chiller_cop', '')::numeric, nullif(p_row ->> 'lpd_thiet_ke', '')::numeric,
    nullif(p_row ->> 'edge_eui_co_so', '')::numeric, nullif(p_row ->> 'edge_wui_co_so', '')::numeric,
    nullif(p_row ->> 'edge_vat_lieu_co_so', '')::numeric, nullif(btrim(p_row ->> 'nguon'), ''), auth.uid(), now())
  on conflict (project_id) do update set loai_cong_trinh = excluded.loai_cong_trinh, shgc_kinh = excluded.shgc_kinh,
    u_tuong = excluded.u_tuong, r0_tuong = excluded.r0_tuong, u_mai = excluded.u_mai, r0_mai = excluded.r0_mai,
    chiller_loai = excluded.chiller_loai, chiller_cong_suat_kw = excluded.chiller_cong_suat_kw, chiller_cop = excluded.chiller_cop,
    lpd_thiet_ke = excluded.lpd_thiet_ke, edge_eui_co_so = excluded.edge_eui_co_so, edge_wui_co_so = excluded.edge_wui_co_so,
    edge_vat_lieu_co_so = excluded.edge_vat_lieu_co_so, nguon = excluded.nguon, nguoi_uid = excluded.nguoi_uid,
    updated_at = now(), la_demo = false
  returning * into r;
  return r;
end $$;

create function public.bim_6d_qcvn_luu_wwr(p_project uuid, p_wwr jsonb, p_model_ids uuid[]) returns public.bim_6d_qcvn_dau_vao
language plpgsql security definer set search_path = '' as $$
declare r public.bim_6d_qcvn_dau_vao;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if p_wwr is null or jsonb_typeof(p_wwr) <> 'array' then raise exception 'WWR phải là mảng mặt đứng.'; end if;
  if exists (select 1 from jsonb_array_elements(p_wwr) f
              where coalesce((f ->> 'wwr')::numeric, -1) not between 0 and 100 or coalesce((f ->> 'dien_tich')::numeric, 0) <= 0) then
    raise exception 'WWR phải trong 0–100%% và diện tích mặt đứng dương.';
  end if;
  if exists (select 1 from unnest(coalesce(p_model_ids, '{}')) x where not exists (
       select 1 from public.bim_models m where m.id = x and m.project_id = p_project)) then
    raise exception 'Mô hình không thuộc dự án.';
  end if;
  insert into public.bim_6d_qcvn_dau_vao as t (project_id, wwr_theo_huong, wwr_model_ids, wwr_tinh_luc, nguoi_uid)
  values (p_project, p_wwr, coalesce(p_model_ids, '{}'), now(), auth.uid())
  on conflict (project_id) do update set wwr_theo_huong = excluded.wwr_theo_huong, wwr_model_ids = excluded.wwr_model_ids,
    wwr_tinh_luc = now()
  returning * into r;
  return r;
end $$;

create table public.bim_6d_kiem_toan (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  loai text not null check (loai in ('kiem_toan_nang_luong', 'kiem_ke_khi_nha_kinh', 'bao_cao_nang_luong')),
  ky_bao_cao text,
  ngay_thuc_hien date not null,
  chu_ky_nam int not null check (chu_ky_nam between 1 and 10),
  don_vi_thuc_hien text,
  toe numeric check (toe >= 0),
  eui numeric check (eui >= 0),
  tco2e numeric check (tco2e >= 0),
  ket_luan text not null default 'dang_thuc_hien' check (ket_luan in ('dat', 'can_khac_phuc', 'dang_thuc_hien')),
  -- Report file in the project document library.
  document_id uuid references public.sxd_bim_documents(id) on delete set null,
  ghi_chu text,
  la_demo boolean not null default false,
  nguoi_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_6d_kiem_toan_project on public.bim_6d_kiem_toan (project_id, loai, ngay_thuc_hien desc);
alter table public.bim_6d_kiem_toan enable row level security;
create policy bim_6d_kiem_toan_read on public.bim_6d_kiem_toan for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_6d_kiem_toan from anon, authenticated;
grant select on public.bim_6d_kiem_toan to authenticated;

create function public.bim_6d_kiem_toan_luu(p_project uuid, p_id uuid, p_row jsonb) returns public.bim_6d_kiem_toan
language plpgsql security definer set search_path = '' as $$
declare r public.bim_6d_kiem_toan; v_doc uuid := nullif(p_row ->> 'document_id', '')::uuid;
begin
  if not bim_private.can_write(p_project) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  if (p_row ->> 'ngay_thuc_hien')::date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày thực hiện không được sau hôm nay.';
  end if;
  if v_doc is not null and not exists (
       select 1 from public.sxd_bim_documents d where d.id = v_doc and d.project_id = p_project and d.deleted_at is null) then
    raise exception 'Tài liệu không thuộc dự án.';
  end if;
  if p_id is null then
    insert into public.bim_6d_kiem_toan (project_id, loai, ky_bao_cao, ngay_thuc_hien, chu_ky_nam, don_vi_thuc_hien, toe, eui, tco2e,
      ket_luan, document_id, ghi_chu, nguoi_uid)
    values (p_project, p_row ->> 'loai', nullif(btrim(p_row ->> 'ky_bao_cao'), ''), (p_row ->> 'ngay_thuc_hien')::date,
      (p_row ->> 'chu_ky_nam')::int, nullif(btrim(p_row ->> 'don_vi_thuc_hien'), ''), nullif(p_row ->> 'toe', '')::numeric,
      nullif(p_row ->> 'eui', '')::numeric, nullif(p_row ->> 'tco2e', '')::numeric,
      coalesce(nullif(p_row ->> 'ket_luan', ''), 'dang_thuc_hien'), v_doc, nullif(btrim(p_row ->> 'ghi_chu'), ''), auth.uid())
    returning * into r;
  else
    update public.bim_6d_kiem_toan set loai = p_row ->> 'loai', ky_bao_cao = nullif(btrim(p_row ->> 'ky_bao_cao'), ''),
           ngay_thuc_hien = (p_row ->> 'ngay_thuc_hien')::date, chu_ky_nam = (p_row ->> 'chu_ky_nam')::int,
           don_vi_thuc_hien = nullif(btrim(p_row ->> 'don_vi_thuc_hien'), ''), toe = nullif(p_row ->> 'toe', '')::numeric,
           eui = nullif(p_row ->> 'eui', '')::numeric, tco2e = nullif(p_row ->> 'tco2e', '')::numeric,
           ket_luan = coalesce(nullif(p_row ->> 'ket_luan', ''), 'dang_thuc_hien'), document_id = v_doc,
           ghi_chu = nullif(btrim(p_row ->> 'ghi_chu'), ''), la_demo = false
     where id = p_id and project_id = p_project
    returning * into r;
    if r.id is null then raise exception 'Không tìm thấy bản ghi.'; end if;
  end if;
  return r;
end $$;

create function public.bim_6d_kiem_toan_xoa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select project_id into v from public.bim_6d_kiem_toan where id = p_id;
  if v is null then raise exception 'Không tìm thấy bản ghi.'; end if;
  if not bim_private.can_write(v) then raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501'; end if;
  delete from public.bim_6d_kiem_toan where id = p_id;
end $$;

-- ── 13. Design options gain carbon metrics ──────────────────────────────────────────────────────────────────────
drop function public.bim_phuong_an_chi_so(uuid);
create function public.bim_phuong_an_chi_so(p_project uuid)
returns table (id uuid, ten text, mo_ta text, model_ids uuid[], so_cau_kien bigint, so_tang bigint, the_tich numeric,
  dien_tich numeric, chieu_dai numeric, trong_luong numeric, thieu_khoi_luong bigint, updated_at timestamptz,
  carbon_kg numeric, carbon_cau_kien bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.ten, p.mo_ta, p.model_ids, count(e.id), count(distinct nullif(btrim(e.phan_doan_tang), '')),
         round(sum(e.the_tich_be_tong)::numeric, 3), round(sum(e.dien_tich)::numeric, 3), round(sum(e.chieu_dai)::numeric, 3),
         round(sum(e.trong_luong)::numeric, 3),
         count(e.id) filter (where e.the_tich_be_tong is null and e.dien_tich is null and e.chieu_dai is null and e.trong_luong is null),
         p.updated_at,
         (select sum(c.kgco2e) from public.bim_6d_carbon c where c.model_id = any (p.model_ids) and c.trang_thai = 'da_tinh'),
         (select count(*) from public.bim_6d_carbon c where c.model_id = any (p.model_ids) and c.trang_thai = 'da_tinh')
    from public.bim_phuong_an p left join public.bim_elements e on e.model_id = any (p.model_ids)
   where p.project_id = p_project
   group by p.id
   order by p.ten
$$;

-- ── 14. MEP network (ports, connections, systems) and trace ─────────────────────────────────────────────────────
create table public.bim_he_thong (
  model_id uuid not null references public.bim_models(id) on delete cascade,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  guid text not null,
  ten text,
  loai text not null,
  loai_he text,
  thanh_vien text[] not null default '{}',
  la_demo boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (model_id, guid)
);
create table public.bim_ket_noi (
  id bigint generated always as identity primary key,
  model_id uuid not null references public.bim_models(id) on delete cascade,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  tu_guid text not null,
  den_guid text not null,
  chieu text not null check (chieu in ('xuoi', 'hai_chieu')),
  la_demo boolean not null default false,
  check (tu_guid <> den_guid)
);
create index bim_ket_noi_tu on public.bim_ket_noi (model_id, tu_guid);
create index bim_ket_noi_den on public.bim_ket_noi (model_id, den_guid);
create index bim_he_thong_members on public.bim_he_thong using gin (thanh_vien);
alter table public.bim_he_thong enable row level security;
alter table public.bim_ket_noi enable row level security;
create policy bim_he_thong_read on public.bim_he_thong for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_ket_noi_read on public.bim_ket_noi for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_he_thong, public.bim_ket_noi from anon, authenticated;
grant select on public.bim_he_thong, public.bim_ket_noi to authenticated;
grant all on public.bim_he_thong, public.bim_ket_noi to service_role;

-- Replaces the whole network of a model. p_he_thong: [{guid,ten,loai,loai_he,thanh_vien[]}], p_ket_noi: [{tu,den,chieu}].
-- Connections whose end is not an element of the model are skipped and counted.
create function public.bim_ket_noi_ghi(p_model uuid, p_he_thong jsonb, p_ket_noi jsonb, p_la_demo boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_ht integer; v_kn integer; v_bo integer;
begin
  select project_id into v_project from public.bim_models where id = p_model and deleted_at is null;
  if v_project is null then raise exception 'Không tìm thấy mô hình.'; end if;
  -- The converter runs as the service role (no auth.uid()); users need write access to the project.
  if auth.uid() is not null and not bim_private.can_write(v_project) then
    raise exception 'Bạn không có quyền ghi BIM ở dự án này.' using errcode = '42501';
  end if;
  if (p_he_thong is not null and jsonb_typeof(p_he_thong) <> 'array') or (p_ket_noi is not null and jsonb_typeof(p_ket_noi) <> 'array') then
    raise exception 'Hệ thống và kết nối phải là mảng.';
  end if;
  delete from public.bim_ket_noi where model_id = p_model;
  delete from public.bim_he_thong where model_id = p_model;
  insert into public.bim_he_thong (model_id, project_id, guid, ten, loai, loai_he, thanh_vien, la_demo)
  select p_model, v_project, h ->> 'guid', nullif(h ->> 'ten', ''), coalesce(nullif(h ->> 'loai', ''), 'IFCSYSTEM'), nullif(h ->> 'loai_he', ''),
         coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(h -> 'thanh_vien') = 'array' then h -> 'thanh_vien' else '[]'::jsonb end)), '{}'),
         coalesce(p_la_demo, false)
    from jsonb_array_elements(coalesce(p_he_thong, '[]')) h
   where coalesce(h ->> 'guid', '') <> ''
  on conflict (model_id, guid) do nothing;
  get diagnostics v_ht = row_count;
  with k as (
    select distinct x ->> 'tu' as tu, x ->> 'den' as den, coalesce(x ->> 'chieu', 'hai_chieu') as chieu
      from jsonb_array_elements(coalesce(p_ket_noi, '[]')) x
  )
  insert into public.bim_ket_noi (model_id, project_id, tu_guid, den_guid, chieu, la_demo)
  select p_model, v_project, k.tu, k.den, k.chieu, coalesce(p_la_demo, false) from k
   where k.tu <> k.den and k.chieu in ('xuoi', 'hai_chieu')
     and exists (select 1 from public.bim_elements e where e.model_id = p_model and e.global_id = k.tu)
     and exists (select 1 from public.bim_elements e where e.model_id = p_model and e.global_id = k.den);
  get diagnostics v_kn = row_count;
  v_bo := jsonb_array_length(coalesce(p_ket_noi, '[]')) - v_kn;
  return jsonb_build_object('he_thong', v_ht, 'ket_noi', v_kn, 'bo_qua', greatest(v_bo, 0));
end $$;

-- Trace from an element: upstream (against the flow), downstream (with the flow), two-way neighbours, systems holding
-- the element, and what a failure affects (storeys downstream; facility assets arrive with phase B7). Depth ≤ p_max_cap.
create function public.bim_truy_vet(p_model uuid, p_guid text, p_max_cap int default 200) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_project uuid; v jsonb; v_cap integer := least(greatest(coalesce(p_max_cap, 200), 1), 500);
begin
  select project_id into v_project from public.bim_models where id = p_model;
  if v_project is null or not (v_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền xem mô hình.' using errcode = '42501';
  end if;
  with recursive
  ha(guid, cap) as (
    select k.den_guid, 1 from public.bim_ket_noi k where k.model_id = p_model and k.tu_guid = p_guid and k.chieu = 'xuoi'
    union
    select k.den_guid, h.cap + 1 from ha h
      join public.bim_ket_noi k on k.model_id = p_model and k.tu_guid = h.guid and k.chieu = 'xuoi'
     where h.cap < v_cap
  ),
  thuong(guid, cap) as (
    select k.tu_guid, 1 from public.bim_ket_noi k where k.model_id = p_model and k.den_guid = p_guid and k.chieu = 'xuoi'
    union
    select k.tu_guid, t.cap + 1 from thuong t
      join public.bim_ket_noi k on k.model_id = p_model and k.den_guid = t.guid and k.chieu = 'xuoi'
     where t.cap < v_cap
  ),
  ha_min as (select guid, min(cap) as cap from ha where guid <> p_guid group by guid),
  thuong_min as (select guid, min(cap) as cap from thuong where guid <> p_guid group by guid),
  lien_ke as (
    select case when k.tu_guid = p_guid then k.den_guid else k.tu_guid end as guid from public.bim_ket_noi k
     where k.model_id = p_model and k.chieu = 'hai_chieu' and p_guid in (k.tu_guid, k.den_guid)
  )
  select jsonb_build_object(
    'goc', p_guid,
    'thuong_nguon', coalesce((select jsonb_agg(jsonb_build_object('guid', t.guid, 'cap', t.cap, 'ten', e.ten_cau_kien,
        'loai', e.loai_cau_kien, 'tang', e.phan_doan_tang) order by t.cap, t.guid)
      from thuong_min t left join public.bim_elements e on e.model_id = p_model and e.global_id = t.guid), '[]'),
    'ha_nguon', coalesce((select jsonb_agg(jsonb_build_object('guid', h.guid, 'cap', h.cap, 'ten', e.ten_cau_kien,
        'loai', e.loai_cau_kien, 'tang', e.phan_doan_tang) order by h.cap, h.guid)
      from ha_min h left join public.bim_elements e on e.model_id = p_model and e.global_id = h.guid), '[]'),
    'lien_ke', coalesce((select jsonb_agg(distinct l.guid) from lien_ke l), '[]'),
    'he_thong', coalesce((select jsonb_agg(jsonb_build_object('guid', s.guid, 'ten', s.ten, 'loai_he', s.loai_he,
        'so_thanh_vien', cardinality(s.thanh_vien)) order by s.ten, s.guid)
      from public.bim_he_thong s where s.model_id = p_model and p_guid = any (s.thanh_vien)), '[]'),
    'anh_huong', jsonb_build_object(
      'tang', coalesce((select jsonb_agg(jsonb_build_object('tang', x.tang, 'so_cau_kien', x.n) order by x.tang)
        from (select e.phan_doan_tang as tang, count(*) as n from ha_min h
                join public.bim_elements e on e.model_id = p_model and e.global_id = h.guid group by 1) x), '[]'),
      'tai_san', '[]'::jsonb),
    'gioi_han', (select coalesce(max(cap), 0) >= v_cap from ha_min) or (select coalesce(max(cap), 0) >= v_cap from thuong_min),
    'co_mang', exists (select 1 from public.bim_ket_noi k where k.model_id = p_model)
  ) into v;
  return v;
end $$;

-- ── 15. Weekly report ───────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_bao_cao_tuan (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  tuan_bat_dau date not null,
  tuan_ket_thuc date not null,
  noi_dung jsonb not null,
  tao_luc timestamptz not null default now(),
  nguoi_tao uuid default auth.uid(),
  unique (project_id, tuan_bat_dau),
  check (tuan_ket_thuc = tuan_bat_dau + 6 and extract(isodow from tuan_bat_dau) = 1)
);
alter table public.bim_bao_cao_tuan enable row level security;
create policy bim_bao_cao_tuan_read on public.bim_bao_cao_tuan for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_bao_cao_tuan from anon, authenticated;
grant select on public.bim_bao_cao_tuan to authenticated;
grant all on public.bim_bao_cao_tuan to service_role;

-- Week of p_week (Monday to Sunday, Vietnam time; default: last week). Project writers generate; readers read the table.
create function public.bim_field_weekly_report(p_project uuid, p_week date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  f date := date_trunc('week', coalesce(p_week, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 7)::timestamp)::date;
  a timestamptz; z timestamptz;
  v jsonb; clashes jsonb; models jsonb; quality jsonb; usage jsonb; acceptance jsonb; schedule jsonb; cost jsonb; result jsonb;
begin
  if auth.uid() is null or not bim_private.can_write(p_project) then
    raise exception 'Không có quyền lập báo cáo dự án' using errcode = '42501';
  end if;
  if f > v_today then raise exception 'Tuần báo cáo chưa bắt đầu'; end if;
  a := f::timestamp at time zone 'Asia/Ho_Chi_Minh';
  z := (f + 7)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  select jsonb_build_object(
    'moi', count(*) filter (where i.created_at >= a and i.created_at < z),
    'da_xu_ly', count(*) filter (where i.resolved_at >= a and i.resolved_at < z),
    'dang_mo', count(*) filter (where i.status in ('open', 'in_progress')),
    'qua_han', count(*) filter (where i.status in ('open', 'in_progress') and i.due_date < v_today),
    'uu_tien_cao', count(*) filter (where i.status in ('open', 'in_progress') and i.priority in ('high', 'critical')),
    'danh_sach_moi', coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'tieu_de', i.title, 'uu_tien', i.priority,
        'trang_thai', i.status, 'nguoi_xu_ly', i.assigned_to_name) order by i.created_at, i.id)
      filter (where i.created_at >= a and i.created_at < z), '[]'::jsonb))
    into v from public.bim_issues i where i.project_id = p_project;
  select jsonb_build_object(
    'phien_moi', count(*) filter (where s.created_at >= a and s.created_at < z),
    'so_va_cham_moi', coalesce(sum(s.so_va_cham) filter (where s.created_at >= a and s.created_at < z), 0),
    'tong_phien', count(*),
    'phien_gan_nhat', (select jsonb_build_object('ten', l.ten, 'so_va_cham', l.so_va_cham, 'ngay', l.created_at)
                         from public.bim_phien_va_cham l
                        where l.project_id = p_project and l.created_at < z
                        order by l.created_at desc, l.id limit 1))
    into clashes from public.bim_phien_va_cham s where s.project_id = p_project;
  select jsonb_build_object(
    'tai_len_trong_tuan', count(*) filter (where m.created_at >= a and m.created_at < z),
    'san_sang', count(*) filter (where m.status = 'ready'),
    'loi', count(*) filter (where m.status = 'error'),
    'dang_xu_ly', count(*) filter (where m.status in ('uploaded', 'processing')),
    'ten_moi', coalesce(jsonb_agg(m.file_name order by m.created_at, m.id) filter (where m.created_at >= a and m.created_at < z), '[]'::jsonb))
    into models from public.bim_models m where m.project_id = p_project and m.deleted_at is null;
  select jsonb_build_object(
    'so_cau_kien', coalesce(sum((q.chat_luong ->> 'so_cau_kien')::numeric), 0),
    'ty_le_khai_bao', round(100 * sum((q.chat_luong ->> 'co_qto')::numeric + (q.chat_luong ->> 'co_pset')::numeric)
                      / nullif(sum((q.chat_luong ->> 'so_cau_kien')::numeric), 0), 1),
    'ty_le_vat_lieu', round(100 * sum((q.chat_luong ->> 'co_vat_lieu')::numeric) / nullif(sum((q.chat_luong ->> 'so_cau_kien')::numeric), 0), 1),
    'so_mo_hinh_cu', 0)
    into quality from public.bim_field_quality(p_project) q;
  select jsonb_build_object(
    'luot', coalesce(sum(u.so_lan), 0),
    'nguoi_dung', count(distinct u.nguoi_dung),
    'cong_cu', coalesce((select jsonb_agg(jsonb_build_object('cong_cu', x.cong_cu, 'so_lan', x.so_lan) order by x.so_lan desc, x.cong_cu) from (
        select t.cong_cu, sum(t.so_lan) as so_lan from public.bim_su_dung t
         where t.project_id = p_project and t.ngay between f and f + 6 group by t.cong_cu order by sum(t.so_lan) desc, t.cong_cu limit 10) x), '[]'::jsonb))
    into usage from public.bim_su_dung u where u.project_id = p_project and u.ngay between f and f + 6;
  -- Acceptance records of the BIM module (per element or by group links).
  select jsonb_build_object(
    'bien_ban_moi', count(*) filter (where n.tao_luc >= a and n.tao_luc < z),
    'dat', count(*) filter (where n.ket_luan in ('dat', 'dat_co_dieu_kien')),
    'khong_dat', count(*) filter (where n.ket_luan = 'khong_dat'),
    'cho_ket_luan', count(*) filter (where n.ket_luan is null))
    into acceptance from public.bim_nghiem_thu n where n.ma_du_an = p_project;
  -- Leaf schedule tasks as of the end of the week: late = planned end passed and progress below 100 %.
  select jsonb_build_object(
    'tong', count(*),
    'hoan_thanh', count(*) filter (where coalesce(t.phan_tram_thuc_te, 0) >= 100),
    'cham', count(*) filter (where t.ket_thuc <= f + 6 and coalesce(t.phan_tram_thuc_te, 0) < 100))
    into schedule from public.bim_schedule_tasks t where t.project_id = p_project and not t.la_tom_tat;
  select jsonb_build_object(
    'lenh_duyet_so', (select count(*) from public.bim_change_orders o
                       where o.project_id = p_project and o.trang_thai = 'da_duyet' and o.ngay_duyet >= a and o.ngay_duyet < z),
    'lenh_duyet_gia_tri', (select coalesce(sum(o.gia_tri_dieu_chinh), 0) from public.bim_change_orders o
                            where o.project_id = p_project and o.trang_thai = 'da_duyet' and o.ngay_duyet >= a and o.ngay_duyet < z),
    'lenh_cho_so', (select count(*) from public.bim_change_orders o where o.project_id = p_project and o.trang_thai = 'de_xuat'),
    'hop_dong_ky_so', (select count(*) from public.bim_contracts c
                        where c.project_id = p_project and c.trang_thai in ('da_ky', 'thanh_ly') and c.ngay_ky between f and f + 6))
    into cost;
  result := jsonb_build_object(
    'ten_du_an', (select p.name from public.sxd_bim_projects p where p.id = p_project),
    'tu_ngay', f, 'den_ngay', f + 6, 'tu_dong', false,
    'vuong_mac', v, 'va_cham', clashes, 'mo_hinh', models, 'chat_luong', quality, 'su_dung', usage, 'nghiem_thu', acceptance,
    'tien_do', schedule, 'chi_phi', cost, 'tao_luc', now());
  insert into public.bim_bao_cao_tuan (project_id, tuan_bat_dau, tuan_ket_thuc, noi_dung, nguoi_tao)
  values (p_project, f, f + 6, result, auth.uid())
  on conflict (project_id, tuan_bat_dau) do update set noi_dung = excluded.noi_dung, tao_luc = now(), nguoi_tao = auth.uid();
  return result;
end $$;

-- ── 16. Periodic report (any period, readers) ───────────────────────────────────────────────────────────────────
create function public.bim_bao_cao_ky(p_project uuid, p_tu date, p_den date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  a timestamptz; z timestamptz; v_current uuid[]; v_evm public.bim_evm_ky; r jsonb;
begin
  if p_project is null or not (p_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền xem dự án.' using errcode = '42501';
  end if;
  if p_tu is null or p_den is null or p_den < p_tu then raise exception 'Kỳ báo cáo không hợp lệ.'; end if;
  a := p_tu::timestamp at time zone 'Asia/Ho_Chi_Minh';
  z := (p_den + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_current := public.bim_6d_mo_hinh_hien_hanh(p_project);
  select * into v_evm from public.bim_evm_ky k where k.project_id = p_project and k.ngay_chot <= p_den
   order by k.ngay_chot desc, k.created_at desc, k.id limit 1;
  select jsonb_build_object(
    'tu_ngay', p_tu, 'den_ngay', p_den,
    'mo_hinh', (select jsonb_build_object('tong', count(*), 'moi', count(*) filter (where m.created_at >= a and m.created_at < z))
                  from public.bim_models m where m.project_id = p_project and m.deleted_at is null),
    'vuong_mac', (select jsonb_build_object(
                    'mo_moi', count(*) filter (where i.created_at >= a and i.created_at < z),
                    'dong', count(*) filter (where i.resolved_at >= a and i.resolved_at < z),
                    'dang_mo', count(*) filter (where i.status in ('open', 'in_progress')),
                    'qua_han', count(*) filter (where i.status in ('open', 'in_progress') and i.due_date < least(p_den + 1, v_today)))
                    from public.bim_issues i where i.project_id = p_project),
    'va_cham', (select jsonb_build_object('dang_mo', count(*)) from public.bim_va_cham c
                 where c.project_id = p_project and c.trang_thai in ('moi', 'dang_xu_ly')),
    'cde', (select jsonb_build_object('de_trinh', count(*), 'da_duyet', count(*) filter (where s.trang_thai = 'da_duyet'),
                                      'tra_lai', count(*) filter (where s.trang_thai = 'tra_lai'))
              from public.document_cde_submissions s where s.project_id = p_project and s.created_at >= a and s.created_at < z),
    'xac_minh_ifc', coalesce((select jsonb_agg(jsonb_build_object('model_id', x.model_id, 'file_name', x.file_name,
                        'diem_tong', x.diem_tong, 'dat', x.dat, 'created_at', x.created_at) order by x.file_name, x.model_id)
              from (select distinct on (m.id) m.id as model_id, m.file_name, q.diem_tong, q.dat, q.created_at
                      from public.bim_models m join public.bim_ifc_xac_minh q on q.model_id = m.id
                     where m.project_id = p_project and m.deleted_at is null
                       and not exists (select 1 from public.bim_models n where n.model_goc_id = m.id and n.deleted_at is null)
                     order by m.id, q.created_at desc, q.id) x), '[]'::jsonb),
    'tien_do', (select jsonb_build_object('tong', count(*),
                    'hoan_thanh', count(*) filter (where coalesce(t.phan_tram_thuc_te, 0) >= 100),
                    'cham', count(*) filter (where t.ket_thuc <= p_den and coalesce(t.phan_tram_thuc_te, 0) < 100))
                  from public.bim_schedule_tasks t where t.project_id = p_project and not t.la_tom_tat),
    'evm', case when v_evm.id is null then null else jsonb_build_object('ngay_chot', v_evm.ngay_chot, 'spi', v_evm.spi,
             'cpi', v_evm.cpi, 'bac', v_evm.bac, 'ev', v_evm.ev, 'ac', v_evm.ac) end,
    'lenh_thay_doi', (select jsonb_build_object(
                        'duyet_so', count(*) filter (where o.trang_thai = 'da_duyet' and o.ngay_duyet >= a and o.ngay_duyet < z),
                        'duyet_gia_tri', coalesce(sum(o.gia_tri_dieu_chinh) filter (where o.trang_thai = 'da_duyet' and o.ngay_duyet >= a and o.ngay_duyet < z), 0),
                        'cho_so', count(*) filter (where o.trang_thai = 'de_xuat'))
                        from public.bim_change_orders o where o.project_id = p_project),
    'carbon', (select jsonb_build_object('tong_kgco2e', coalesce(sum(c.kgco2e), 0), 'so_cau_kien', count(*))
                 from public.bim_6d_carbon c where c.project_id = p_project and c.model_id = any (v_current) and c.trang_thai = 'da_tinh'))
    into r;
  return r;
end $$;

-- ── 17. Execute grants ──────────────────────────────────────────────────────────────────────────────────────────
revoke all on function bim_private.site_stamp(), bim_private.basemap_stamp(), bim_private.context_stamp(), bim_private.lca_locked()
  from public, anon, authenticated;
revoke all on function bim_private.project_org(uuid), bim_private.readable_project_orgs() from public, anon;
grant execute on function bim_private.project_org(uuid), bim_private.readable_project_orgs() to authenticated, service_role;
revoke all on function public.bim_quy_hoach_dien_tich_san(uuid, uuid[]), public.bim_quy_hoach_luu(uuid, jsonb),
  public.bim_6d_he_so_nhap(uuid, jsonb, uuid), public.bim_6d_he_so_hieu_luc(uuid, text, text, date),
  public.bim_6d_anh_xa_luu(uuid, jsonb, boolean), public.bim_6d_tinh_carbon(uuid, uuid[]), public.bim_6d_so_do_nhap(uuid, jsonb),
  public.bim_6d_muc_tieu_luu(uuid, text, numeric, text, text, date, text), public.bim_6d_muc_tieu_xoa(uuid),
  public.bim_6d_mo_hinh_hien_hanh(uuid), public.bim_6d_chi_so(uuid), public.bim_6d_danh_gia_tinh(uuid, jsonb),
  public.bim_6d_danh_gia_luu(uuid, text, jsonb), public.bim_6d_danh_gia_duyet(uuid), public.bim_6d_qcvn_luu(uuid, jsonb),
  public.bim_6d_qcvn_luu_wwr(uuid, jsonb, uuid[]), public.bim_6d_kiem_toan_luu(uuid, uuid, jsonb), public.bim_6d_kiem_toan_xoa(uuid),
  public.bim_phuong_an_chi_so(uuid), public.bim_ket_noi_ghi(uuid, jsonb, jsonb, boolean), public.bim_truy_vet(uuid, text, integer),
  public.bim_field_weekly_report(uuid, date), public.bim_bao_cao_ky(uuid, date, date)
  from public, anon;
grant execute on function public.bim_quy_hoach_dien_tich_san(uuid, uuid[]), public.bim_quy_hoach_luu(uuid, jsonb),
  public.bim_6d_he_so_nhap(uuid, jsonb, uuid), public.bim_6d_he_so_hieu_luc(uuid, text, text, date),
  public.bim_6d_anh_xa_luu(uuid, jsonb, boolean), public.bim_6d_tinh_carbon(uuid, uuid[]), public.bim_6d_so_do_nhap(uuid, jsonb),
  public.bim_6d_muc_tieu_luu(uuid, text, numeric, text, text, date, text), public.bim_6d_muc_tieu_xoa(uuid),
  public.bim_6d_mo_hinh_hien_hanh(uuid), public.bim_6d_chi_so(uuid), public.bim_6d_danh_gia_tinh(uuid, jsonb),
  public.bim_6d_danh_gia_luu(uuid, text, jsonb), public.bim_6d_danh_gia_duyet(uuid), public.bim_6d_qcvn_luu(uuid, jsonb),
  public.bim_6d_qcvn_luu_wwr(uuid, jsonb, uuid[]), public.bim_6d_kiem_toan_luu(uuid, uuid, jsonb), public.bim_6d_kiem_toan_xoa(uuid),
  public.bim_phuong_an_chi_so(uuid), public.bim_truy_vet(uuid, text, integer),
  public.bim_field_weekly_report(uuid, date), public.bim_bao_cao_ky(uuid, date, date)
  to authenticated;
grant execute on function public.bim_ket_noi_ghi(uuid, jsonb, jsonb, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Upstream: 20261027150000_bim_assets_operations.sql
-- BIM module phase B7 (ACC Build › Assets and Closeout): asset register, work orders, preventive maintenance,
-- inspection rounds, fault diagnoses, operations KPIs, handover checklist and handover packages.
-- Ported from cic-hud 20261015025205 / 20261015032959 / 20261015035042 / 20261015035847 / 20261015040207 /
-- 20261021100000 §5 / 20261022020100 / 20261022020200 / 20261022020300 / 20261022080000 / 20261024150000 with these
-- changes:
--   * the asset register is the BIM table bim_assets (uuid ids, document_projects) with the column names of the
--     cic-hud compatibility view facility_assets, instead of the ERP table tai_san_co_so; no demo/actual split
--     (data_kind is dropped everywhere); text dates are checked as ISO dates and mirrored by typed generated columns;
--   * work orders, plans, routes, rounds, diagnoses and handover items use uuid ids (facility_work_orders.id is uuid);
--   * people are project persons (owner and members of the project, bim_nguoi_tham_gia), not ERP accounts; there is no
--     in-app notification table in BuildSIA, so assignment and due-date notifications are not written;
--   * IFC import reads standard IFC/COBie property sets (no HUD dictionary) and the MEP systems of bim_he_thong;
--   * handover items point to BIM acceptance records (bim_nghiem_thu); the handover package gathers BuildSIA tables
--     and maps Published CDE containers to Phụ lục VII items through document_cde_containers.muc_phu_luc_vii;
--   * packages are stored in bim-models/ban-giao/{project}/ and registered append-only (no ERP completion dossier);
--   * the weekly report (bim_field_weekly_report, phase B6) is not redefined: facility_ops_summary is standalone;
--   * pg_cron and the Realtime publication are optional (guarded); without pg_cron the client or a worker calls the
--     PM generation RPCs.
-- IoT points/alerts and the ingest pipeline are in 20261027160000_bim_iot.sql.

-- ── 0. Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
-- ISO date from a text column; IMMUTABLE for generated columns (make_date does not depend on DateStyle).
create function public.facility_iso_date(p text) returns date
language sql immutable parallel safe set search_path = '' as $$
  select case when p ~ '^\d{4}-\d{2}-\d{2}$'
    then make_date(substr(p, 1, 4)::int, substr(p, 6, 2)::int, substr(p, 9, 2)::int) end
$$;
-- Business dates are Vietnam dates.
create function public.facility_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;
-- Server context (pg_cron, service role): history is written with a null actor.
create function bim_private.facility_system_context() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is null
     and coalesce(current_setting('role', true), '') in ('none', 'postgres', 'supabase_admin', 'service_role')
$$;
-- Display name of an account (accounts have no display name yet: the e-mail's local part, as bim_nguoi_tham_gia).
create function bim_private.facility_user_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select nullif(split_part(u.email::text, '@', 1), '') from auth.users u where u.id = p_user
$$;

-- Floor key, same rule as sensorFloor() (src/features/bim/lib/iotSensorFloors.ts): "A:T28", "basement:B1", "building:T3".
create function public.facility_floor_key(p_label text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  t text := translate(lower(coalesce(p_label, '')),
    'áàảãạâấầẩẫậăắằẳẵặéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
  v_tower text; n text;
begin
  v_tower := substring(t from '\ythap\s+([a-z0-9]+)\y');
  if v_tower is not null then t := regexp_replace(t, '\ythap\s+[a-z0-9]+\y', ' '); end if;
  n := substring(t from '\y(?:ham\s*(?:b\s*)?|b)0*(\d+)\y');
  if n is not null then return 'basement:B' || n::int; end if;
  n := substring(t from '\y(?:tang\s*|t)0*(\d+)\y');
  if n is null then return null; end if;
  return coalesce(upper(v_tower), 'building') || ':T' || n::int;
end $$;

-- Operation attributes of an element from standard IFC / COBie property sets (instance first, then type).
create function public.facility_element_attr(p_props jsonb, p_key text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select nullif(btrim(case p_key
    when 'hang_san_xuat' then coalesce(p_props #>> '{psets,Pset_ManufacturerTypeInformation,Manufacturer}',
      p_props #>> '{kieu,psets,Pset_ManufacturerTypeInformation,Manufacturer}', p_props #>> '{kieu,psets,COBie_Type,Manufacturer}')
    when 'model_thiet_bi' then coalesce(p_props #>> '{psets,Pset_ManufacturerTypeInformation,ModelLabel}',
      p_props #>> '{kieu,psets,Pset_ManufacturerTypeInformation,ModelLabel}',
      p_props #>> '{psets,Pset_ManufacturerTypeInformation,ModelReference}',
      p_props #>> '{kieu,psets,Pset_ManufacturerTypeInformation,ModelReference}', p_props #>> '{kieu,psets,COBie_Type,ModelNumber}')
    when 'so_serial' then coalesce(p_props #>> '{psets,Pset_ManufacturerOccurrence,SerialNumber}',
      p_props #>> '{psets,COBie_Component,SerialNumber}')
    when 'ten_he_thong' then p_props #>> '{psets,COBie_System,Name}'
    when 'ma_he_thong' then p_props #>> '{psets,COBie_System,Identifier}'
    when 'ma_phong' then p_props #>> '{psets,COBie_Component,Space}'
    when 'ma_tai_san' then coalesce(p_props #>> '{psets,COBie_Component,AssetIdentifier}',
      p_props #>> '{psets,COBie_Component,TagNumber}', p_props #>> '{psets,Pset_ManufacturerOccurrence,AssetTag}')
  end), '')
$$;

-- ── 1. Floors and spaces ────────────────────────────────────────────────────────────────────────────────────────
create table public.facility_floors (
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  floor_key text not null check (length(floor_key) between 1 and 80),
  building text,
  level integer,
  name text not null check (length(btrim(name)) between 1 and 200),
  elevation_m numeric,
  source text not null default 'manual' check (source in ('ifc', 'manual')),
  updated_at timestamptz not null default now(),
  primary key (project_id, floor_key)
);
create table public.facility_spaces (
  project_id uuid not null,
  space_code text not null check (length(btrim(space_code)) between 1 and 120),
  floor_key text not null,
  name text,
  source text not null default 'manual' check (source in ('ifc', 'manual')),
  updated_at timestamptz not null default now(),
  primary key (project_id, space_code),
  foreign key (project_id, floor_key) references public.facility_floors(project_id, floor_key) on delete cascade
);
create index facility_spaces_floor on public.facility_spaces (project_id, floor_key);

-- ── 2. Asset register ───────────────────────────────────────────────────────────────────────────────────────────
-- Columns follow the cic-hud facility_assets view (client field names). Dates entered as text (ISO yyyy-mm-dd) keep
-- the ported client unchanged; *_on columns are their typed copies for filters and indexes.
create table public.bim_assets (
  asset_id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  asset_name text not null check (length(btrim(asset_name)) between 1 and 300),
  asset_code text check (asset_code is null or length(btrim(asset_code)) between 1 and 120),
  category text check (category is null or length(category) <= 100),
  location text,
  manufacturer text,
  model text,
  install_date text check (install_date is null or install_date ~ '^\d{4}-\d{2}-\d{2}$'),
  warranty_expiry text check (warranty_expiry is null or warranty_expiry ~ '^\d{4}-\d{2}-\d{2}$'),
  condition text default 'Good' check (condition is null or condition in ('Good', 'Fair', 'Poor', 'Critical')),
  status text not null default 'Active' check (status in ('Active', 'Maintenance', 'Broken', 'Retired')),
  bim_element_id text,
  maintenance_cycle_days integer,
  last_maintenance text check (last_maintenance is null or last_maintenance ~ '^\d{4}-\d{2}-\d{2}$'),
  next_maintenance text check (next_maintenance is null or next_maintenance ~ '^\d{4}-\d{2}-\d{2}$'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contractor text,
  purchase_cost numeric check (purchase_cost is null or (purchase_cost >= 0 and purchase_cost <> 'NaN'::numeric)),
  warranty_provider text,
  handover_status text not null default 'unknown' check (handover_status in ('unknown', 'pending', 'handed_over')),
  handover_date date,
  location_building text,
  location_floor text,
  location_room text,
  model_id uuid references public.bim_models(id) on delete set null,
  documents jsonb not null default '[]' check (jsonb_typeof(documents) = 'array'),
  next_maintenance_on date generated always as (public.facility_iso_date(next_maintenance)) stored,
  last_maintenance_on date generated always as (public.facility_iso_date(last_maintenance)) stored,
  install_on date generated always as (public.facility_iso_date(install_date)) stored,
  warranty_expiry_on date generated always as (public.facility_iso_date(warranty_expiry)) stored,
  floor_key text,
  space_code text,
  system_name text check (system_name is null or length(btrim(system_name)) between 1 and 200),
  serial_number text check (serial_number is null or length(btrim(serial_number)) between 1 and 120),
  created_by uuid,
  unique (project_id, asset_id),
  foreign key (project_id, floor_key) references public.facility_floors(project_id, floor_key) on delete set null (floor_key),
  foreign key (project_id, space_code) references public.facility_spaces(project_id, space_code) on delete set null (space_code)
);
create unique index bim_assets_project_code on public.bim_assets (project_id, lower(btrim(asset_code)))
  where nullif(btrim(asset_code), '') is not null;
create index bim_assets_project on public.bim_assets (project_id, created_at desc);
create index bim_assets_model_guid on public.bim_assets (project_id, model_id, bim_element_id) where bim_element_id is not null;
create index bim_assets_next_maintenance on public.bim_assets (project_id, next_maintenance_on);
create index bim_assets_warranty on public.bim_assets (project_id, warranty_expiry_on);
create index bim_assets_floor on public.bim_assets (project_id, floor_key);
create index bim_assets_system on public.bim_assets (project_id, system_name);
create index bim_assets_model on public.bim_assets (model_id) where model_id is not null;

-- Validation, location from floors/spaces, server stamps (cic-hud bim_validate_workflow_reference + facility_asset_location).
create function bim_private.facility_asset_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f public.facility_floors; s public.facility_spaces;
begin
  new.install_date := nullif(btrim(new.install_date), '');
  new.warranty_expiry := nullif(btrim(new.warranty_expiry), '');
  new.last_maintenance := nullif(btrim(new.last_maintenance), '');
  new.next_maintenance := nullif(btrim(new.next_maintenance), '');
  new.asset_code := nullif(btrim(new.asset_code), '');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    if new.project_id <> old.project_id or new.asset_id <> old.asset_id then
      raise exception 'Không được chuyển tài sản sang dự án khác';
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    if (new.next_maintenance is distinct from old.next_maintenance or new.maintenance_cycle_days is distinct from old.maintenance_cycle_days)
       and length(btrim(coalesce(current_setting('bim.change_reason', true), ''))) < 5 then
      raise exception 'Cần lý do thay lịch bảo trì';
    end if;
  end if;
  if new.model_id is not null then
    if not exists (select 1 from public.bim_models m where m.id = new.model_id and m.project_id = new.project_id) then
      raise exception 'Mô hình không thuộc dự án';
    end if;
    if new.bim_element_id is not null and not exists (
         select 1 from public.bim_elements e where e.model_id = new.model_id and e.global_id = new.bim_element_id) then
      raise exception 'GUID không thuộc phiên bản mô hình đã chọn';
    end if;
  end if;
  if new.handover_status = 'handed_over' and new.handover_date is null then raise exception 'Cần ngày bàn giao'; end if;
  if new.maintenance_cycle_days is not null and new.maintenance_cycle_days < 1 then
    raise exception 'Chu kỳ bảo trì phải lớn hơn 0';
  end if;
  -- Location from the floor/space entities.
  if new.space_code is not null then
    if tg_op = 'INSERT' or new.space_code is distinct from old.space_code or new.floor_key is distinct from old.floor_key then
      select * into s from public.facility_spaces where project_id = new.project_id and space_code = new.space_code;
      if s.space_code is null then raise exception 'Không gian không thuộc dự án'; end if;
      if new.floor_key is null then new.floor_key := s.floor_key;
      elsif new.floor_key <> s.floor_key then raise exception 'Phòng/không gian không thuộc tầng đã chọn'; end if;
      new.location_room := s.space_code;
    end if;
  end if;
  if new.floor_key is not null then
    if tg_op = 'INSERT' or new.floor_key is distinct from old.floor_key then
      select * into f from public.facility_floors where project_id = new.project_id and floor_key = new.floor_key;
      if f.floor_key is null then raise exception 'Tầng không thuộc dự án'; end if;
      new.location_building := coalesce(nullif(f.building, ''), new.location_building);
      new.location_floor := case when f.level is null then f.name when f.floor_key like 'basement:%' then 'B' || abs(f.level)
                                 else 'T' || lpad(f.level::text, 2, '0') end;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger bim_assets_10_write before insert or update on public.bim_assets
  for each row execute function bim_private.facility_asset_before_write();

alter table public.bim_assets enable row level security;
create policy bim_assets_read on public.bim_assets for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy bim_assets_insert on public.bim_assets for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy bim_assets_update on public.bim_assets for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
-- Removing an asset (with its history) is for project managers; assets with work orders cannot be removed.
create policy bim_assets_delete on public.bim_assets for delete to authenticated using (bim_private.can_manage(project_id));
revoke all on public.bim_assets from anon, authenticated;
grant select, insert, update, delete on public.bim_assets to authenticated;
grant all on public.bim_assets to service_role;

create table public.facility_asset_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  asset_id uuid not null references public.bim_assets(asset_id) on delete cascade,
  actor_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index facility_asset_events_asset on public.facility_asset_events (asset_id, id desc);
create index facility_asset_events_project on public.facility_asset_events (project_id, id desc);

-- Floors/spaces policies (after bim_assets so the FK from assets exists).
alter table public.facility_floors enable row level security;
alter table public.facility_spaces enable row level security;
do $$ declare t text; begin
  foreach t in array array['facility_floors', 'facility_spaces'] loop
    execute format('create policy %I on public.%I for select to authenticated using (project_id = any ((select bim_private.readable_projects())::uuid[]))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (project_id = any ((select bim_private.writable_projects())::uuid[])) with check (project_id = any ((select bim_private.writable_projects())::uuid[]))', t || '_write', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ── 3. Preventive maintenance plans ─────────────────────────────────────────────────────────────────────────────
create table public.facility_pm_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  asset_id uuid,
  asset_category text check (asset_category is null or length(btrim(asset_category)) between 1 and 100),
  cycle_days integer not null check (cycle_days between 1 and 3660),
  lead_days integer not null default 7 check (lead_days between 0 and 365),
  start_on date not null default public.facility_today(),
  checklist_template jsonb not null default '[]'
    check (jsonb_typeof(checklist_template) = 'array' and jsonb_array_length(checklist_template) <= 50),
  default_assignee_id uuid references auth.users(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_pm_target check ((asset_id is null) <> (asset_category is null)),
  constraint facility_pm_asset foreign key (project_id, asset_id) references public.bim_assets(project_id, asset_id) on delete cascade
);
create index facility_pm_plans_project on public.facility_pm_plans (project_id, active);
create index facility_pm_plans_asset on public.facility_pm_plans (project_id, asset_id) where asset_id is not null;
create index facility_pm_plans_assignee on public.facility_pm_plans (default_assignee_id) where default_assignee_id is not null;

create function bim_private.facility_validate_pm_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.version := 1;
  else
    if (new.project_id, new.created_by, new.created_at) is distinct from (old.project_id, old.created_by, old.created_at) then
      raise exception 'Không được đổi dự án hoặc người lập kế hoạch bảo trì';
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  if exists (select 1 from jsonb_array_elements(new.checklist_template) c
              where jsonb_typeof(c) <> 'string' or length(btrim(c #>> '{}')) not between 1 and 300) then
    raise exception 'Checklist mẫu phải là danh sách việc (1–300 ký tự)';
  end if;
  if new.default_assignee_id is not null then
    if (tg_op = 'INSERT' or new.default_assignee_id is distinct from old.default_assignee_id)
       and not bim_private.is_project_person(new.project_id, new.default_assignee_id) then
      raise exception 'Người mặc định phải là thành viên dự án';
    end if;
  end if;
  return new;
end $$;
create trigger facility_pm_plan_validate before insert or update on public.facility_pm_plans
  for each row execute function bim_private.facility_validate_pm_plan();
alter table public.facility_pm_plans enable row level security;
create policy facility_pm_read on public.facility_pm_plans for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy facility_pm_write on public.facility_pm_plans for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.facility_pm_plans from anon, authenticated;
grant select, insert, update, delete on public.facility_pm_plans to authenticated;
grant all on public.facility_pm_plans to service_role;

-- ── 4. Work orders ──────────────────────────────────────────────────────────────────────────────────────────────
create table public.facility_work_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  asset_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'review', 'completed', 'cancelled')),
  assignee_id uuid references auth.users(id) on delete set null,
  assignee_name text,
  due_date date not null,
  started_at timestamptz,
  completed_on date,
  confirmed_by uuid,
  result text,
  cost numeric check (cost is null or (cost >= 0 and cost <> 'NaN'::numeric)),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array'),
  -- Storage paths in bim-facility-documents ({project}/{asset}/wo-{order}/…) or {title,url} objects.
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  version integer not null default 1,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  asset_status_before text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  work_type text not null default 'sua_chua' check (work_type in ('sua_chua', 'dinh_ky', 'kiem_tra')),
  sla_due_at timestamptz,
  labor_hours numeric check (labor_hours is null or (labor_hours >= 0 and labor_hours <= 10000 and labor_hours <> 'NaN'::numeric)),
  failure_code text check (failure_code is null or length(btrim(failure_code)) between 1 and 64),
  downtime_minutes integer check (downtime_minutes is null or downtime_minutes between 0 and 5256000),
  reopened_from uuid references public.facility_work_orders(id),
  -- A plan that generated orders cannot be deleted (keeps the source): pause it instead (active = false).
  pm_plan_id uuid references public.facility_pm_plans(id),
  pm_due_on date,
  completed_at timestamptz,
  -- Completion confirmation is stamped by the server (confirmed_by, completed_at); this keeps an optional note object.
  signature jsonb check (signature is null or jsonb_typeof(signature) = 'object'),
  constraint facility_order_pm_pair check ((pm_plan_id is null) = (pm_due_on is null)),
  unique (project_id, id),
  foreign key (project_id, asset_id) references public.bim_assets(project_id, asset_id)
);
create index facility_orders_project_due on public.facility_work_orders (project_id, status, due_date);
create index facility_orders_asset on public.facility_work_orders (asset_id, created_at desc);
create index facility_orders_assignee_status on public.facility_work_orders (assignee_id, status) where assignee_id is not null;
create unique index facility_orders_pm_once on public.facility_work_orders (pm_plan_id, asset_id, pm_due_on) where pm_plan_id is not null;
create index facility_orders_reopened on public.facility_work_orders (reopened_from) where reopened_from is not null;
create index facility_orders_kpi on public.facility_work_orders (project_id, work_type, completed_at);
-- An asset may have several planned orders, but only one execution/review at a time.
create unique index facility_one_execution_per_asset on public.facility_work_orders (project_id, asset_id)
  where status in ('in_progress', 'review');

-- Default SLA by priority (hours); repairs from creation, planned/inspection work until the end of the due day (VN).
create function public.facility_sla_hours(p_priority text) returns integer
language sql immutable set search_path = '' as $$
  select case p_priority when 'critical' then 4 when 'high' then 24 when 'low' then 168 else 72 end
$$;
create function public.facility_default_sla(p_work_type text, p_priority text, p_created timestamptz, p_due date)
returns timestamptz language sql stable set search_path = '' as $$
  select case when p_work_type = 'sua_chua' or p_due is null
    then p_created + make_interval(hours => public.facility_sla_hours(p_priority))
    else (p_due + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' end
$$;

-- Lifecycle open → assigned → in_progress → review → completed (cancel before review), SLA, asset status and
-- next maintenance date. Runs as definer so assignees without write access update the asset through the order.
create function bim_private.facility_validate_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  asset_status text; v_cycle integer; v_source public.facility_work_orders; v_plan public.facility_pm_plans;
  vn_today date := public.facility_today(); v_assignee_changed boolean;
begin
  -- ON DELETE SET NULL of a removed auth account (FK action): only drop the assignee, even on a locked order.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    if old.assignee_id is not null and new.assignee_id is null and (to_jsonb(new) - 'assignee_id') = (to_jsonb(old) - 'assignee_id') then
      return new;
    end if;
  end if;
  select status into asset_status from public.bim_assets where asset_id = new.asset_id and project_id = new.project_id for update;
  if asset_status is null then raise exception 'Thiết bị không thuộc dự án'; end if;
  if asset_status = 'Retired' then raise exception 'Thiết bị đã ngừng sử dụng'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'open' then raise exception 'Phiếu mới phải ở trạng thái Mới tạo'; end if;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.version := 1;
    new.completed_at := null; new.completed_on := null; new.confirmed_by := null; new.started_at := null;
    if new.sla_due_at is null then
      new.sla_due_at := public.facility_default_sla(new.work_type, new.priority, new.created_at, new.due_date);
    end if;
    if new.reopened_from is not null then
      select * into v_source from public.facility_work_orders where id = new.reopened_from;
      if v_source.id is null or v_source.project_id <> new.project_id or v_source.asset_id <> new.asset_id
         or v_source.status not in ('completed', 'cancelled') then
        raise exception 'Chỉ mở lại phiếu đã kết thúc của cùng thiết bị';
      end if;
    end if;
    if new.pm_plan_id is not null then
      select * into v_plan from public.facility_pm_plans where id = new.pm_plan_id;
      if v_plan.id is null or v_plan.project_id <> new.project_id then raise exception 'Kế hoạch bảo trì không thuộc dự án'; end if;
    end if;
  else
    if new.project_id <> old.project_id or new.asset_id <> old.asset_id then
      raise exception 'Không được chuyển phiếu sang dự án/thiết bị khác';
    end if;
    if old.status in ('completed', 'cancelled') then raise exception 'Phiếu đã khóa'; end if;
    if (new.pm_plan_id, new.pm_due_on, new.reopened_from, new.created_at, new.created_by)
       is distinct from (old.pm_plan_id, old.pm_due_on, old.reopened_from, old.created_at, old.created_by) then
      raise exception 'Không được đổi nguồn phiếu';
    end if;
    if new.status <> old.status and not (
      (old.status = 'open' and new.status in ('assigned', 'cancelled')) or
      (old.status = 'assigned' and new.status in ('in_progress', 'cancelled')) or
      (old.status = 'in_progress' and new.status in ('review', 'cancelled')) or
      (old.status = 'review' and new.status in ('in_progress', 'completed'))
    ) then raise exception 'Bước xử lý phiếu không hợp lệ'; end if;
    if (new.priority, new.work_type, new.due_date) is distinct from (old.priority, old.work_type, old.due_date)
       and new.sla_due_at is not distinct from old.sla_due_at
       and old.sla_due_at is not distinct from public.facility_default_sla(old.work_type, old.priority, old.created_at, old.due_date) then
      new.sla_due_at := public.facility_default_sla(new.work_type, new.priority, new.created_at, new.due_date);
    end if;
    new.completed_at := old.completed_at;
    new.confirmed_by := old.confirmed_by;
    new.started_at := old.started_at;
    new.asset_status_before := old.asset_status_before;
    new.version := old.version + 1;
  end if;
  if new.status in ('assigned', 'in_progress', 'review', 'completed') and new.assignee_id is null then
    raise exception 'Cần người xử lý';
  end if;
  if new.assignee_id is not null then
    v_assignee_changed := tg_op = 'INSERT';
    if not v_assignee_changed then v_assignee_changed := new.assignee_id is distinct from old.assignee_id; end if;
    if v_assignee_changed then
      if not bim_private.is_project_person(new.project_id, new.assignee_id) then
        raise exception 'Người xử lý phải là thành viên dự án';
      end if;
      new.assignee_name := coalesce(nullif(btrim(new.assignee_name), ''), bim_private.facility_user_name(new.assignee_id));
    end if;
  end if;
  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now(); new.asset_status_before := asset_status;
  end if;
  if new.status in ('review', 'completed') then
    if nullif(btrim(new.result), '') is null then raise exception 'Cần kết quả bảo trì'; end if;
    if exists (select 1 from jsonb_array_elements(new.checklist) c where coalesce((c ->> 'done')::boolean, false) = false) then
      raise exception 'Chưa hoàn tất checklist';
    end if;
  end if;
  if length(btrim(coalesce(current_setting('bim.change_reason', true), ''))) < 5 then
    perform set_config('bim.change_reason', 'Cập nhật từ phiếu bảo trì ' || new.id, true);
  end if;
  if new.status = 'completed' then
    new.completed_on := coalesce(new.completed_on, vn_today);
    if new.completed_on > vn_today or new.completed_on < (new.created_at at time zone 'Asia/Ho_Chi_Minh')::date then
      raise exception 'Ngày hoàn tất không hợp lệ';
    end if;
    new.confirmed_by := auth.uid();
    new.completed_at := now();
    select p.cycle_days into v_cycle from public.facility_pm_plans p where p.id = new.pm_plan_id;
    update public.bim_assets set status = 'Active', last_maintenance = new.completed_on::text,
      next_maintenance = case when coalesce(v_cycle, maintenance_cycle_days) > 0
                              then (new.completed_on + coalesce(v_cycle, maintenance_cycle_days))::text end
     where project_id = new.project_id and asset_id = new.asset_id;
  elsif new.status = 'in_progress' then
    update public.bim_assets set status = 'Maintenance' where project_id = new.project_id and asset_id = new.asset_id;
  end if;
  -- Confirmation (replaces the cic-hud signature pad): actor, name and time are stamped by the server; client-sent
  -- signed_by/signed_at are ignored. A signature is not required to complete (as cic-hud).
  if new.signature is not null then
    v_assignee_changed := tg_op = 'INSERT';
    if not v_assignee_changed then v_assignee_changed := new.signature is distinct from old.signature; end if;
    if v_assignee_changed then
      if new.signature -> 'confirmed' = 'true'::jsonb then
        new.signature := jsonb_build_object('confirmed', true, 'signed_by', auth.uid(),
          'name', bim_private.facility_user_name(auth.uid()), 'signed_at', now());
      else
        new.signature := new.signature - 'signed_by' - 'signed_at';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status = 'in_progress' and asset_status = 'Maintenance' then
      update public.bim_assets set status = case when old.asset_status_before = 'Broken' then 'Broken' else 'Active' end
       where project_id = new.project_id and asset_id = new.asset_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger facility_order_validate before insert or update on public.facility_work_orders
  for each row execute function bim_private.facility_validate_order();

alter table public.facility_work_orders enable row level security;
create policy facility_orders_read on public.facility_work_orders for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy facility_orders_insert on public.facility_work_orders for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy facility_orders_update on public.facility_work_orders for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.facility_work_orders from anon, authenticated;
grant select, insert, update on public.facility_work_orders to authenticated;
grant all on public.facility_work_orders to service_role;

create table public.facility_work_order_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  order_id uuid not null references public.facility_work_orders(id) on delete cascade,
  actor_id uuid,
  action text not null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index facility_order_events_order on public.facility_work_order_events (order_id, id desc);
create index facility_order_events_project on public.facility_work_order_events (project_id, id desc);

-- Append-only history written by triggers (clients cannot insert fabricated events).
create function bim_private.facility_order_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and not bim_private.facility_system_context() then
    raise exception 'Cần phiên người dùng để ghi lịch sử vận hành';
  end if;
  insert into public.facility_work_order_events (project_id, order_id, actor_id, action, reason, before_data, after_data)
  values (new.project_id, new.id, auth.uid(), new.status, nullif(current_setting('bim.change_reason', true), ''),
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
create trigger facility_order_audit after insert or update on public.facility_work_orders
  for each row execute function bim_private.facility_order_audit();
create function bim_private.facility_asset_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and not bim_private.facility_system_context() then
    raise exception 'Cần phiên người dùng để ghi lịch sử vận hành';
  end if;
  insert into public.facility_asset_events (project_id, asset_id, actor_id, reason, before_data, after_data)
  values (new.project_id, new.asset_id, auth.uid(), nullif(current_setting('bim.change_reason', true), ''),
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
create trigger bim_assets_audit after insert or update on public.bim_assets
  for each row execute function bim_private.facility_asset_audit();

alter table public.facility_work_order_events enable row level security;
alter table public.facility_asset_events enable row level security;
create policy facility_order_events_read on public.facility_work_order_events for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy facility_asset_events_read on public.facility_asset_events for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.facility_work_order_events, public.facility_asset_events from anon, authenticated;
grant select on public.facility_work_order_events, public.facility_asset_events to authenticated, service_role;

-- Writers save an order (optimistic version); unknown fields are refused.
create function public.facility_save_work_order(p_id uuid, p_version integer, p_patch jsonb) returns public.facility_work_orders
language plpgsql security invoker set search_path = '' as $$
declare saved public.facility_work_orders;
begin
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('status', 'title',
       'assignee_id', 'assignee_name', 'due_date', 'result', 'cost', 'checklist', 'attachments', 'completed_on', 'priority',
       'work_type', 'sla_due_at', 'labor_hours', 'failure_code', 'downtime_minutes', 'signature')) then
    raise exception 'Trường cập nhật phiếu không hợp lệ';
  end if;
  perform set_config('bim.change_reason', 'Cập nhật từ phiếu bảo trì ' || p_id, true);
  update public.facility_work_orders set
    status = coalesce(p_patch ->> 'status', status), title = coalesce(p_patch ->> 'title', title),
    assignee_id = case when p_patch ? 'assignee_id' then (p_patch ->> 'assignee_id')::uuid else assignee_id end,
    assignee_name = case when p_patch ? 'assignee_id' and not p_patch ? 'assignee_name' then null
                         else coalesce(p_patch ->> 'assignee_name', assignee_name) end,
    due_date = coalesce((p_patch ->> 'due_date')::date, due_date), result = coalesce(p_patch ->> 'result', result),
    cost = case when p_patch ? 'cost' then (p_patch ->> 'cost')::numeric else cost end,
    checklist = coalesce(p_patch -> 'checklist', checklist), attachments = coalesce(p_patch -> 'attachments', attachments),
    completed_on = coalesce((p_patch ->> 'completed_on')::date, completed_on),
    priority = coalesce(p_patch ->> 'priority', priority), work_type = coalesce(p_patch ->> 'work_type', work_type),
    sla_due_at = case when p_patch ? 'sla_due_at' then (p_patch ->> 'sla_due_at')::timestamptz else sla_due_at end,
    labor_hours = case when p_patch ? 'labor_hours' then (p_patch ->> 'labor_hours')::numeric else labor_hours end,
    failure_code = case when p_patch ? 'failure_code' then nullif(btrim(p_patch ->> 'failure_code'), '') else failure_code end,
    downtime_minutes = case when p_patch ? 'downtime_minutes' then (p_patch ->> 'downtime_minutes')::integer else downtime_minutes end,
    signature = case when p_patch ? 'signature' then nullif(p_patch -> 'signature', 'null'::jsonb) else signature end
  where id = p_id and version = p_version returning * into saved;
  if saved.id is null then raise exception 'Phiếu đã được người khác cập nhật hoặc không có quyền. Hãy tải lại.'; end if;
  return saved;
end $$;

-- The assignee (technician, possibly without project write access) updates their own order: start, result,
-- checklist ticks, photos, labour, downtime, and send it for review. Writers may complete in the same call.
create function public.facility_assignee_save_work_order(p_id uuid, p_version integer, p_patch jsonb)
returns public.facility_work_orders language plpgsql security definer set search_path = '' as $$
declare o public.facility_work_orders; saved public.facility_work_orders; v_status text; v_writer boolean;
begin
  select * into o from public.facility_work_orders where id = p_id for update;
  if o.id is null or auth.uid() is null or o.assignee_id is distinct from auth.uid()
     or not sxd_bim_document_private.project_access(o.project_id) then
    raise exception 'Chỉ người được giao phiếu mới cập nhật được phiếu này' using errcode = '42501';
  end if;
  if o.version <> p_version then raise exception 'Phiếu đã được người khác cập nhật. Hãy tải lại.'; end if;
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('status', 'result',
       'checklist', 'attachments', 'completed_on', 'labor_hours', 'failure_code', 'downtime_minutes', 'signature')) then
    raise exception 'Trường cập nhật phiếu không hợp lệ';
  end if;
  if p_patch ? 'checklist' and (jsonb_typeof(p_patch -> 'checklist') <> 'array'
     or jsonb_array_length(p_patch -> 'checklist') <> jsonb_array_length(o.checklist)
     or exists (select 1 from jsonb_array_elements(o.checklist) with ordinality a(item, i)
                  join jsonb_array_elements(p_patch -> 'checklist') with ordinality b(item, i) using (i)
                 where a.item ->> 'label' is distinct from b.item ->> 'label')) then
    raise exception 'Người thực hiện chỉ đánh dấu checklist, không đổi nội dung';
  end if;
  if o.status not in ('assigned', 'in_progress', 'review') then raise exception 'Phiếu không ở trạng thái thực hiện'; end if;
  v_status := coalesce(p_patch ->> 'status', o.status);
  v_writer := bim_private.can_write(o.project_id);
  if v_status <> o.status and not ((o.status = 'assigned' and v_status = 'in_progress')
     or (o.status = 'in_progress' and v_status in ('review', 'completed')) or (o.status = 'review' and v_status = 'completed' and v_writer)) then
    raise exception 'Bước xử lý phiếu không hợp lệ cho người thực hiện';
  end if;
  if v_status = 'completed' and not v_writer then raise exception 'Cần người có quyền dự án xác nhận hoàn tất'; end if;
  perform set_config('bim.change_reason', 'Người thực hiện cập nhật phiếu ' || p_id, true);
  update public.facility_work_orders set
    status = case when v_status = 'completed' and o.status = 'in_progress' then 'review' else v_status end,
    result = coalesce(p_patch ->> 'result', result),
    checklist = coalesce(p_patch -> 'checklist', checklist), attachments = coalesce(p_patch -> 'attachments', attachments),
    completed_on = case when p_patch ? 'completed_on' then (p_patch ->> 'completed_on')::date else completed_on end,
    labor_hours = case when p_patch ? 'labor_hours' then (p_patch ->> 'labor_hours')::numeric else labor_hours end,
    failure_code = case when p_patch ? 'failure_code' then nullif(btrim(p_patch ->> 'failure_code'), '') else failure_code end,
    downtime_minutes = case when p_patch ? 'downtime_minutes' then (p_patch ->> 'downtime_minutes')::integer else downtime_minutes end,
    signature = case when p_patch ? 'signature' then nullif(p_patch -> 'signature', 'null'::jsonb) else signature end
  where id = p_id returning * into saved;
  if v_status = 'completed' and saved.status = 'review' then
    update public.facility_work_orders set status = 'completed' where id = p_id returning * into saved;
  end if;
  return saved;
end $$;

-- Reopen a finished order: a new order points to the old one (which stays locked).
create function public.facility_reopen_work_order(p_id uuid, p_reason text, p_due date default null)
returns public.facility_work_orders language plpgsql security definer set search_path = '' as $$
declare o public.facility_work_orders; saved public.facility_work_orders;
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Cần lý do mở lại phiếu'; end if;
  select * into o from public.facility_work_orders where id = p_id;
  if o.id is null or not bim_private.can_write(o.project_id) then raise exception 'Không có quyền mở lại phiếu' using errcode = '42501'; end if;
  perform set_config('bim.change_reason', btrim(p_reason), true);
  insert into public.facility_work_orders (project_id, asset_id, title, due_date, checklist, priority, work_type, reopened_from)
  values (o.project_id, o.asset_id, left('Làm lại: ' || regexp_replace(o.title, '^Làm lại: ', ''), 300),
          coalesce(p_due, public.facility_today() + 1),
          coalesce((select jsonb_agg(jsonb_build_object('label', c ->> 'label', 'done', false))
                      from jsonb_array_elements(o.checklist) c), '[]'),
          o.priority, o.work_type, o.id)
  returning * into saved;
  return saved;
end $$;

-- Writers change the maintenance schedule of an asset with a reason (optimistic on updated_at).
create function public.facility_change_schedule(p_id uuid, p_expected timestamptz, p_next text, p_cycle integer, p_reason text)
returns public.bim_assets language plpgsql security invoker set search_path = '' as $$
declare saved public.bim_assets;
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Cần lý do thay lịch bảo trì'; end if;
  if p_cycle is not null and p_cycle < 1 then raise exception 'Chu kỳ bảo trì phải lớn hơn 0'; end if;
  if p_next is not null then perform p_next::date; end if;
  perform set_config('bim.change_reason', btrim(p_reason), true);
  update public.bim_assets set next_maintenance = p_next, maintenance_cycle_days = p_cycle
   where asset_id = p_id and updated_at = p_expected returning * into saved;
  if saved.asset_id is null then raise exception 'Thiết bị đã thay đổi hoặc không có quyền. Hãy tải lại.'; end if;
  return saved;
end $$;

-- Writers save an asset (optimistic on updated_at, reason in the history).
create function public.facility_save_asset(p_id uuid, p_expected timestamptz, p_patch jsonb, p_reason text)
returns public.bim_assets language plpgsql security invoker set search_path = '' as $$
declare previous public.bim_assets; draft public.bim_assets; saved public.bim_assets;
begin
  select * into previous from public.bim_assets where asset_id = p_id for update;
  if previous.asset_id is null or previous.updated_at is distinct from p_expected then
    raise exception 'Thiết bị đã thay đổi hoặc không có quyền. Hãy tải lại.';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('asset_code', 'asset_name',
       'category', 'location', 'manufacturer', 'model', 'contractor', 'purchase_cost', 'warranty_provider', 'install_date',
       'warranty_expiry', 'last_maintenance', 'next_maintenance', 'maintenance_cycle_days', 'status', 'condition', 'notes',
       'bim_element_id', 'model_id', 'handover_status', 'handover_date', 'location_building', 'location_floor', 'location_room',
       'documents', 'floor_key', 'space_code', 'system_name', 'serial_number')) then
    raise exception 'Trường cập nhật không hợp lệ';
  end if;
  select * into draft from jsonb_populate_record(previous, p_patch);
  perform set_config('bim.change_reason', coalesce(nullif(btrim(p_reason), ''), 'Cập nhật thiết bị'), true);
  update public.bim_assets set asset_code = draft.asset_code, asset_name = draft.asset_name, category = draft.category,
    location = draft.location, manufacturer = draft.manufacturer, model = draft.model, contractor = draft.contractor,
    purchase_cost = draft.purchase_cost, warranty_provider = draft.warranty_provider, install_date = draft.install_date,
    warranty_expiry = draft.warranty_expiry, last_maintenance = draft.last_maintenance, next_maintenance = draft.next_maintenance,
    maintenance_cycle_days = draft.maintenance_cycle_days, status = draft.status, condition = draft.condition, notes = draft.notes,
    bim_element_id = draft.bim_element_id, model_id = draft.model_id, handover_status = draft.handover_status,
    handover_date = draft.handover_date, location_building = draft.location_building, location_floor = draft.location_floor,
    location_room = draft.location_room, documents = draft.documents, floor_key = draft.floor_key, space_code = draft.space_code,
    system_name = nullif(btrim(draft.system_name), ''), serial_number = nullif(btrim(draft.serial_number), '')
   where asset_id = p_id returning * into saved;
  if saved.asset_id is null then raise exception 'Thiết bị đã thay đổi hoặc không có quyền. Hãy tải lại.'; end if;
  return saved;
end $$;

-- ── 5. Parts used per order ─────────────────────────────────────────────────────────────────────────────────────
create table public.facility_work_order_parts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  order_id uuid not null,
  part_code text check (part_code is null or length(btrim(part_code)) between 1 and 64),
  part_name text not null check (length(btrim(part_name)) between 1 and 200),
  quantity numeric not null check (quantity > 0 and quantity <= 1000000 and quantity <> 'NaN'::numeric),
  unit text not null default 'cái' check (length(btrim(unit)) between 1 and 32),
  unit_cost numeric check (unit_cost is null or (unit_cost >= 0 and unit_cost <> 'NaN'::numeric)),
  total_cost numeric generated always as (quantity * coalesce(unit_cost, 0)) stored,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (project_id, order_id) references public.facility_work_orders(project_id, id) on delete cascade
);
create index facility_parts_order on public.facility_work_order_parts (order_id);
create index facility_parts_project on public.facility_work_order_parts (project_id, created_at);
create function bim_private.facility_guard_parts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.facility_work_orders where id = old.order_id;
    if v_status in ('completed', 'cancelled') and pg_trigger_depth() <= 1 then raise exception 'Phiếu đã khóa, không đổi vật tư'; end if;
    return old;
  end if;
  select status into v_status from public.facility_work_orders where id = new.order_id and project_id = new.project_id;
  if v_status in ('completed', 'cancelled') then raise exception 'Phiếu đã khóa, không đổi vật tư'; end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now();
  elsif (new.project_id, new.order_id, new.created_by, new.created_at) is distinct from (old.project_id, old.order_id, old.created_by, old.created_at) then
    raise exception 'Không được chuyển vật tư sang phiếu khác';
  end if;
  return new;
end $$;
create trigger facility_parts_guard before insert or update or delete on public.facility_work_order_parts
  for each row execute function bim_private.facility_guard_parts();
alter table public.facility_work_order_parts enable row level security;
create policy facility_parts_read on public.facility_work_order_parts for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
-- Writers, or the assignee of the order.
create policy facility_parts_write on public.facility_work_order_parts for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[])
         or exists (select 1 from public.facility_work_orders o where o.id = order_id and o.project_id = facility_work_order_parts.project_id
                     and o.assignee_id = (select auth.uid())))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[])
         or exists (select 1 from public.facility_work_orders o where o.id = order_id and o.project_id = facility_work_order_parts.project_id
                     and o.assignee_id = (select auth.uid())));
revoke all on public.facility_work_order_parts from anon, authenticated;
grant select, insert, update, delete on public.facility_work_order_parts to authenticated;
grant all on public.facility_work_order_parts to service_role;

-- ── 6. PM generation ────────────────────────────────────────────────────────────────────────────────────────────
-- Idempotent: one open order per plan and asset; first period at the plan start, later periods from the actual
-- completion (sliding schedule); a cancelled period is not generated again.
create function bim_private.facility_pm_generate(p_project uuid, p_today date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  plan public.facility_pm_plans; target public.bim_assets; saved public.facility_work_orders;
  v_due date; v_last date; v_created integer := 0; v_assigned integer := 0; v_errors jsonb := '[]';
begin
  perform set_config('bim.change_reason', 'Sinh phiếu bảo trì định kỳ', true);
  for plan in select * from public.facility_pm_plans where active and (p_project is null or project_id = p_project)
               order by project_id, created_at, id loop
    for target in select * from public.bim_assets a
                   where a.project_id = plan.project_id and a.status <> 'Retired'
                     and (a.asset_id = plan.asset_id or (plan.asset_id is null and a.category = plan.asset_category))
                   order by a.asset_id loop
      continue when exists (select 1 from public.facility_work_orders o where o.pm_plan_id = plan.id and o.asset_id = target.asset_id
                              and o.status not in ('completed', 'cancelled'));
      select max(o.completed_on) into v_last from public.facility_work_orders o
       where o.pm_plan_id = plan.id and o.asset_id = target.asset_id and o.status = 'completed';
      v_due := coalesce(v_last + plan.cycle_days, plan.start_on);
      while exists (select 1 from public.facility_work_orders o where o.pm_plan_id = plan.id and o.asset_id = target.asset_id
                      and o.pm_due_on = v_due) loop
        v_due := v_due + plan.cycle_days;
      end loop;
      continue when p_today < v_due - plan.lead_days;
      begin
        saved := null;
        insert into public.facility_work_orders (project_id, asset_id, title, due_date, checklist, work_type, priority,
          pm_plan_id, pm_due_on, created_by)
        values (plan.project_id, target.asset_id,
          left(plan.name || case when plan.asset_id is null then ' · ' || target.asset_name else '' end, 300), v_due,
          coalesce((select jsonb_agg(jsonb_build_object('label', c #>> '{}', 'done', false) order by i)
                      from jsonb_array_elements(plan.checklist_template) with ordinality t(c, i)), '[]'),
          'dinh_ky', plan.priority, plan.id, v_due, coalesce(auth.uid(), plan.created_by))
        on conflict (pm_plan_id, asset_id, pm_due_on) where pm_plan_id is not null do nothing
        returning * into saved;
        continue when saved.id is null;
        v_created := v_created + 1;
        if plan.default_assignee_id is not null then
          begin
            update public.facility_work_orders set assignee_id = plan.default_assignee_id, status = 'assigned' where id = saved.id;
            v_assigned := v_assigned + 1;
          exception when others then
            v_errors := v_errors || jsonb_build_object('ke_hoach', plan.id, 'thiet_bi', target.asset_id,
                                                       'loi', 'Không giao được người mặc định: ' || sqlerrm);
          end;
        end if;
      exception when others then
        v_errors := v_errors || jsonb_build_object('ke_hoach', plan.id, 'thiet_bi', target.asset_id, 'loi', sqlerrm);
      end;
    end loop;
  end loop;
  return jsonb_build_object('ngay', p_today, 'phieu_moi', v_created, 'da_giao', v_assigned, 'loi', v_errors);
end $$;

-- Writers run it now ("Sinh phiếu đến hạn").
create function public.facility_generate_pm_orders(p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not bim_private.can_write(p_project) then
    raise exception 'Không có quyền sinh phiếu bảo trì định kỳ' using errcode = '42501';
  end if;
  return bim_private.facility_pm_generate(p_project, public.facility_today());
end $$;
-- Daily job for all projects (pg_cron or a worker with the service role).
create function public.facility_run_pm_schedule() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then raise exception 'Chỉ job hệ thống chạy lịch bảo trì' using errcode = '42501'; end if;
  return bim_private.facility_pm_generate(null, public.facility_today());
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('facility-pm-daily', '0 23 * * *', 'select public.facility_run_pm_schedule()')$q$;
  end if;
end $$;

-- ── 7. Location sync and asset register from IFC / CSV ──────────────────────────────────────────────────────────
create function bim_private.facility_sync_locations_core(p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_floors integer; v_spaces integer; v_assets integer;
begin
  perform set_config('bim.change_reason', 'Đồng bộ tầng/không gian từ mô hình IFC', true);
  with src as (
    select public.facility_floor_key(e.phan_doan_tang) as k, e.phan_doan_tang as label
      from public.bim_elements e join public.bim_models m on m.id = e.model_id and m.deleted_at is null
     where e.project_id = p_project and nullif(e.phan_doan_tang, '') is not null
  ), agg as (select k, min(label) as name from src where k is not null group by k)
  insert into public.facility_floors (project_id, floor_key, building, level, name, source, updated_at)
  select p_project, k, case when k like 'basement:%' or k like 'building:%' then '' else split_part(k, ':', 1) end,
         case when k like 'basement:%' then -substring(k from '\d+$')::int else substring(k from '\d+$')::int end,
         left(name, 200), 'ifc', now()
    from agg
  on conflict (project_id, floor_key) do update set
    name = case when facility_floors.source = 'ifc' then excluded.name else facility_floors.name end,
    building = excluded.building, level = excluded.level, updated_at = now();
  get diagnostics v_floors = row_count;

  with src as (
    select coalesce(public.facility_element_attr(e.thuoc_tinh, 'ma_phong'), case when e.loai_cau_kien = 'IFCSPACE' then e.global_id::text end) as code,
           case when e.loai_cau_kien = 'IFCSPACE' then e.ten_cau_kien end as name,
           public.facility_floor_key(e.phan_doan_tang) as k
      from public.bim_elements e join public.bim_models m on m.id = e.model_id and m.deleted_at is null
     where e.project_id = p_project
  )
  insert into public.facility_spaces (project_id, space_code, floor_key, name, source, updated_at)
  select distinct on (code) p_project, code, k, left(name, 200), 'ifc', now()
    from src where code is not null and k is not null
     and exists (select 1 from public.facility_floors f where f.project_id = p_project and f.floor_key = src.k)
   order by code, name nulls last, k
  on conflict (project_id, space_code) do update set floor_key = excluded.floor_key,
    name = case when facility_spaces.source = 'ifc' then coalesce(excluded.name, facility_spaces.name) else facility_spaces.name end,
    updated_at = now();
  get diagnostics v_spaces = row_count;

  -- Floor/space/system for assets that miss them: from the linked element, then from the old text location.
  with base as (
    select a.asset_id, a.floor_key, a.space_code, a.system_name,
      coalesce((select public.facility_floor_key(e.phan_doan_tang) from public.bim_elements e
                 where e.model_id = a.model_id and e.global_id = a.bim_element_id limit 1),
               public.facility_floor_key(concat_ws(' · ', case when nullif(a.location_building, '') is not null then 'Tháp ' || a.location_building end, a.location_floor)),
               public.facility_floor_key(a.location)) as k,
      coalesce((select public.facility_element_attr(e.thuoc_tinh, 'ma_phong') from public.bim_elements e
                 where e.model_id = a.model_id and e.global_id = a.bim_element_id limit 1), nullif(a.location_room, '')) as s,
      (select left(h.ten, 200) from public.bim_he_thong h where h.model_id = a.model_id and a.bim_element_id = any (h.thanh_vien)
        order by h.ten limit 1) as sys
      from public.bim_assets a
     where a.project_id = p_project and (a.floor_key is null or a.space_code is null or a.system_name is null)
  ), resolved as (
    select b.asset_id, coalesce(b.floor_key, (select f.floor_key from public.facility_floors f where f.project_id = p_project and f.floor_key = b.k)) as nf,
           b.space_code, b.system_name, b.s, b.sys
      from base b
  ), target as (
    select r.asset_id, r.nf,
           coalesce(r.space_code, (select sp.space_code from public.facility_spaces sp where sp.project_id = p_project
                                      and sp.space_code = r.s and sp.floor_key = r.nf)) as ns,
           coalesce(r.system_name, r.sys) as nsys
      from resolved r
  )
  update public.bim_assets a set floor_key = t.nf, space_code = t.ns, system_name = t.nsys
    from target t
   where a.asset_id = t.asset_id and a.project_id = p_project
     and (t.nf is distinct from a.floor_key or t.ns is distinct from a.space_code or t.nsys is distinct from a.system_name);
  get diagnostics v_assets = row_count;
  return jsonb_build_object('tang', v_floors, 'khong_gian', v_spaces, 'tai_san', v_assets);
end $$;
create function public.facility_sync_locations(p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not bim_private.can_write(p_project) then raise exception 'Không có quyền đồng bộ vị trí' using errcode = '42501'; end if;
  return bim_private.facility_sync_locations_core(p_project);
end $$;

create function public.facility_ifc_default_classes() returns text[]
language sql immutable set search_path = '' as $$
  select array['IFCUNITARYEQUIPMENT', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCCHILLER', 'IFCTANK', 'IFCFAN', 'IFCPUMP', 'IFCBOILER',
    'IFCCOOLINGTOWER', 'IFCAIRTOAIRHEATRECOVERY', 'IFCCOMPRESSOR', 'IFCCONDENSER', 'IFCEVAPORATOR', 'IFCHEATEXCHANGER', 'IFCHUMIDIFIER',
    'IFCELECTRICGENERATOR', 'IFCTRANSFORMER', 'IFCELECTRICMOTOR', 'IFCENGINE', 'IFCSWITCHINGDEVICE', 'IFCPROTECTIVEDEVICE',
    'IFCCONTROLLER', 'IFCALARM', 'IFCSENSOR', 'IFCVALVE', 'IFCFLOWMETER', 'IFCSOLARDEVICE', 'IFCBURNER', 'IFCMEDICALDEVICE']
$$;
create function public.facility_ifc_category(p_class text, p_system text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_system, '') ~* '(pccc|chữa cháy|sprinkler|báo cháy|fire)' or p_class in ('IFCFIRESUPPRESSIONTERMINAL', 'IFCALARM') then 'PCCC'
    when p_class in ('IFCUNITARYEQUIPMENT', 'IFCCHILLER', 'IFCFAN', 'IFCCOOLINGTOWER', 'IFCAIRTOAIRHEATRECOVERY', 'IFCCOMPRESSOR', 'IFCCONDENSER',
                     'IFCEVAPORATOR', 'IFCHEATEXCHANGER', 'IFCHUMIDIFIER', 'IFCAIRTERMINAL', 'IFCBOILER', 'IFCBURNER') then 'HVAC'
    when p_class in ('IFCTANK', 'IFCPUMP', 'IFCSANITARYTERMINAL', 'IFCVALVE', 'IFCFLOWMETER') then 'Cấp thoát nước'
    when p_class in ('IFCELECTRICGENERATOR', 'IFCENGINE') then 'Máy phát điện'
    when p_class in ('IFCTRANSPORTELEMENT') then 'Thang máy'
    when p_class in ('IFCSOLARDEVICE') then 'Năng lượng'
    when p_class in ('IFCELECTRICDISTRIBUTIONBOARD', 'IFCTRANSFORMER', 'IFCELECTRICMOTOR', 'IFCSWITCHINGDEVICE', 'IFCPROTECTIVEDEVICE',
                     'IFCLIGHTFIXTURE', 'IFCCONTROLLER', 'IFCSENSOR') then 'Cơ điện'
    else 'Khác' end
$$;

-- Asset candidates from equipment elements of live models (preview, no writes, element RLS applies).
-- match: guid = asset on the same model version + GUID; guid_other_model = GUID used by an asset on another version;
-- code = suggested code already used. Only rows with a null match can be imported.
create function public.facility_ifc_asset_rows(p_project uuid, p_model uuid default null, p_classes text[] default null,
  p_guids text[] default null)
returns table (model_id uuid, model_name text, global_id text, ifc_class text, name text, type_name text, manufacturer text,
  model_label text, serial_number text, system_code text, system_name text, floor_key text, floor_label text, space_code text,
  space_name text, suggested_code text, suggested_category text, existing_asset_id uuid, existing_asset_code text, match text)
language sql stable security invoker set search_path = '' as $$
  with el as (
    select e.model_id, m.file_name, e.global_id::text as global_id, e.loai_cau_kien, e.ten_cau_kien, e.phan_doan_tang, e.thuoc_tinh
      from public.bim_elements e join public.bim_models m on m.id = e.model_id and m.deleted_at is null
     where e.project_id = p_project and (p_model is null or e.model_id = p_model)
       and upper(e.loai_cau_kien) = any (coalesce(p_classes, public.facility_ifc_default_classes()))
       and (p_guids is null or e.global_id = any (p_guids))
  ), x as (
    select el.*,
      coalesce(public.facility_element_attr(el.thuoc_tinh, 'ten_he_thong'),
        (select h.ten from public.bim_he_thong h where h.model_id = el.model_id and el.global_id = any (h.thanh_vien) order by h.ten limit 1)) as sys,
      public.facility_floor_key(el.phan_doan_tang) as fk,
      public.facility_element_attr(el.thuoc_tinh, 'ma_phong') as sp,
      coalesce(public.facility_element_attr(el.thuoc_tinh, 'ma_tai_san'),
        'TS-' || upper(left(regexp_replace(el.global_id, '[^0-9A-Za-z]', '', 'g'), 10))) as code
      from el
  )
  select x.model_id, x.file_name, x.global_id, upper(x.loai_cau_kien), coalesce(nullif(btrim(x.ten_cau_kien), ''), x.loai_cau_kien),
    coalesce(x.thuoc_tinh #>> '{kieu,ten}', x.thuoc_tinh #>> '{thong_tin,ObjectType}'),
    public.facility_element_attr(x.thuoc_tinh, 'hang_san_xuat'), public.facility_element_attr(x.thuoc_tinh, 'model_thiet_bi'),
    public.facility_element_attr(x.thuoc_tinh, 'so_serial'), public.facility_element_attr(x.thuoc_tinh, 'ma_he_thong'), x.sys,
    x.fk, nullif(x.phan_doan_tang, ''), x.sp,
    (select s.name from public.facility_spaces s where s.project_id = p_project and s.space_code = x.sp),
    x.code, public.facility_ifc_category(upper(x.loai_cau_kien), x.sys),
    coalesce(same.asset_id, other.asset_id, bycode.asset_id), coalesce(same.asset_code, other.asset_code, bycode.asset_code),
    case when same.asset_id is not null then 'guid' when other.asset_id is not null then 'guid_other_model'
         when bycode.asset_id is not null then 'code' end
  from x
  left join lateral (select a.asset_id, a.asset_code from public.bim_assets a where a.project_id = p_project and a.model_id = x.model_id
                       and a.bim_element_id = x.global_id order by a.created_at limit 1) same on true
  left join lateral (select a.asset_id, a.asset_code from public.bim_assets a where a.project_id = p_project and a.bim_element_id = x.global_id
                       and a.model_id is distinct from x.model_id limit 1) other on true
  left join lateral (select a.asset_id, a.asset_code from public.bim_assets a where a.project_id = p_project
                       and lower(btrim(a.asset_code)) = lower(btrim(x.code)) limit 1) bycode on true
  order by x.model_id, x.fk nulls last, x.loai_cau_kien, x.global_id
$$;

-- Import selected candidates. Attributes are read again on the server; nothing is duplicated (GUIDs and codes in use
-- are skipped). Items: {model_id, global_id, asset_code?, category?, cycle_days?}.
create function public.facility_import_ifc_assets(p_project uuid, p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; r record; v_inserted integer := 0; v_skipped jsonb := '[]'; v_seen text[] := '{}'; v_code text; v_model uuid;
begin
  if not bim_private.can_write(p_project) then raise exception 'Không có quyền nhập tài sản' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 2000 then
    raise exception 'Danh sách nhập phải có 1–2000 dòng';
  end if;
  perform pg_advisory_xact_lock(hashtext('facility_import:' || p_project::text));
  perform set_config('bim.change_reason', 'Nhập tài sản từ mô hình IFC', true);
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce(item ->> 'model_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_skipped := v_skipped || jsonb_build_object('global_id', item ->> 'global_id', 'ly_do', 'Mã mô hình không hợp lệ'); continue;
    end if;
    v_model := (item ->> 'model_id')::uuid;
    if v_model::text || ':' || (item ->> 'global_id') = any (v_seen) then
      v_skipped := v_skipped || jsonb_build_object('global_id', item ->> 'global_id', 'ly_do', 'Trùng trong danh sách nhập'); continue;
    end if;
    v_seen := v_seen || (v_model::text || ':' || (item ->> 'global_id'));
    select * into r from public.facility_ifc_asset_rows(p_project, v_model,
      array(select distinct upper(e.loai_cau_kien) from public.bim_elements e where e.model_id = v_model and e.global_id = item ->> 'global_id'),
      array[item ->> 'global_id']) limit 1;
    if r.global_id is null then
      v_skipped := v_skipped || jsonb_build_object('global_id', item ->> 'global_id', 'ly_do', 'Không tìm thấy cấu kiện trong mô hình'); continue;
    end if;
    if r.match in ('guid', 'guid_other_model') then
      v_skipped := v_skipped || jsonb_build_object('global_id', r.global_id, 'ly_do', 'Đã có tài sản ' || coalesce(r.existing_asset_code, r.existing_asset_id::text)); continue;
    end if;
    v_code := coalesce(nullif(btrim(item ->> 'asset_code'), ''), r.suggested_code);
    if exists (select 1 from public.bim_assets a where a.project_id = p_project and lower(btrim(a.asset_code)) = lower(v_code)) then
      v_skipped := v_skipped || jsonb_build_object('global_id', r.global_id, 'ly_do', 'Mã tài sản ' || v_code || ' đã dùng'); continue;
    end if;
    insert into public.bim_assets (project_id, asset_name, asset_code, category, manufacturer, model, bim_element_id, model_id,
      floor_key, space_code, system_name, serial_number, status, condition, maintenance_cycle_days, notes)
    values (p_project, left(r.name, 300), v_code, coalesce(nullif(item ->> 'category', ''), r.suggested_category), r.manufacturer,
      r.model_label, r.global_id, r.model_id,
      case when exists (select 1 from public.facility_floors f where f.project_id = p_project and f.floor_key = r.floor_key) then r.floor_key end,
      case when exists (select 1 from public.facility_spaces s where s.project_id = p_project and s.space_code = r.space_code
                         and s.floor_key = r.floor_key) then r.space_code end,
      left(r.system_name, 200), left(r.serial_number, 120), 'Active', 'Good', nullif(item ->> 'cycle_days', '')::integer,
      concat_ws(' · ', 'Nhập từ IFC ' || r.model_name, 'Lớp ' || r.ifc_class, case when r.type_name is not null then 'Kiểu ' || r.type_name end));
    v_inserted := v_inserted + 1;
  end loop;
  return jsonb_build_object('them_moi', v_inserted, 'bo_qua', v_skipped);
end $$;

-- Import/update the register from CSV (minimal COBie columns, key = asset code). Everything is checked first; with
-- errors or a dry run nothing is written and the errors are returned per row.
create function public.facility_import_assets_csv(p_project uuid, p_rows jsonb, p_reason text default 'Nhập sổ thiết bị từ CSV',
  p_dry_run boolean default false) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare rec jsonb; i integer := 0; v_errors jsonb := '[]'; v_new integer := 0; v_upd integer := 0; a public.bim_assets;
  v_floor text; v_space text; v_model uuid; v_status text; v_code text;
begin
  if not bim_private.can_write(p_project) then raise exception 'Không có quyền nhập sổ thiết bị' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then raise exception 'Tệp phải có 1–5000 dòng'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Cần lý do nhập'; end if;
  perform pg_advisory_xact_lock(hashtext('facility_import:' || p_project::text));
  perform set_config('bim.change_reason', btrim(p_reason), true);
  begin
    for rec in select * from jsonb_array_elements(p_rows) loop
      i := i + 1;
      begin
        v_code := nullif(btrim(rec ->> 'asset_code'), '');
        if v_code is null then raise exception 'Thiếu mã tài sản (AssetIdentifier)'; end if;
        v_floor := null; v_space := null; v_model := null;
        if nullif(btrim(rec ->> 'floor'), '') is not null then
          select f.floor_key into v_floor from public.facility_floors f where f.project_id = p_project
             and (f.floor_key = btrim(rec ->> 'floor') or lower(f.name) = lower(btrim(rec ->> 'floor'))) limit 1;
          if v_floor is null then raise exception 'Không tìm thấy tầng "%"', rec ->> 'floor'; end if;
        end if;
        if nullif(btrim(rec ->> 'space'), '') is not null then
          select s.space_code, s.floor_key into v_space, v_floor from public.facility_spaces s where s.project_id = p_project
             and (s.space_code = btrim(rec ->> 'space') or lower(s.name) = lower(btrim(rec ->> 'space')))
             and (v_floor is null or s.floor_key = v_floor) limit 1;
          if v_space is null then raise exception 'Không tìm thấy không gian "%"', rec ->> 'space'; end if;
        end if;
        if nullif(btrim(rec ->> 'guid'), '') is not null then
          select e.model_id into v_model from public.bim_elements e join public.bim_models m on m.id = e.model_id and m.deleted_at is null
           where e.project_id = p_project and e.global_id = btrim(rec ->> 'guid')
             and (nullif(btrim(rec ->> 'model_id'), '') is null or e.model_id::text = btrim(rec ->> 'model_id'))
           order by m.created_at desc limit 1;
          if v_model is null then raise exception 'GUID % không thuộc mô hình của dự án', rec ->> 'guid'; end if;
        end if;
        v_status := coalesce(nullif(rec ->> 'status', ''), 'Active');
        if v_status not in ('Active', 'Maintenance', 'Broken', 'Retired') then raise exception 'Trạng thái "%" không hợp lệ', v_status; end if;
        select * into a from public.bim_assets x where x.project_id = p_project and lower(btrim(x.asset_code)) = lower(v_code) for update;
        if a.asset_id is null then
          if nullif(btrim(rec ->> 'name'), '') is null then raise exception 'Thiếu tên thiết bị (Name)'; end if;
          if v_model is not null and exists (select 1 from public.bim_assets x where x.project_id = p_project and x.model_id = v_model
                                               and x.bim_element_id = btrim(rec ->> 'guid')) then
            raise exception 'GUID % đã gắn tài sản khác', rec ->> 'guid';
          end if;
          insert into public.bim_assets (project_id, asset_name, asset_code, category, manufacturer, model, serial_number, system_name,
            floor_key, space_code, bim_element_id, model_id, install_date, warranty_expiry, maintenance_cycle_days, next_maintenance,
            status, condition)
          values (p_project, btrim(rec ->> 'name'), v_code, nullif(btrim(rec ->> 'category'), ''), nullif(btrim(rec ->> 'manufacturer'), ''),
            nullif(btrim(rec ->> 'model'), ''), nullif(btrim(rec ->> 'serial_number'), ''), nullif(btrim(rec ->> 'system'), ''), v_floor, v_space,
            case when v_model is not null then btrim(rec ->> 'guid') end, v_model, nullif(btrim(rec ->> 'install_date'), ''),
            nullif(btrim(rec ->> 'warranty_expiry'), ''), nullif(rec ->> 'maintenance_cycle_days', '')::integer,
            nullif(btrim(rec ->> 'next_maintenance'), ''), v_status, 'Good');
          v_new := v_new + 1;
        else
          update public.bim_assets set
            asset_name = coalesce(nullif(btrim(rec ->> 'name'), ''), asset_name), category = coalesce(nullif(btrim(rec ->> 'category'), ''), category),
            manufacturer = coalesce(nullif(btrim(rec ->> 'manufacturer'), ''), manufacturer), model = coalesce(nullif(btrim(rec ->> 'model'), ''), model),
            serial_number = coalesce(nullif(btrim(rec ->> 'serial_number'), ''), serial_number),
            system_name = coalesce(nullif(btrim(rec ->> 'system'), ''), system_name),
            floor_key = coalesce(v_floor, floor_key), space_code = coalesce(v_space, space_code),
            bim_element_id = coalesce(case when v_model is not null then btrim(rec ->> 'guid') end, bim_element_id),
            model_id = coalesce(v_model, model_id),
            install_date = coalesce(nullif(btrim(rec ->> 'install_date'), ''), install_date),
            warranty_expiry = coalesce(nullif(btrim(rec ->> 'warranty_expiry'), ''), warranty_expiry),
            maintenance_cycle_days = coalesce(nullif(rec ->> 'maintenance_cycle_days', '')::integer, maintenance_cycle_days),
            next_maintenance = coalesce(nullif(btrim(rec ->> 'next_maintenance'), ''), next_maintenance),
            status = case when nullif(rec ->> 'status', '') is null then status else v_status end
          where asset_id = a.asset_id;
          v_upd := v_upd + 1;
        end if;
      exception when others then
        v_errors := v_errors || jsonb_build_object('dong', i, 'ma', rec ->> 'asset_code', 'loi', sqlerrm);
      end;
    end loop;
    if p_dry_run or jsonb_array_length(v_errors) > 0 then
      raise exception using errcode = 'P0099', message = 'facility_csv_rollback';
    end if;
  exception when sqlstate 'P0099' then
    return jsonb_build_object('da_ghi', false, 'them_moi', v_new, 'cap_nhat', v_upd, 'loi', v_errors);
  end;
  return jsonb_build_object('da_ghi', true, 'them_moi', v_new, 'cap_nhat', v_upd, 'loi', v_errors);
end $$;

-- ── 8. Handover checklist and gate ──────────────────────────────────────────────────────────────────────────────
create table public.facility_handover_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  system_name text not null check (length(btrim(system_name)) between 1 and 200),
  asset_id uuid,
  label text not null check (length(btrim(label)) between 1 and 300),
  kind text not null default 'check' check (kind in ('check', 'acceptance', 'document')),
  required boolean not null default true,
  seq integer not null default 0,
  acceptance_id uuid references public.bim_nghiem_thu(ma_nghiem_thu) on delete set null,
  document jsonb check (document is null or (jsonb_typeof(document) = 'object' and document ? 'url' and document ? 'title')),
  done boolean not null default false,
  done_by uuid,
  done_at timestamptz,
  note text check (note is null or length(note) <= 1000),
  version integer not null default 1,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, asset_id) references public.bim_assets(project_id, asset_id) on delete cascade
);
create index facility_handover_system on public.facility_handover_items (project_id, system_name, seq);
create index facility_handover_asset on public.facility_handover_items (project_id, asset_id) where asset_id is not null;
create index facility_handover_acceptance on public.facility_handover_items (acceptance_id) where acceptance_id is not null;
create function bim_private.facility_validate_handover_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_newly_done boolean;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now(); new.version := 1;
  else
    if (new.project_id, new.created_by, new.created_at) is distinct from (old.project_id, old.created_by, old.created_at) then
      raise exception 'Không được đổi dự án của mục bàn giao';
    end if;
    -- A removed acceptance record (ON DELETE SET NULL) makes the item open again.
    if old.acceptance_id is not null and new.acceptance_id is null and new.kind = 'acceptance' and new.done then new.done := false; end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  if new.acceptance_id is not null and not exists (
       select 1 from public.bim_nghiem_thu n where n.ma_nghiem_thu = new.acceptance_id and n.ma_du_an = new.project_id) then
    raise exception 'Biên bản nghiệm thu không thuộc dự án';
  end if;
  if new.done then
    if new.kind = 'acceptance' and not exists (select 1 from public.bim_nghiem_thu n where n.ma_nghiem_thu = new.acceptance_id
                                                  and n.ket_luan in ('dat', 'dat_co_dieu_kien')) then
      raise exception 'Mục "%" cần biên bản nghiệm thu đã kết luận đạt', new.label;
    end if;
    if new.kind = 'document' and new.document is null and not exists (
         select 1 from public.bim_assets a where a.project_id = new.project_id and a.asset_id = new.asset_id
            and jsonb_array_length(a.documents) > 0) then
      raise exception 'Mục "%" cần hồ sơ đính kèm', new.label;
    end if;
    v_newly_done := tg_op = 'INSERT';
    if not v_newly_done then v_newly_done := not old.done; end if;
    if v_newly_done then new.done_by := auth.uid(); new.done_at := now();
    else new.done_by := old.done_by; new.done_at := old.done_at; end if;
  else
    new.done_by := null; new.done_at := null;
  end if;
  return new;
end $$;
create trigger facility_handover_item_validate before insert or update on public.facility_handover_items
  for each row execute function bim_private.facility_validate_handover_item();
alter table public.facility_handover_items enable row level security;
create policy facility_handover_read on public.facility_handover_items for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy facility_handover_write on public.facility_handover_items for all to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.facility_handover_items from anon, authenticated;
grant select, insert, update, delete on public.facility_handover_items to authenticated;
grant all on public.facility_handover_items to service_role;

-- Gate: "handed over" only when the asset's checklist (own items + items of its system) exists and every required
-- item is done.
create function bim_private.facility_handover_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_system text := coalesce(nullif(btrim(new.system_name), ''), new.category); v_total integer; v_open integer; v_check boolean;
begin
  if new.handover_status = 'handed_over' then
    v_check := tg_op = 'INSERT';
    if not v_check then v_check := old.handover_status is distinct from 'handed_over'; end if;
    if v_check then
      select count(*), count(*) filter (where h.required and not h.done) into v_total, v_open
        from public.facility_handover_items h
       where h.project_id = new.project_id and (h.asset_id = new.asset_id or (h.asset_id is null and h.system_name = v_system));
      if v_total = 0 then raise exception 'Chưa có checklist bàn giao cho hệ thống "%"', coalesce(v_system, 'chưa phân loại'); end if;
      if v_open > 0 then raise exception 'Checklist bàn giao còn % mục bắt buộc chưa đạt', v_open; end if;
    end if;
  end if;
  return new;
end $$;
create trigger bim_assets_20_handover_gate before insert or update on public.bim_assets
  for each row execute function bim_private.facility_handover_gate();

-- ── 9. Inspection routes (QR rounds) ────────────────────────────────────────────────────────────────────────────
create table public.facility_inspection_routes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 2000),
  checklist_template jsonb not null default '[]'
    check (jsonb_typeof(checklist_template) = 'array' and jsonb_array_length(checklist_template) <= 30),
  active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id)
);
create table public.facility_inspection_route_steps (
  project_id uuid not null,
  route_id uuid not null,
  seq integer not null check (seq between 1 and 500),
  asset_id uuid not null,
  note text check (note is null or length(note) <= 500),
  primary key (route_id, seq),
  unique (route_id, asset_id),
  foreign key (project_id, route_id) references public.facility_inspection_routes(project_id, id) on delete cascade,
  foreign key (project_id, asset_id) references public.bim_assets(project_id, asset_id) on delete cascade
);
create table public.facility_inspection_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  route_id uuid not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_by uuid not null default auth.uid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (project_id, route_id) references public.facility_inspection_routes(project_id, id) on delete cascade
);
create index facility_rounds_route on public.facility_inspection_rounds (route_id, started_at desc);
create index facility_rounds_project on public.facility_inspection_rounds (project_id, completed_at);
create unique index facility_rounds_one_open on public.facility_inspection_rounds (route_id, started_by) where status = 'in_progress';
create table public.facility_inspection_scans (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  round_id uuid not null references public.facility_inspection_rounds(id) on delete cascade,
  seq integer not null,
  asset_id uuid not null,
  scanned_by uuid not null,
  scanned_at timestamptz not null default now(),
  method text not null check (method in ('qr', 'manual')),
  lat numeric check (lat is null or lat between -90 and 90),
  lng numeric check (lng is null or lng between -180 and 180),
  accuracy_m numeric check (accuracy_m is null or accuracy_m >= 0),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array'),
  result text not null check (result in ('ok', 'issue')),
  note text check (note is null or length(note) <= 1000),
  order_id uuid references public.facility_work_orders(id),
  unique (round_id, seq)
);
create index facility_scans_project on public.facility_inspection_scans (project_id, scanned_at desc);
create index facility_scans_asset on public.facility_inspection_scans (project_id, asset_id, scanned_at desc);
alter table public.facility_inspection_routes enable row level security;
alter table public.facility_inspection_route_steps enable row level security;
alter table public.facility_inspection_rounds enable row level security;
alter table public.facility_inspection_scans enable row level security;
do $$ declare t text; begin
  foreach t in array array['facility_inspection_routes', 'facility_inspection_route_steps', 'facility_inspection_rounds', 'facility_inspection_scans'] loop
    execute format('create policy %I on public.%I for select to authenticated using (project_id = any ((select bim_private.readable_projects())::uuid[]))', t || '_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['facility_inspection_routes', 'facility_inspection_route_steps'] loop
    execute format('create policy %I on public.%I for all to authenticated using (project_id = any ((select bim_private.writable_projects())::uuid[])) with check (project_id = any ((select bim_private.writable_projects())::uuid[]))', t || '_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  -- Rounds and scans are written only through the RPCs below.
  execute 'grant select on public.facility_inspection_rounds, public.facility_inspection_scans to authenticated';
end $$;
create function bim_private.facility_route_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now();
  elsif (new.project_id, new.created_by, new.created_at) is distinct from (old.project_id, old.created_by, old.created_at) then
    raise exception 'Không được đổi dự án của tuyến';
  end if;
  if exists (select 1 from jsonb_array_elements(new.checklist_template) c
              where jsonb_typeof(c) <> 'string' or length(btrim(c #>> '{}')) not between 1 and 300) then
    raise exception 'Checklist tuyến phải là danh sách việc (1–300 ký tự)';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger facility_route_guard before insert or update on public.facility_inspection_routes
  for each row execute function bim_private.facility_route_guard();

-- Start (or resume) one's own round on a route: any project person.
create function public.facility_start_inspection_round(p_route uuid) returns public.facility_inspection_rounds
language plpgsql security definer set search_path = '' as $$
declare r public.facility_inspection_routes; saved public.facility_inspection_rounds;
begin
  select * into r from public.facility_inspection_routes where id = p_route;
  if r.id is null or auth.uid() is null or not sxd_bim_document_private.project_access(r.project_id) then
    raise exception 'Không có quyền thực hiện tuyến kiểm tra' using errcode = '42501';
  end if;
  if not r.active then raise exception 'Tuyến kiểm tra đã tạm dừng'; end if;
  select * into saved from public.facility_inspection_rounds where route_id = p_route and started_by = auth.uid() and status = 'in_progress';
  if saved.id is not null then return saved; end if;
  insert into public.facility_inspection_rounds (project_id, route_id, started_by) values (r.project_id, r.id, auth.uid()) returning * into saved;
  return saved;
end $$;

-- Log one step (QR or manual, checklist, result, position/time). An issue may open a repair order. The round
-- completes itself once every step is logged.
create function public.facility_log_inspection_scan(p_round uuid, p_asset uuid, p_method text, p_checklist jsonb, p_result text,
  p_note text default null, p_lat numeric default null, p_lng numeric default null, p_accuracy numeric default null,
  p_create_order boolean default false) returns public.facility_inspection_scans
language plpgsql security definer set search_path = '' as $$
declare rd public.facility_inspection_rounds; st public.facility_inspection_route_steps; saved public.facility_inspection_scans;
  v_order uuid; v_name text;
begin
  select * into rd from public.facility_inspection_rounds where id = p_round for update;
  if rd.id is null or rd.started_by is distinct from auth.uid() or not sxd_bim_document_private.project_access(rd.project_id) then
    raise exception 'Không có quyền ghi lượt kiểm tra này' using errcode = '42501';
  end if;
  if rd.status <> 'in_progress' then raise exception 'Lượt kiểm tra đã kết thúc'; end if;
  select * into st from public.facility_inspection_route_steps where route_id = rd.route_id and asset_id = p_asset;
  if st.seq is null then raise exception 'Thiết bị không thuộc tuyến kiểm tra'; end if;
  if p_method is null or p_result is null or p_method not in ('qr', 'manual') or p_result not in ('ok', 'issue') then
    raise exception 'Phương thức hoặc kết quả không hợp lệ';
  end if;
  if jsonb_typeof(coalesce(p_checklist, '[]')) <> 'array' then raise exception 'Checklist không hợp lệ'; end if;
  if p_result = 'issue' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Cần mô tả sự cố'; end if;
  if p_result = 'issue' and p_create_order then
    select asset_name into v_name from public.bim_assets where project_id = rd.project_id and asset_id = p_asset;
    perform set_config('bim.change_reason', 'Sự cố khi kiểm tra tuyến', true);
    insert into public.facility_work_orders (project_id, asset_id, title, due_date, checklist, work_type, priority, created_by)
    values (rd.project_id, p_asset, left('Sự cố khi kiểm tra: ' || v_name, 300), public.facility_today() + 1,
      '[{"label":"Xác nhận sự cố tại thiết bị","done":false},{"label":"Khắc phục và chạy thử","done":false}]', 'sua_chua', 'high', auth.uid())
    returning id into v_order;
  end if;
  insert into public.facility_inspection_scans (project_id, round_id, seq, asset_id, scanned_by, method, lat, lng, accuracy_m, checklist,
    result, note, order_id)
  values (rd.project_id, rd.id, st.seq, p_asset, auth.uid(), p_method, p_lat, p_lng, p_accuracy, coalesce(p_checklist, '[]'), p_result,
    nullif(btrim(p_note), ''), v_order)
  on conflict (round_id, seq) do update set scanned_at = now(), method = excluded.method, lat = excluded.lat, lng = excluded.lng,
    accuracy_m = excluded.accuracy_m, checklist = excluded.checklist, result = excluded.result, note = excluded.note,
    order_id = coalesce(excluded.order_id, facility_inspection_scans.order_id)
  returning * into saved;
  if not exists (select 1 from public.facility_inspection_route_steps s where s.route_id = rd.route_id
                    and not exists (select 1 from public.facility_inspection_scans x where x.round_id = rd.id and x.seq = s.seq)) then
    update public.facility_inspection_rounds set status = 'completed', completed_at = now() where id = rd.id;
  end if;
  return saved;
end $$;

create function public.facility_close_inspection_round(p_round uuid, p_abandon boolean default false)
returns public.facility_inspection_rounds language plpgsql security definer set search_path = '' as $$
declare rd public.facility_inspection_rounds; v_ok boolean;
begin
  select * into rd from public.facility_inspection_rounds where id = p_round for update;
  if rd.id is null then raise exception 'Không có quyền kết thúc lượt kiểm tra' using errcode = '42501'; end if;
  v_ok := bim_private.can_write(rd.project_id);
  if not v_ok then v_ok := rd.started_by = auth.uid() and sxd_bim_document_private.project_access(rd.project_id); end if;
  if not coalesce(v_ok, false) then raise exception 'Không có quyền kết thúc lượt kiểm tra' using errcode = '42501'; end if;
  if rd.status <> 'in_progress' then return rd; end if;
  update public.facility_inspection_rounds set status = case when p_abandon then 'abandoned' else 'completed' end, completed_at = now()
   where id = p_round returning * into rd;
  return rd;
end $$;

-- ── 10. Fault diagnoses ─────────────────────────────────────────────────────────────────────────────────────────
-- Symptoms, evidence, cause, repair steps, parts, crew and where to go; read by the AI assistant.
create table public.facility_fault_diagnoses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  asset_id uuid not null,
  failure_code text not null check (length(btrim(failure_code)) between 1 and 64),
  ten_su_co text not null check (length(btrim(ten_su_co)) > 0),
  muc_do text not null default 'trung_binh' check (muc_do in ('thap', 'trung_binh', 'cao', 'nghiem_trong')),
  phat_hien_luc timestamptz not null default now(),
  nguon_phat_hien text,
  trieu_chung text not null,
  bang_chung jsonb not null default '[]' check (jsonb_typeof(bang_chung) = 'array'),
  nguyen_nhan_chinh text not null,
  nguyen_nhan_phu text[] not null default '{}',
  do_tin_cay numeric check (do_tin_cay is null or (do_tin_cay >= 0 and do_tin_cay <= 1)),
  cach_kiem_tra text[] not null default '{}',
  phuong_an text not null,
  cac_buoc jsonb not null default '[]' check (jsonb_typeof(cac_buoc) = 'array'),
  vat_tu jsonb not null default '[]' check (jsonb_typeof(vat_tu) = 'array'),
  vi_tri jsonb not null default '{}' check (jsonb_typeof(vi_tri) = 'object'),
  duong_tiep_can text,
  an_toan text[] not null default '{}',
  anh_huong text,
  can_ngung_he_thong boolean not null default false,
  doi_xu_ly text,
  uoc_tinh_gio numeric check (uoc_tinh_gio is null or (uoc_tinh_gio >= 0 and uoc_tinh_gio <= 10000)),
  uoc_tinh_chi_phi numeric check (uoc_tinh_chi_phi is null or uoc_tinh_chi_phi >= 0),
  uu_tien text not null default 'normal' check (uu_tien in ('low', 'normal', 'high', 'critical')),
  trang_thai text not null default 'cho_xu_ly' check (trang_thai in ('cho_xu_ly', 'dang_xu_ly', 'da_xu_ly', 'huy')),
  work_order_id uuid references public.facility_work_orders(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, asset_id) references public.bim_assets(project_id, asset_id) on delete cascade
);
create index facility_fault_diagnoses_asset on public.facility_fault_diagnoses (project_id, asset_id);
create index facility_fault_diagnoses_open on public.facility_fault_diagnoses (project_id) where trang_thai in ('cho_xu_ly', 'dang_xu_ly');
create function bim_private.facility_fault_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by); new.created_at := now();
  else
    new.project_id := old.project_id; new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  if new.work_order_id is not null and not exists (select 1 from public.facility_work_orders o where o.id = new.work_order_id
                                                      and o.project_id = new.project_id and o.asset_id = new.asset_id) then
    raise exception 'Phiếu bảo trì không thuộc thiết bị';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger facility_fault_stamp before insert or update on public.facility_fault_diagnoses
  for each row execute function bim_private.facility_fault_stamp();
alter table public.facility_fault_diagnoses enable row level security;
create policy facility_fault_read on public.facility_fault_diagnoses for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
create policy facility_fault_insert on public.facility_fault_diagnoses for insert to authenticated
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
create policy facility_fault_update on public.facility_fault_diagnoses for update to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]))
  with check (project_id = any ((select bim_private.writable_projects())::uuid[]));
revoke all on public.facility_fault_diagnoses from anon, authenticated;
grant select, insert, update on public.facility_fault_diagnoses to authenticated;
grant all on public.facility_fault_diagnoses to service_role;
comment on table public.facility_fault_diagnoses is
  'Chẩn đoán hỏng hóc thiết bị: triệu chứng, bằng chứng, nguyên nhân, phương án sửa, vật tư, vị trí và đường tiếp cận.';

-- ── 11. Operations KPIs (security_invoker views: order/asset RLS applies) ───────────────────────────────────────
-- Completion time: completed_at; orders without it count at 17:00 of the completion day (VN).
create view public.facility_work_order_facts with (security_invoker = true) as
select w.id, w.project_id, w.asset_id, w.status, w.work_type, w.priority, w.due_date, w.completed_on,
  w.created_at, w.started_at, w.updated_at, w.sla_due_at, w.downtime_minutes, w.labor_hours, w.cost, w.pm_plan_id,
  case when w.status = 'completed' then coalesce(w.completed_at, (w.completed_on::timestamp + interval '17 hours') at time zone 'Asia/Ho_Chi_Minh') end as done_at,
  (select coalesce(sum(p.total_cost), 0) from public.facility_work_order_parts p where p.order_id = w.id) as parts_cost
from public.facility_work_orders w;

create view public.facility_kpi_monthly with (security_invoker = true) as
with months as (
  select f.project_id,
    generate_series(date_trunc('month', min(f.created_at at time zone 'Asia/Ho_Chi_Minh')),
                    date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh'), interval '1 month')::date as month
  from public.facility_work_order_facts f group by f.project_id
), bounds as (
  select m.*, m.month::timestamp at time zone 'Asia/Ho_Chi_Minh' as ms,
    (m.month + interval '1 month')::timestamp at time zone 'Asia/Ho_Chi_Minh' as me,
    (m.month + interval '1 month')::date as next_month,
    extract(epoch from (least((m.month + interval '1 month')::timestamp at time zone 'Asia/Ho_Chi_Minh', now())
                        - (m.month::timestamp at time zone 'Asia/Ho_Chi_Minh'))) / 3600 as period_hours
  from months m
), assets as (
  select a.project_id, count(*) filter (where a.status is distinct from 'Retired') as n from public.bim_assets a group by a.project_id
), agg as (
  select b.project_id, b.month, b.period_hours,
    count(f.id) filter (where f.created_at >= b.ms and f.created_at < b.me) as created,
    count(f.id) filter (where f.done_at >= b.ms and f.done_at < b.me) as completed,
    count(f.id) filter (where f.work_type = 'sua_chua' and f.created_at >= b.ms and f.created_at < b.me) as failures,
    avg(extract(epoch from f.done_at - f.created_at) / 3600) filter (where f.work_type = 'sua_chua' and f.done_at >= b.ms and f.done_at < b.me) as mttr_hours,
    coalesce(sum(f.downtime_minutes) filter (where f.work_type = 'sua_chua' and f.done_at >= b.ms and f.done_at < b.me), 0) / 60.0 as downtime_hours,
    count(f.id) filter (where f.created_at < b.me and not (f.done_at is not null and f.done_at < b.me)
                         and not (f.status = 'cancelled' and f.updated_at < b.me)) as backlog,
    count(f.id) filter (where f.work_type = 'dinh_ky' and f.due_date >= b.month and f.due_date < b.next_month and f.status <> 'cancelled') as pm_due,
    count(f.id) filter (where f.work_type = 'dinh_ky' and f.due_date >= b.month and f.due_date < b.next_month and f.status = 'completed'
                         and f.completed_on <= f.due_date) as pm_on_time,
    count(f.id) filter (where f.done_at >= b.ms and f.done_at < b.me and f.completed_on <= f.due_date) as on_time,
    count(f.id) filter (where f.done_at >= b.ms and f.done_at < b.me and f.sla_due_at is not null) as sla_total,
    count(f.id) filter (where f.done_at >= b.ms and f.done_at < b.me and f.sla_due_at is not null and f.done_at <= f.sla_due_at) as sla_met,
    coalesce(sum(coalesce(f.cost, 0) + f.parts_cost) filter (where f.done_at >= b.ms and f.done_at < b.me), 0) as cost_total,
    coalesce(sum(f.labor_hours) filter (where f.done_at >= b.ms and f.done_at < b.me), 0) as labor_hours
  from bounds b left join public.facility_work_order_facts f on f.project_id = b.project_id
  group by b.project_id, b.month, b.period_hours
)
select g.project_id, g.month, g.created, g.completed, g.failures,
  round(g.mttr_hours::numeric, 1) as mttr_hours,
  case when g.failures > 0 then round(((coalesce(a.n, 0) * g.period_hours - g.downtime_hours) / g.failures)::numeric, 0) end as mtbf_hours,
  round(g.downtime_hours::numeric, 1) as downtime_hours,
  g.backlog, g.pm_due, g.pm_on_time,
  case when g.pm_due > 0 then round(100.0 * g.pm_on_time / g.pm_due, 1) end as pm_compliance_pct,
  g.on_time, case when g.completed > 0 then round(100.0 * g.on_time / g.completed, 1) end as on_time_pct,
  g.sla_total, g.sla_met, case when g.sla_total > 0 then round(100.0 * g.sla_met / g.sla_total, 1) end as sla_met_pct,
  g.cost_total, g.labor_hours, coalesce(a.n, 0) as asset_count
from agg g left join assets a on a.project_id = g.project_id;
revoke all on public.facility_work_order_facts, public.facility_kpi_monthly from public, anon;
grant select on public.facility_work_order_facts, public.facility_kpi_monthly to authenticated, service_role;

-- Operations summary for a period (client, reports), under the caller's RLS. IoT alert counts are read when the IoT
-- migration is installed.
create function public.facility_ops_summary(p_project uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare r jsonb; v_new bigint := 0; v_open bigint := 0;
begin
  if p_project is null or not (p_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền xem dự án.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'phieu_moi', count(*) filter (where f.created_at >= p_from and f.created_at < p_to),
    'hoan_tat', count(*) filter (where f.done_at >= p_from and f.done_at < p_to),
    'hoan_tat_dung_han', count(*) filter (where f.done_at >= p_from and f.done_at < p_to and f.completed_on <= f.due_date),
    'ton_dong', count(*) filter (where f.status not in ('completed', 'cancelled')),
    'qua_han', count(*) filter (where f.status not in ('completed', 'cancelled') and f.due_date < public.facility_today()),
    'pm_den_han', count(*) filter (where f.work_type = 'dinh_ky' and f.status <> 'cancelled'
      and f.due_date >= (p_from at time zone 'Asia/Ho_Chi_Minh')::date and f.due_date < (p_to at time zone 'Asia/Ho_Chi_Minh')::date),
    'pm_dung_han', count(*) filter (where f.work_type = 'dinh_ky' and f.status = 'completed' and f.completed_on <= f.due_date
      and f.due_date >= (p_from at time zone 'Asia/Ho_Chi_Minh')::date and f.due_date < (p_to at time zone 'Asia/Ho_Chi_Minh')::date),
    'mttr_gio', round((avg(extract(epoch from f.done_at - f.created_at) / 3600)
      filter (where f.work_type = 'sua_chua' and f.done_at >= p_from and f.done_at < p_to))::numeric, 1),
    'chi_phi', coalesce(sum(coalesce(f.cost, 0) + f.parts_cost) filter (where f.done_at >= p_from and f.done_at < p_to), 0),
    'luot_kiem_tra', (select count(*) from public.facility_inspection_rounds r where r.project_id = p_project and r.status = 'completed'
                        and r.completed_at >= p_from and r.completed_at < p_to),
    'su_co_kiem_tra', (select count(*) from public.facility_inspection_scans s where s.project_id = p_project and s.result = 'issue'
                         and s.scanned_at >= p_from and s.scanned_at < p_to))
    into r
    from public.facility_work_order_facts f where f.project_id = p_project;
  if to_regclass('public.bim_iot_alerts') is not null then
    execute 'select count(*) filter (where opened_at >= $2 and opened_at < $3), count(*) filter (where status in (''open'', ''acknowledged''))
               from public.bim_iot_alerts where project_id = $1'
      into v_new, v_open using p_project, p_from, p_to;
  end if;
  return r || jsonb_build_object('canh_bao_moi', v_new, 'canh_bao_dang_mo', v_open);
end $$;

-- Account names for histories: project persons, or accounts that left events in the project; for project readers.
create function public.facility_actor_names(p_project uuid, p_ids uuid[]) returns table (id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not sxd_bim_document_private.project_access(p_project) then return; end if;
  return query execute format($q$
    select u.id, coalesce(nullif(split_part(u.email::text, '@', 1), ''), 'Tài khoản')::text
      from auth.users u
     where u.id = any ($2[1:500])
       and (bim_private.is_project_person($1, u.id)
         or exists (select 1 from public.facility_work_order_events x where x.project_id = $1 and x.actor_id = u.id)
         or exists (select 1 from public.facility_asset_events x where x.project_id = $1 and x.actor_id = u.id) %s)$q$,
    case when to_regclass('public.bim_iot_alert_events') is not null
         then 'or exists (select 1 from public.bim_iot_alert_events x where x.project_id = $1 and x.actor_id = u.id)' else '' end)
    using p_project, p_ids;
end $$;

-- ── 12. Phụ lục VII tags on CDE containers ──────────────────────────────────────────────────────────────────────
-- Item of Phụ lục VII NĐ 207/2026 a Published file stands for (e.g. 'III.6'), used by the handover package.
alter table public.document_cde_containers add column muc_phu_luc_vii text
  check (muc_phu_luc_vii is null or muc_phu_luc_vii ~ '^(I|II|III)\.[0-9]{1,2}[a-zđ]?$');
create index document_cde_containers_phu_luc on public.document_cde_containers (project_id, muc_phu_luc_vii)
  where muc_phu_luc_vii is not null;
create function public.document_cde_set_muc_phu_luc(p_container uuid, p_muc text) returns public.document_cde_containers
language plpgsql security definer set search_path = '' as $$
declare c public.document_cde_containers; v_muc text := nullif(btrim(p_muc), ''); v_old text;
begin
  select * into c from public.document_cde_containers where id = p_container and deleted_at is null for update;
  if not found then raise exception 'Không tìm thấy tệp CDE.'; end if;
  perform sxd_bim_document_private.cde_require_write(c.project_id);
  if v_muc is not null and v_muc !~ '^(I|II|III)\.[0-9]{1,2}[a-zđ]?$' then
    raise exception 'Mục Phụ lục VII không hợp lệ (ví dụ III.6, II.3a).' using errcode = '23514';
  end if;
  v_old := c.muc_phu_luc_vii;
  if v_old is not distinct from v_muc then return c; end if;
  update public.document_cde_containers set muc_phu_luc_vii = v_muc where id = c.id returning * into c;
  perform sxd_bim_document_private.cde_write(c.project_id, c.id, null, 'gan_muc_phu_luc', c.vung, c.vung,
    jsonb_build_object('tu', v_old, 'den', v_muc));
  return c;
end $$;

-- ── 13. Handover package ────────────────────────────────────────────────────────────────────────────────────────
-- The browser builds the ZIP (Excel index + Word report), stores it in bim-models/ban-giao/{project}/ and registers
-- its SHA-256 here. Packages are never changed or removed: a new package supersedes the previous one.
create table public.bim_goi_ban_giao (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  ten text not null check (length(btrim(ten)) between 1 and 200),
  duong_dan text check (duong_dan is null or length(duong_dan) <= 500),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  kich_thuoc bigint not null check (kich_thuoc > 0),
  so_muc integer not null default 0,
  so_du integer not null default 0 check (so_du >= 0),
  so_thieu integer not null default 0 check (so_thieu >= 0),
  muc_luc jsonb not null default '[]' check (jsonb_typeof(muc_luc) = 'array'),
  nguoi_uid uuid,
  created_at timestamptz not null default now()
);
create index bim_goi_ban_giao_project on public.bim_goi_ban_giao (project_id, created_at desc);
alter table public.bim_goi_ban_giao enable row level security;
create policy bim_goi_ban_giao_read on public.bim_goi_ban_giao for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_goi_ban_giao from public, anon, authenticated;
grant select on public.bim_goi_ban_giao to authenticated;

create function public.bim_goi_ban_giao_ghi(p_project uuid, p_ten text, p_duong_dan text, p_sha256 text, p_kich_thuoc bigint,
  p_muc_luc jsonb, p_so_du integer, p_so_thieu integer) returns public.bim_goi_ban_giao
language plpgsql security definer set search_path = '' as $$
declare r public.bim_goi_ban_giao; v_path text := nullif(btrim(p_duong_dan), '');
begin
  if auth.uid() is null or not bim_private.can_write(p_project) then
    raise exception 'Không có quyền lập gói bàn giao.' using errcode = '42501';
  end if;
  if v_path is not null then
    if v_path not like 'ban-giao/' || p_project::text || '/%' then raise exception 'Tệp gói phải nằm trong ban-giao/<dự án>/.'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'bim-models' and o.name = v_path) then
      raise exception 'Không tìm thấy tệp gói bàn giao đã tải lên.';
    end if;
  end if;
  if jsonb_typeof(coalesce(p_muc_luc, '[]')) <> 'array' then raise exception 'Mục lục phải là mảng.'; end if;
  insert into public.bim_goi_ban_giao (project_id, ten, duong_dan, sha256, kich_thuoc, so_muc, so_du, so_thieu, muc_luc, nguoi_uid)
  values (p_project, btrim(p_ten), v_path, lower(p_sha256), p_kich_thuoc, jsonb_array_length(coalesce(p_muc_luc, '[]')),
          coalesce(p_so_du, 0), coalesce(p_so_thieu, 0), coalesce(p_muc_luc, '[]'), auth.uid())
  returning * into r;
  return r;
end $$;

-- Data for the package, under the RLS of each source table (security invoker).
create function public.bim_goi_ban_giao_du_lieu(p_project uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v jsonb;
begin
  if p_project is null or not (p_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền xem dự án.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'du_an', (select jsonb_build_object('id', p.id, 'ten', p.name, 'tao_luc', p.created_at,
                 'to_chuc', (select o.name from public.sxd_bim_project_profiles a join public.sxd_bim_organizations o on o.id = a.organization_id
                              where a.project_id = p.id),
                 'giai_doan_bim', (select s.giai_doan_bim from public.document_cde_settings s where s.project_id = p.id))
                from public.sxd_bim_projects p where p.id = p_project),
    'nghiem_thu', (select coalesce(jsonb_agg(jsonb_build_object('id', n.ma_nghiem_thu, 'cap', n.cap_nghiem_thu, 'ten', n.ten_nghiem_thu,
                      'ngay', n.ngay_nghiem_thu, 'ket_luan', n.ket_luan, 'trang_thai', n.trang_thai, 'bim_guid', n.bim_guid,
                      'model_id', n.bim_model_id, 'ma_hang_muc', n.ma_hang_muc, 'tao_luc', n.tao_luc) order by n.ngay_nghiem_thu nulls last, n.tao_luc), '[]')
                     from public.bim_nghiem_thu n where n.ma_du_an = p_project),
    'ban_giao', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'he_thong', h.system_name, 'tai_san', h.asset_id, 'muc', h.label,
                    'loai', h.kind, 'bat_buoc', h.required, 'xong', h.done, 'ngay', h.done_at, 'nghiem_thu', h.acceptance_id,
                    'tai_lieu', h.document, 'ghi_chu', h.note) order by h.system_name, h.seq, h.created_at), '[]')
                   from public.facility_handover_items h where h.project_id = p_project),
    'tai_san', (select coalesce(jsonb_agg(jsonb_build_object('id', a.asset_id, 'ma', a.asset_code, 'ten', a.asset_name, 'nhom', a.category,
                   'he_thong', a.system_name, 'hang', a.manufacturer, 'model', a.model, 'serial', a.serial_number,
                   'lap_dat', a.install_date, 'bao_hanh', a.warranty_expiry, 'nha_cung_cap_bao_hanh', a.warranty_provider,
                   'tang', a.location_floor, 'phong', coalesce(a.space_code, a.location_room), 'guid', a.bim_element_id,
                   'model_id', a.model_id, 'chu_ky_bt', a.maintenance_cycle_days, 'trang_thai', a.status, 'ban_giao', a.handover_status,
                   'ngay_ban_giao', a.handover_date, 'co_tai_lieu', jsonb_array_length(a.documents) > 0) order by a.asset_code, a.asset_name), '[]')
                  from public.bim_assets a where a.project_id = p_project),
    'mo_hinh', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'tep', b.file_name, 'bo_mon', b.discipline, 'phien_ban', b.phien_ban,
                   'cau_kien', b.element_count, 'ghi_chu', b.ghi_chu_phien_ban, 'vung_cde', b.trang_thai_cde) order by b.discipline, b.file_name), '[]')
                  from public.bim_models b where b.project_id = p_project and b.status = 'ready' and b.deleted_at is null
                   and not exists (select 1 from public.bim_models n where n.model_goc_id = b.id and n.deleted_at is null)),
    'lod', (select coalesce(jsonb_agg(l order by l ->> 'model_id'), '[]') from (
              select distinct on (d.model_id) jsonb_build_object('model_id', d.model_id, 'muc', d.muc_lod, 'dat', d.dat, 'tieu_chi', d.tieu_chi,
                     'cau_kien', d.so_cau_kien, 'trong_pham_vi', d.so_trong_pham_vi, 'ngoai_pham_vi', d.so_ngoai_pham_vi, 'ngay', d.created_at) l
                from public.bim_lod_danh_gia d where d.project_id = p_project order by d.model_id, d.created_at desc) t),
    'ifc', (select coalesce(jsonb_agg(l order by l ->> 'model_id'), '[]') from (
              select distinct on (x.model_id) jsonb_build_object('model_id', x.model_id, 'giai_doan', x.giai_doan, 'diem', x.diem_tong,
                     'toi_thieu', x.diem_toi_thieu, 'dat', x.dat, 'ly_do', to_jsonb(x.ly_do_khong_dat), 'ngay', x.created_at) l
                from public.bim_ifc_xac_minh x where x.project_id = p_project order by x.model_id, x.created_at desc) t),
    'van_de', jsonb_build_object(
      'theo_trang_thai', coalesce((select jsonb_object_agg(s.status, s.n) from (select i.status, count(*) n from public.bim_issues i
                                     where i.project_id = p_project group by i.status) s), '{}'),
      'da_dong', coalesce((select jsonb_agg(jsonb_build_object('so', i.so_hieu, 'ten', i.title, 'loai', i.loai_ho_so, 'dong_luc', i.resolved_at)
                             order by i.resolved_at) from public.bim_issues i where i.project_id = p_project and i.status in ('resolved', 'closed')), '[]')),
    'va_cham', coalesce((select jsonb_object_agg(s.trang_thai, s.n) from (select c.trang_thai, count(*) n from public.bim_va_cham c
                           where c.project_id = p_project group by c.trang_thai) s), '{}'),
    'hien_truong', jsonb_build_object(
      'phieu_da_ky', (select count(*) from public.bim_checklist_phieu c where c.project_id = p_project and c.trang_thai = 'da_ky'),
      'sai_lech', (select count(*) from public.bim_checklist_phieu c where c.project_id = p_project and c.trang_thai = 'da_ky' and c.ket_luan = 'sai_lech'),
      'xac_minh', (select count(*) from public.bim_xac_minh_hien_truong x where x.project_id = p_project)),
    'cde', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'ma', c.ma_tep, 'ten', c.tieu_de, 'loai', c.loai, 'vung', c.vung,
               'ma_phu_hop', c.ma_phu_hop, 'sua_doi', c.ma_sua_doi, 'bo_mon', c.bo_mon, 'muc', c.muc_phu_luc_vii,
               'document_id', c.document_id, 'model_id', c.model_id, 'cap_nhat', c.updated_at) order by c.muc_phu_luc_vii nulls last, c.loai, c.ma_tep), '[]')
              from public.document_cde_containers c where c.project_id = p_project and c.deleted_at is null and c.vung in ('published', 'archived')),
    'phat_sinh', public.bim_phat_sinh_tong_hop(p_project),
    'lap_luc', now())
    into v;
  return v;
end $$;

-- ── 14. Storage ─────────────────────────────────────────────────────────────────────────────────────────────────
--   bim-facility-documents/{project}/{asset}/…            asset documents (writers)
--   bim-facility-documents/{project}/{asset}/wo-{order}/… completion photos of the assignee
--   bim-models/ban-giao/{project}/…                       handover packages (ZIP)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bim-facility-documents', 'bim-facility-documents', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create policy bim_facility_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'bim-facility-documents' and (storage.foldername(name))[1] = any ((select bim_private.readable_project_texts())::text[]));
create policy bim_facility_documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bim-facility-documents' and (storage.foldername(name))[1] = any ((select bim_private.writable_project_texts())::text[]));
create policy bim_facility_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bim-facility-documents' and (storage.foldername(name))[1] = any ((select bim_private.writable_project_texts())::text[]));
create policy bim_facility_order_assignee_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bim-facility-documents' and exists (
    select 1 from public.facility_work_orders o
     where o.project_id::text = (storage.foldername(name))[1] and o.asset_id::text = (storage.foldername(name))[2]
       and 'wo-' || o.id::text = (storage.foldername(name))[3]
       and o.assignee_id = (select auth.uid()) and o.status in ('assigned', 'in_progress')));
create policy bim_handover_package_read on storage.objects for select to authenticated
  using (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'ban-giao'
         and (storage.foldername(name))[2] = any ((select bim_private.readable_project_texts())::text[]));
create policy bim_handover_package_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'bim-models' and (storage.foldername(name))[1] = 'ban-giao'
              and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[]));

-- ── 15. Realtime (optional) ─────────────────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['facility_work_orders', 'bim_assets'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ── 16. Asset data in LOD 500 and the MEP trace (functions of phases B4/B6, same signatures and result shapes) ───
-- LOD 500 gains cic-hud's fifth criterion "tai_san": equipment elements in scope whose asset (same model version and
-- GUID) has manufacturer, model, serial number, install date and warranty expiry. No equipment counts as 100 %.
create or replace function public.bim_lod500_danh_gia(p_model uuid) returns public.bim_lod_danh_gia
language plpgsql security definer set search_path = '' as $$
declare
  m public.bim_models; c record; v_criteria jsonb; v_pass boolean; v_result public.bim_lod_danh_gia; v_samples jsonb;
  t_geom numeric; t_verified numeric; t_tolerance numeric; t_record numeric; t_asset numeric; v_complete numeric;
  non_physical constant text[] := array['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCVIRTUALELEMENT'];
  equipment constant text[] := array['IFCCHILLER', 'IFCTANK', 'IFCUNITARYEQUIPMENT', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCPUMP', 'IFCFAN',
    'IFCBOILER', 'IFCCOOLINGTOWER', 'IFCTRANSFORMER', 'IFCELECTRICGENERATOR', 'IFCAIRTOAIRHEATRECOVERY', 'IFCCOMPRESSOR',
    'IFCTRANSPORTELEMENT', 'IFCEVAPORATIVECOOLER', 'IFCHEATEXCHANGER'];
  -- Elements counted by piece (terminals, equipment, doors, valves…): the count is their quantity.
  by_piece constant text := '(TERMINAL|FIXTURE|DOOR|WINDOW|VALVE|BOARD|EQUIPMENT|CHILLER|TANK|PUMP|FAN|BOILER|SENSOR|ALARM|OUTLET|SWITCHINGDEVICE|APPLIANCE|FURNISHING|DAMPER|CONTROLLER|TRANSFORMER|GENERATOR|COOLINGTOWER|COMPRESSOR|TRANSPORTELEMENT)';
begin
  select * into m from public.bim_models where id = p_model and deleted_at is null;
  if not found or not sxd_bim_document_private.project_access(m.project_id) then raise exception 'Không tìm thấy mô hình.'; end if;
  if m.status <> 'ready' then raise exception 'Mô hình chưa chuyển đổi xong.'; end if;
  select count(*)::numeric tong,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and coalesce(x.ket_qua, '') <> 'ngoai_pham_vi')::numeric pham_vi,
         count(*) filter (where x.ket_qua = 'ngoai_pham_vi')::numeric ngoai,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and coalesce(x.ket_qua, '') <> 'ngoai_pham_vi'
                            and (coalesce(e.the_tich_be_tong, e.dien_tich, e.chieu_dai, e.trong_luong) is not null
                                 or upper(e.loai_cau_kien) ~ by_piece))::numeric co_kl,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and x.ket_qua = 'dat')::numeric da_dat,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and x.ket_qua = 'sai_lech')::numeric sai_lech,
         count(*) filter (where upper(e.loai_cau_kien) <> all (non_physical) and x.ket_qua in ('dat', 'sai_lech')
                            and length(btrim(coalesce(x.bien_ban, ''))) > 0)::numeric co_bien_ban,
         count(*) filter (where upper(e.loai_cau_kien) = any (equipment) and coalesce(x.ket_qua, '') <> 'ngoai_pham_vi')::numeric so_thiet_bi
    into c
    from public.bim_elements e
    left join public.bim_xac_minh_hien_truong x on x.model_id = e.model_id and x.global_id = e.global_id
   where e.model_id = p_model;
  if c.tong = 0 then raise exception 'Mô hình không có cấu kiện trong CSDL.'; end if;
  select count(*)::numeric into v_complete
    from public.bim_elements e
    left join public.bim_xac_minh_hien_truong x on x.model_id = e.model_id and x.global_id = e.global_id
   where e.model_id = p_model and upper(e.loai_cau_kien) = any (equipment) and coalesce(x.ket_qua, '') <> 'ngoai_pham_vi'
     and exists (select 1 from public.bim_assets a
                  where a.project_id = m.project_id and a.model_id = e.model_id and a.bim_element_id = e.global_id
                    and length(btrim(coalesce(a.manufacturer, ''))) > 0 and length(btrim(coalesce(a.model, ''))) > 0
                    and length(btrim(coalesce(a.serial_number, ''))) > 0
                    and a.install_on is not null and a.warranty_expiry_on is not null);
  t_geom := case when c.pham_vi = 0 then null else round(c.co_kl / c.pham_vi * 100, 1) end;
  t_verified := case when c.pham_vi = 0 then null else round(c.da_dat / c.pham_vi * 100, 1) end;
  t_tolerance := case when c.da_dat + c.sai_lech = 0 then null else round(c.da_dat / (c.da_dat + c.sai_lech) * 100, 1) end;
  t_record := case when c.da_dat + c.sai_lech = 0 then null else round(c.co_bien_ban / (c.da_dat + c.sai_lech) * 100, 1) end;
  t_asset := case when c.so_thiet_bi = 0 then 100 else round(v_complete / c.so_thiet_bi * 100, 1) end;
  select coalesce(jsonb_agg(g), '[]') into v_samples from (
    select e.global_id g from public.bim_elements e
      left join public.bim_xac_minh_hien_truong x on x.model_id = e.model_id and x.global_id = e.global_id
     where e.model_id = p_model and upper(e.loai_cau_kien) <> all (non_physical) and x.id is null
     order by e.express_id limit 10) s;
  v_criteria := jsonb_build_array(
    jsonb_build_object('ma', 'hinh_hoc', 'ten', 'Hình học và khối lượng', 'ty_le', t_geom, 'nguong', 95,
      'mo_ta', 'Cấu kiện trong phạm vi có đại lượng (thể tích, diện tích, chiều dài, trọng lượng; thiết bị và đầu cuối tính theo cái).'),
    jsonb_build_object('ma', 'xac_minh', 'ten', 'Xác minh hiện trường', 'ty_le', t_verified, 'nguong', 95,
      'mo_ta', 'Cấu kiện trong phạm vi có phiếu xác minh kết quả đạt.', 'guid_chua_xac_minh', v_samples),
    jsonb_build_object('ma', 'dung_sai', 'ten', 'Dung sai', 'ty_le', t_tolerance, 'nguong', 100,
      'mo_ta', 'Không còn phiếu sai lệch vượt dung sai chưa xử lý.', 'so_sai_lech', c.sai_lech),
    jsonb_build_object('ma', 'bien_ban', 'ten', 'Biên bản / hồ sơ hoàn công', 'ty_le', t_record, 'nguong', 100,
      'mo_ta', 'Phiếu xác minh có số biên bản nghiệm thu hoặc hồ sơ hoàn công.'),
    jsonb_build_object('ma', 'tai_san', 'ten', 'Thông tin tài sản thiết bị', 'ty_le', t_asset, 'nguong', 90,
      'mo_ta', 'Thiết bị có hồ sơ tài sản đủ hãng, model, số serial, ngày lắp, hạn bảo hành.', 'so_thiet_bi', c.so_thiet_bi));
  select bool_and((t ->> 'ty_le') is not null and (t ->> 'ty_le')::numeric >= (t ->> 'nguong')::numeric)
    into v_pass from jsonb_array_elements(v_criteria) t;
  insert into public.bim_lod_danh_gia (model_id, project_id, dat, tieu_chi, so_cau_kien, so_trong_pham_vi, so_ngoai_pham_vi, nguoi_uid)
  values (p_model, m.project_id, coalesce(v_pass, false), v_criteria, c.tong::integer, c.pham_vi::integer, c.ngoai::integer, auth.uid())
  returning * into v_result;
  return v_result;
end $$;

-- MEP trace: anh_huong.tai_san lists the assets on the traced elements (the root and everything downstream, same model
-- version) with their open work orders; every other key is unchanged from phase B6.
create or replace function public.bim_truy_vet(p_model uuid, p_guid text, p_max_cap int default 200) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_project uuid; v jsonb; v_cap integer := least(greatest(coalesce(p_max_cap, 200), 1), 500);
begin
  select project_id into v_project from public.bim_models where id = p_model;
  if v_project is null or not (v_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền xem mô hình.' using errcode = '42501';
  end if;
  with recursive
  ha(guid, cap) as (
    select k.den_guid, 1 from public.bim_ket_noi k where k.model_id = p_model and k.tu_guid = p_guid and k.chieu = 'xuoi'
    union
    select k.den_guid, h.cap + 1 from ha h
      join public.bim_ket_noi k on k.model_id = p_model and k.tu_guid = h.guid and k.chieu = 'xuoi'
     where h.cap < v_cap
  ),
  thuong(guid, cap) as (
    select k.tu_guid, 1 from public.bim_ket_noi k where k.model_id = p_model and k.den_guid = p_guid and k.chieu = 'xuoi'
    union
    select k.tu_guid, t.cap + 1 from thuong t
      join public.bim_ket_noi k on k.model_id = p_model and k.den_guid = t.guid and k.chieu = 'xuoi'
     where t.cap < v_cap
  ),
  ha_min as (select guid, min(cap) as cap from ha where guid <> p_guid group by guid),
  thuong_min as (select guid, min(cap) as cap from thuong where guid <> p_guid group by guid),
  lien_ke as (
    select case when k.tu_guid = p_guid then k.den_guid else k.tu_guid end as guid from public.bim_ket_noi k
     where k.model_id = p_model and k.chieu = 'hai_chieu' and p_guid in (k.tu_guid, k.den_guid)
  ),
  affected as (select p_guid as guid, 0 as cap union all select guid, cap from ha_min)
  select jsonb_build_object(
    'goc', p_guid,
    'thuong_nguon', coalesce((select jsonb_agg(jsonb_build_object('guid', t.guid, 'cap', t.cap, 'ten', e.ten_cau_kien,
        'loai', e.loai_cau_kien, 'tang', e.phan_doan_tang) order by t.cap, t.guid)
      from thuong_min t left join public.bim_elements e on e.model_id = p_model and e.global_id = t.guid), '[]'),
    'ha_nguon', coalesce((select jsonb_agg(jsonb_build_object('guid', h.guid, 'cap', h.cap, 'ten', e.ten_cau_kien,
        'loai', e.loai_cau_kien, 'tang', e.phan_doan_tang) order by h.cap, h.guid)
      from ha_min h left join public.bim_elements e on e.model_id = p_model and e.global_id = h.guid), '[]'),
    'lien_ke', coalesce((select jsonb_agg(distinct l.guid) from lien_ke l), '[]'),
    'he_thong', coalesce((select jsonb_agg(jsonb_build_object('guid', s.guid, 'ten', s.ten, 'loai_he', s.loai_he,
        'so_thanh_vien', cardinality(s.thanh_vien)) order by s.ten, s.guid)
      from public.bim_he_thong s where s.model_id = p_model and p_guid = any (s.thanh_vien)), '[]'),
    'anh_huong', jsonb_build_object(
      'tang', coalesce((select jsonb_agg(jsonb_build_object('tang', x.tang, 'so_cau_kien', x.n) order by x.tang)
        from (select e.phan_doan_tang as tang, count(*) as n from ha_min h
                join public.bim_elements e on e.model_id = p_model and e.global_id = h.guid group by 1) x), '[]'),
      'tai_san', coalesce((select jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'asset_code', a.asset_code,
          'asset_name', a.asset_name, 'status', a.status, 'guid', a.bim_element_id, 'cap', f.cap,
          'phieu_mo', (select count(*) from public.facility_work_orders o where o.asset_id = a.asset_id
                         and o.status not in ('completed', 'cancelled'))) order by f.cap, a.asset_code, a.asset_name)
        from affected f join public.bim_assets a on a.project_id = v_project and a.model_id = p_model and a.bim_element_id = f.guid), '[]')),
    'gioi_han', (select coalesce(max(cap), 0) >= v_cap from ha_min) or (select coalesce(max(cap), 0) >= v_cap from thuong_min),
    'co_mang', exists (select 1 from public.bim_ket_noi k where k.model_id = p_model)
  ) into v;
  return v;
end $$;

-- ── 17. Execute grants ──────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.bim_lod500_danh_gia(uuid), public.bim_truy_vet(uuid, text, integer) from public, anon;
grant execute on function public.bim_lod500_danh_gia(uuid), public.bim_truy_vet(uuid, text, integer) to authenticated;
revoke all on function bim_private.facility_system_context(), bim_private.facility_user_name(uuid),
  bim_private.facility_asset_before_write(), bim_private.facility_validate_pm_plan(), bim_private.facility_validate_order(),
  bim_private.facility_order_audit(), bim_private.facility_asset_audit(), bim_private.facility_guard_parts(),
  bim_private.facility_pm_generate(uuid, date), bim_private.facility_sync_locations_core(uuid),
  bim_private.facility_validate_handover_item(), bim_private.facility_handover_gate(), bim_private.facility_route_guard(),
  bim_private.facility_fault_stamp()
  from public, anon, authenticated;
revoke all on function public.facility_iso_date(text), public.facility_today(), public.facility_floor_key(text),
  public.facility_element_attr(jsonb, text), public.facility_sla_hours(text), public.facility_default_sla(text, text, timestamptz, date),
  public.facility_save_work_order(uuid, integer, jsonb), public.facility_assignee_save_work_order(uuid, integer, jsonb),
  public.facility_reopen_work_order(uuid, text, date), public.facility_change_schedule(uuid, timestamptz, text, integer, text),
  public.facility_save_asset(uuid, timestamptz, jsonb, text), public.facility_generate_pm_orders(uuid), public.facility_run_pm_schedule(),
  public.facility_sync_locations(uuid), public.facility_ifc_default_classes(), public.facility_ifc_category(text, text),
  public.facility_ifc_asset_rows(uuid, uuid, text[], text[]), public.facility_import_ifc_assets(uuid, jsonb),
  public.facility_import_assets_csv(uuid, jsonb, text, boolean), public.facility_start_inspection_round(uuid),
  public.facility_log_inspection_scan(uuid, uuid, text, jsonb, text, text, numeric, numeric, numeric, boolean),
  public.facility_close_inspection_round(uuid, boolean), public.facility_ops_summary(uuid, timestamptz, timestamptz),
  public.facility_actor_names(uuid, uuid[]), public.document_cde_set_muc_phu_luc(uuid, text),
  public.bim_goi_ban_giao_ghi(uuid, text, text, text, bigint, jsonb, integer, integer), public.bim_goi_ban_giao_du_lieu(uuid)
  from public, anon;
grant execute on function public.facility_iso_date(text), public.facility_today(), public.facility_floor_key(text),
  public.facility_element_attr(jsonb, text), public.facility_sla_hours(text), public.facility_default_sla(text, text, timestamptz, date),
  public.facility_save_work_order(uuid, integer, jsonb), public.facility_assignee_save_work_order(uuid, integer, jsonb),
  public.facility_reopen_work_order(uuid, text, date), public.facility_change_schedule(uuid, timestamptz, text, integer, text),
  public.facility_save_asset(uuid, timestamptz, jsonb, text), public.facility_generate_pm_orders(uuid),
  public.facility_sync_locations(uuid), public.facility_ifc_default_classes(), public.facility_ifc_category(text, text),
  public.facility_ifc_asset_rows(uuid, uuid, text[], text[]), public.facility_import_ifc_assets(uuid, jsonb),
  public.facility_import_assets_csv(uuid, jsonb, text, boolean), public.facility_start_inspection_round(uuid),
  public.facility_log_inspection_scan(uuid, uuid, text, jsonb, text, text, numeric, numeric, numeric, boolean),
  public.facility_close_inspection_round(uuid, boolean), public.facility_ops_summary(uuid, timestamptz, timestamptz),
  public.facility_actor_names(uuid, uuid[]), public.document_cde_set_muc_phu_luc(uuid, text),
  public.bim_goi_ban_giao_ghi(uuid, text, text, text, bigint, jsonb, integer, integer), public.bim_goi_ban_giao_du_lieu(uuid)
  to authenticated;
grant execute on function public.facility_iso_date(text), public.facility_today(), public.facility_floor_key(text),
  public.facility_element_attr(jsonb, text), public.facility_sla_hours(text), public.facility_default_sla(text, text, timestamptz, date),
  public.facility_run_pm_schedule(), public.facility_ifc_default_classes(), public.facility_ifc_category(text, text)
  to service_role;

notify pgrst, 'reload schema';

-- Upstream: 20261027160000_bim_iot.sql
-- BIM module phase B7: IoT points and alerts on the asset register, and the gateway ingest pipeline.
-- Ported from cic-hud 20261019024235 / 20261019025714 / 20261021100000 §5–6 / 20261021110000 §9 / 20261022020100 §7–8 /
-- 20261022040000 with these changes:
--   * one IoT namespace per project (project_id uuid): the cic-hud datasets (bim_iot_datasets, dataset_id) and the
--     demo/actual split (data_kind) only separated demo data and are dropped;
--   * points belong to bim_assets and to an element of the asset's model; work orders link their source alert by
--     facility_work_orders.iot_source_alert_id;
--   * alert acknowledgement, status changes and work orders go through SECURITY DEFINER RPCs for project writers;
--     configuration (gateways, devices, points, alarm rules) and ingestion are service-role only (iot-ingest);
--   * automatic work orders run as the rule's operator account (work_order_actor), which must be able to write;
--   * pg_cron is optional: without it iot-ingest calls iot_maintenance_if_due(); the Realtime policy on
--     realtime.messages is created only where that table exists.

-- ── 1. Gateways and devices ─────────────────────────────────────────────────────────────────────────────────────
create table public.iot_gateways (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9._-]{2,64}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  protocol text,
  -- SHA-256 of a random 64-character key only; the key is shown once on registration/rotation.
  secret_sha256 text not null check (secret_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'disabled')),
  -- wall: offline by the server clock; source: by the gateway's latest observation time (history replay).
  clock_mode text not null default 'wall' check (clock_mode in ('wall', 'source')),
  max_future_skew_seconds integer not null default 120 check (max_future_skew_seconds between 0 and 3600),
  max_batch integer not null default 2000 check (max_batch between 1 and 10000),
  last_seen_at timestamptz,
  secret_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code),
  unique (id, project_id)
);
create table public.iot_devices (
  project_id uuid not null,
  id text not null check (length(btrim(id)) between 1 and 120),
  gateway_id uuid not null,
  asset_id uuid not null,
  code text not null,
  category text,
  sample_interval_seconds integer not null default 300 check (sample_interval_seconds > 0),
  stale_after_seconds integer not null default 900 check (stale_after_seconds > 0),
  current_boot_id text,
  last_sequence bigint,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id),
  foreign key (gateway_id, project_id) references public.iot_gateways(id, project_id) on delete cascade,
  foreign key (project_id, asset_id) references public.bim_assets(project_id, asset_id)
);
create index iot_devices_gateway on public.iot_devices (gateway_id);
create index iot_devices_asset on public.iot_devices (project_id, asset_id);

-- ── 2. Points (canonical unit in unit; conversion only by approved configuration) ──────────────────────────────
create table public.bim_iot_points (
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  id text not null check (length(btrim(id)) between 1 and 120),
  asset_id uuid not null,
  model_id uuid not null references public.bim_models(id),
  global_id text not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  unit text not null,
  created_at timestamptz not null default now(),
  device_id text,
  metric text,
  value_type text not null default 'number' check (value_type in ('number', 'boolean')),
  source_unit text,
  scale double precision not null default 1 check (scale <> 0 and scale = scale),
  value_offset double precision not null default 0,
  valid_min double precision,
  valid_max double precision,
  sample_interval_seconds integer check (sample_interval_seconds is null or sample_interval_seconds > 0),
  stale_after_seconds integer check (stale_after_seconds is null or stale_after_seconds > 0),
  config_approved_at timestamptz,
  config_approved_by uuid,
  primary key (project_id, id),
  unique (project_id, id, asset_id),
  check (valid_min is null or valid_max is null or valid_min <= valid_max),
  check (source_unit is null or source_unit <> unit),
  foreign key (project_id, asset_id) references public.bim_assets(project_id, asset_id),
  foreign key (project_id, device_id) references public.iot_devices(project_id, id)
);
create index bim_iot_points_asset on public.bim_iot_points (project_id, asset_id);
create index bim_iot_points_model on public.bim_iot_points (model_id);
create index bim_iot_points_device on public.bim_iot_points (project_id, device_id);

-- A point measures its asset: same project, the asset's model element.
create function bim_private.iot_validate_point() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.bim_assets;
begin
  select * into a from public.bim_assets where project_id = new.project_id and asset_id = new.asset_id for share;
  if a.asset_id is null then raise exception 'Điểm IoT và tài sản phải cùng dự án'; end if;
  if a.bim_element_id is distinct from new.global_id or a.model_id is distinct from new.model_id
     or not exists (select 1 from public.bim_elements e where e.project_id = new.project_id and e.model_id = new.model_id
                      and e.global_id = new.global_id) then
    raise exception 'Liên kết IoT không khớp mô hình BIM của tài sản';
  end if;
  if tg_op = 'UPDATE' then
    if (new.project_id, new.id, new.asset_id) is distinct from (old.project_id, old.id, old.asset_id) then
      raise exception 'Không được chuyển điểm IoT sang phạm vi khác';
    end if;
  end if;
  if new.device_id is not null and not exists (select 1 from public.iot_devices d where d.project_id = new.project_id
                                                  and d.id = new.device_id and d.asset_id = new.asset_id) then
    raise exception 'Thiết bị đo phải gắn cùng tài sản của điểm IoT';
  end if;
  return new;
end $$;
create trigger bim_iot_point_validate before insert or update on public.bim_iot_points
  for each row execute function bim_private.iot_validate_point();

-- An asset with IoT points keeps its BIM link until the points are re-mapped.
create function bim_private.iot_protect_asset_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.model_id, new.bim_element_id) is distinct from (old.model_id, old.bim_element_id)
     and exists (select 1 from public.bim_iot_points p where p.project_id = old.project_id and p.asset_id = old.asset_id) then
    raise exception 'Cần cập nhật ánh xạ IoT trước khi đổi liên kết BIM của tài sản';
  end if;
  return new;
end $$;
create trigger bim_assets_30_iot_scope before update on public.bim_assets
  for each row execute function bim_private.iot_protect_asset_scope();

-- ── 3. Alerts ───────────────────────────────────────────────────────────────────────────────────────────────────
create table public.bim_iot_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  source_key text not null,
  point_id text not null,
  asset_id uuid not null,
  rule_id text not null,
  name text not null check (length(btrim(name)) > 0),
  severity text not null check (severity in ('info', 'warning', 'critical', 'data_quality')),
  condition_since timestamptz not null,
  opened_at timestamptz not null,
  resolved_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'suppressed', 'closed')),
  assignee_id uuid references auth.users(id) on delete set null,
  notes text check (notes is null or length(notes) <= 2000),
  status_changed_at timestamptz,
  status_changed_by uuid,
  rule_version integer,
  unique (project_id, source_key),
  unique (project_id, id, asset_id),
  foreign key (project_id, point_id, asset_id) references public.bim_iot_points(project_id, id, asset_id),
  check (condition_since <= opened_at),
  check (resolved_at is null or resolved_at >= opened_at)
);
create index bim_iot_alerts_scope on public.bim_iot_alerts (project_id, opened_at desc, id);
create index bim_iot_alerts_point on public.bim_iot_alerts (project_id, point_id, asset_id);
create index bim_iot_alerts_status on public.bim_iot_alerts (project_id, status);
create index bim_iot_alerts_actor on public.bim_iot_alerts (acknowledged_by) where acknowledged_by is not null;
create index bim_iot_alerts_assignee on public.bim_iot_alerts (assignee_id) where assignee_id is not null;
-- One open incident per rule and point.
create unique index bim_iot_alerts_one_open on public.bim_iot_alerts (project_id, rule_id, point_id) where resolved_at is null;

create table public.bim_iot_alert_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  alert_id uuid not null references public.bim_iot_alerts(id) on delete cascade,
  actor_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index bim_iot_alert_events_scope on public.bim_iot_alert_events (project_id, id desc);
create index bim_iot_alert_events_alert on public.bim_iot_alert_events (alert_id, id desc);

create function bim_private.iot_alert_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.project_id, new.source_key, new.point_id, new.asset_id, new.rule_id, new.opened_at, new.created_at)
     is distinct from (old.project_id, old.source_key, old.point_id, old.asset_id, old.rule_id, old.opened_at, old.created_at) then
    raise exception 'Không được đổi nguồn của cảnh báo IoT';
  end if;
  if new.acknowledged_at is not null and old.acknowledged_at is null and new.status = 'open' then new.status := 'acknowledged'; end if;
  if new.status is distinct from old.status then new.status_changed_at := now(); new.status_changed_by := auth.uid(); end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger bim_iot_alert_guard before update on public.bim_iot_alerts
  for each row execute function bim_private.iot_alert_before_update();

-- Trigger-only history for operators and trusted server ingestion.
create function bim_private.iot_alert_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and not bim_private.facility_system_context() then
    raise exception 'Cần danh tính người dùng hoặc kết nối nhập dữ liệu phía server';
  end if;
  insert into public.bim_iot_alert_events (project_id, alert_id, actor_id, action, before_data, after_data)
  values (new.project_id, new.id, auth.uid(),
    case when tg_op = 'INSERT' then 'imported_or_opened'
         when new.acknowledged_by is distinct from old.acknowledged_by then 'acknowledged'
         when new.resolved_at is distinct from old.resolved_at then 'resolved'
         when new.status is distinct from old.status then 'status_changed' else 'updated' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
create trigger bim_iot_alert_audit after insert or update on public.bim_iot_alerts
  for each row execute function bim_private.iot_alert_audit();

-- Work orders opened from an alert (one per alert, same project and asset).
alter table public.facility_work_orders add column iot_source_alert_id uuid,
  add constraint facility_order_iot_alert foreign key (project_id, iot_source_alert_id, asset_id)
    references public.bim_iot_alerts(project_id, id, asset_id);
create unique index facility_order_one_iot_alert on public.facility_work_orders (iot_source_alert_id) where iot_source_alert_id is not null;
create function bim_private.iot_order_source_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.iot_source_alert_id is distinct from old.iot_source_alert_id then
    raise exception 'Không được đổi nguồn cảnh báo của phiếu';
  end if;
  return new;
end $$;
create trigger facility_order_iot_source before update on public.facility_work_orders
  for each row execute function bim_private.iot_order_source_guard();

-- Writers acknowledge (optimistic version; an acknowledged alert is returned unchanged).
create function public.bim_iot_acknowledge_alert(p_id uuid, p_version integer) returns public.bim_iot_alerts
language plpgsql security definer set search_path = '' as $$
declare saved public.bim_iot_alerts;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode = '42501'; end if;
  select * into saved from public.bim_iot_alerts where id = p_id for update;
  if saved.id is null or not bim_private.can_write(saved.project_id) then
    raise exception 'Không có quyền xác nhận cảnh báo' using errcode = '42501';
  end if;
  if saved.acknowledged_at is not null then return saved; end if;
  if saved.version <> p_version then raise exception 'Cảnh báo đã thay đổi. Hãy tải lại'; end if;
  update public.bim_iot_alerts set acknowledged_at = now(), acknowledged_by = auth.uid() where id = p_id returning * into saved;
  return saved;
end $$;

-- Status, assignee and notes; suppressing or closing needs a note.
create function public.bim_iot_update_alert(p_id uuid, p_version integer, p_status text default null, p_assignee uuid default null,
  p_notes text default null, p_clear_assignee boolean default false) returns public.bim_iot_alerts
language plpgsql security definer set search_path = '' as $$
declare a public.bim_iot_alerts; v_status text;
begin
  select * into a from public.bim_iot_alerts where id = p_id for update;
  if a.id is null or auth.uid() is null or not bim_private.can_write(a.project_id) then
    raise exception 'Không có quyền xử lý cảnh báo' using errcode = '42501';
  end if;
  if a.version <> p_version then raise exception 'Cảnh báo đã thay đổi. Hãy tải lại'; end if;
  if p_status is not null and p_status not in ('open', 'acknowledged', 'suppressed', 'closed') then
    raise exception 'Trạng thái cảnh báo không hợp lệ';
  end if;
  if p_status in ('suppressed', 'closed') and length(btrim(coalesce(p_notes, a.notes, ''))) < 5 then
    raise exception 'Cần ghi chú lý do khi tạm ẩn hoặc đóng cảnh báo';
  end if;
  if p_assignee is not null and not bim_private.is_project_person(a.project_id, p_assignee) then
    raise exception 'Người xử lý phải là thành viên dự án';
  end if;
  v_status := coalesce(p_status, a.status);
  update public.bim_iot_alerts set
    status = v_status,
    acknowledged_at = case when v_status in ('acknowledged', 'closed') and acknowledged_at is null then now() else acknowledged_at end,
    acknowledged_by = case when v_status in ('acknowledged', 'closed') and acknowledged_at is null then auth.uid() else acknowledged_by end,
    assignee_id = case when p_clear_assignee then null else coalesce(p_assignee, assignee_id) end,
    notes = case when p_notes is null then notes else nullif(btrim(p_notes), '') end
  where id = p_id returning * into a;
  return a;
end $$;

-- Writers open one repair order per alert (idempotent: the existing order is returned).
create function public.bim_iot_create_work_order(p_alert uuid, p_due date default (public.facility_today() + 1))
returns public.facility_work_orders language plpgsql security definer set search_path = '' as $$
declare a public.bim_iot_alerts; saved public.facility_work_orders;
begin
  select * into a from public.bim_iot_alerts where id = p_alert for update;
  if a.id is null or auth.uid() is null or not bim_private.can_write(a.project_id) then
    raise exception 'Không có quyền lập phiếu xử lý IoT' using errcode = '42501';
  end if;
  select * into saved from public.facility_work_orders where iot_source_alert_id = a.id;
  if saved.id is not null then return saved; end if;
  perform set_config('bim.change_reason', 'Phiếu xử lý cảnh báo IoT ' || a.source_key, true);
  insert into public.facility_work_orders (project_id, asset_id, title, due_date, iot_source_alert_id, checklist)
  values (a.project_id, a.asset_id, left(a.name, 300), coalesce(p_due, public.facility_today() + 1), a.id,
    '[{"label":"Xác nhận hiện trạng tại thiết bị","done":false},{"label":"Ghi nguyên nhân và kiểm tra sau xử lý","done":false}]')
  returning * into saved;
  return saved;
end $$;

-- ── 4. Readings (monthly partitions of observed_at), latest values, dedup, quarantine, rollups ──────────────────
create table public.iot_readings (
  project_id uuid not null,
  point_id text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  value double precision,
  raw_value double precision,
  quality text not null check (quality in ('good', 'uncertain', 'bad')),
  unit text not null,
  device_id text not null,
  event_id uuid not null,
  boot_id text not null,
  sequence bigint not null check (sequence >= 0),
  late boolean not null default false,
  primary key (project_id, point_id, observed_at),
  -- Bad samples have no normalised value (never replaced by 0).
  check (quality <> 'bad' or value is null)
) partition by range (observed_at);
create index iot_readings_scope on public.iot_readings (project_id, observed_at);

create table public.iot_latest (
  project_id uuid not null,
  point_id text not null,
  device_id text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null,
  value double precision,
  raw_value double precision,
  quality text not null check (quality in ('good', 'uncertain', 'bad')),
  unit text not null,
  event_id uuid not null,
  boot_id text not null,
  sequence bigint not null,
  last_good_value double precision,
  last_good_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (project_id, point_id),
  check (quality <> 'bad' or value is null)
);

-- Replay-window dedup: event_id, or device/point/boot/sequence.
create table public.iot_ingest_events (
  project_id uuid not null,
  event_id uuid not null,
  gateway_id uuid not null references public.iot_gateways(id) on delete cascade,
  device_id text not null,
  point_id text not null,
  boot_id text not null,
  sequence bigint not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  status text not null check (status in ('stored', 'late')),
  primary key (project_id, event_id),
  unique (project_id, device_id, point_id, boot_id, sequence)
);
create index iot_ingest_events_received on public.iot_ingest_events (received_at);

create table public.iot_quarantine (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  gateway_id uuid not null references public.iot_gateways(id) on delete cascade,
  event_id text,
  point_id text,
  device_id text,
  observed_at timestamptz,
  reason text not null check (reason ~ '^[a-z_]{3,40}$'),
  detail text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create unique index iot_quarantine_once on public.iot_quarantine (project_id, event_id, reason) where event_id is not null;
create index iot_quarantine_scope on public.iot_quarantine (project_id, received_at desc);

-- 5-minute and hourly aggregates (min/max/avg skip bad values; boolean avg = share of time on).
create table public.iot_readings_5min (
  project_id uuid not null,
  point_id text not null,
  bucket timestamptz not null,
  samples integer not null,
  bad_samples integer not null,
  min_value double precision,
  max_value double precision,
  avg_value double precision,
  last_value double precision,
  last_at timestamptz,
  primary key (project_id, point_id, bucket)
);
create table public.iot_readings_hourly (like public.iot_readings_5min including all);

-- ── 5. Alarm rules and their state machine ──────────────────────────────────────────────────────────────────────
create table public.iot_alarm_rules (
  project_id uuid not null,
  id text not null check (length(btrim(id)) between 1 and 120),
  version integer not null default 1,
  name text not null check (length(btrim(name)) > 0),
  point_id text not null,
  device_id text,
  operator text not null check (operator in ('gt', 'lt', 'offhours_gt', 'offline', 'quality_bad')),
  threshold double precision,
  clear_threshold double precision,
  hold_seconds integer not null default 0 check (hold_seconds between 0 and 604800),
  clear_hold_seconds integer not null default 0 check (clear_hold_seconds between 0 and 604800),
  severity text not null check (severity in ('info', 'warning', 'critical', 'data_quality')),
  -- {"tz":"Asia/Ho_Chi_Minh","days":[1,2,3,4,5],"start":"08:00","end":"18:00"}: working hours for offhours_gt.
  schedule jsonb,
  enabled boolean not null default true,
  auto_work_order boolean not null default false,
  work_order_actor uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, id),
  foreign key (project_id, point_id) references public.bim_iot_points(project_id, id),
  check (operator = 'quality_bad' or threshold is not null),
  check (operator <> 'offline' or threshold > 0),
  check (operator not in ('gt', 'offhours_gt') or clear_threshold is null or clear_threshold <= threshold),
  check (operator <> 'lt' or clear_threshold is null or clear_threshold >= threshold),
  check (operator <> 'offhours_gt' or schedule is not null),
  check (not auto_work_order or work_order_actor is not null)
);
create index iot_alarm_rules_point on public.iot_alarm_rules (project_id, point_id);
create table public.iot_alarm_state (
  project_id uuid not null,
  rule_id text not null,
  point_id text not null,
  phase text not null default 'normal' check (phase in ('normal', 'pending', 'open', 'clearing')),
  since timestamptz,
  clear_since timestamptz,
  open_source_key text,
  last_observed_at timestamptz,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (project_id, rule_id, point_id),
  foreign key (project_id, rule_id) references public.iot_alarm_rules(project_id, id) on delete cascade
);
create table public.iot_maintenance_runs (
  job text primary key,
  last_run_at timestamptz not null,
  last_result jsonb
);

create function bim_private.iot_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger iot_gateways_touch before update on public.iot_gateways for each row execute function bim_private.iot_touch();
create trigger iot_devices_touch before update on public.iot_devices for each row execute function bim_private.iot_touch();
create function bim_private.iot_alarm_rule_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.project_id, new.id) is distinct from (old.project_id, old.id) then
    raise exception 'Không được chuyển quy tắc IoT sang phạm vi khác';
  end if;
  new.version := old.version + case when
    (new.operator, new.threshold, new.clear_threshold, new.hold_seconds, new.clear_hold_seconds, new.schedule, new.severity,
     new.enabled, new.auto_work_order, new.work_order_actor, new.point_id, new.name)
    is distinct from
    (old.operator, old.threshold, old.clear_threshold, old.hold_seconds, old.clear_hold_seconds, old.schedule, old.severity,
     old.enabled, old.auto_work_order, old.work_order_actor, old.point_id, old.name)
    then 1 else 0 end;
  new.updated_at := now();
  return new;
end $$;
create trigger iot_alarm_rules_version before update on public.iot_alarm_rules
  for each row execute function bim_private.iot_alarm_rule_version();

-- ── 6. Partitions ───────────────────────────────────────────────────────────────────────────────────────────────
create function public.iot_reading_partition_name(p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select 'iot_readings_p' || to_char(p_at at time zone 'UTC', 'YYYYMM')
$$;
create function public.iot_ensure_reading_partitions(p_from timestamptz default now(), p_months_ahead integer default 2)
returns integer language plpgsql security definer set search_path = '' as $$
declare first_month timestamp := date_trunc('month', p_from at time zone 'UTC'); lower_bound timestamp; partition_name text;
  created integer := 0;
begin
  if p_months_ahead is null or p_months_ahead < 0 or p_months_ahead > 24 then
    raise exception 'Số tháng tạo trước phải từ 0 đến 24';
  end if;
  for i in 0 .. p_months_ahead loop
    lower_bound := first_month + make_interval(months => i);
    partition_name := 'iot_readings_p' || to_char(lower_bound, 'YYYYMM');
    if to_regclass('public.' || partition_name) is null then
      execute format('create table public.%I partition of public.iot_readings for values from (%L) to (%L)',
        partition_name, (lower_bound at time zone 'UTC'), ((lower_bound + interval '1 month') at time zone 'UTC'));
      -- Partitions do not inherit the parent's policies: no direct access, reads go through iot_readings.
      execute format('alter table public.%I enable row level security', partition_name);
      execute format('revoke all on public.%I from public, anon, authenticated', partition_name);
      execute format('grant all on public.%I to service_role', partition_name);
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;

-- ── 7. Rollups of the touched buckets (late samples included) ───────────────────────────────────────────────────
create function public.iot_refresh_rollups(p_project uuid, p_points text[], p_from timestamptz, p_to timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  origin constant timestamptz := timestamptz '2000-01-01 00:00:00+00';
  from5 timestamptz := date_bin('5 minutes', p_from, origin);
  to5 timestamptz := date_bin('5 minutes', p_to, origin) + interval '5 minutes';
  from1h timestamptz := date_trunc('hour', p_from at time zone 'UTC') at time zone 'UTC';
  to1h timestamptz := (date_trunc('hour', p_to at time zone 'UTC') at time zone 'UTC') + interval '1 hour';
begin
  if p_points is null or cardinality(p_points) = 0 or p_from is null or p_to is null then return; end if;
  insert into public.iot_readings_5min as r (project_id, point_id, bucket, samples, bad_samples, min_value, max_value, avg_value,
    last_value, last_at)
  select x.project_id, x.point_id, date_bin('5 minutes', x.observed_at, origin), count(*)::int,
    (count(*) filter (where x.quality = 'bad' or x.value is null))::int, min(x.value), max(x.value), avg(x.value),
    (array_agg(x.value order by x.observed_at desc) filter (where x.value is not null))[1], max(x.observed_at)
  from public.iot_readings x
  where x.project_id = p_project and x.point_id = any (p_points) and x.observed_at >= from5 and x.observed_at < to5
  group by x.project_id, x.point_id, date_bin('5 minutes', x.observed_at, origin)
  on conflict (project_id, point_id, bucket) do update set samples = excluded.samples, bad_samples = excluded.bad_samples,
    min_value = excluded.min_value, max_value = excluded.max_value, avg_value = excluded.avg_value,
    last_value = excluded.last_value, last_at = excluded.last_at;

  insert into public.iot_readings_hourly as r (project_id, point_id, bucket, samples, bad_samples, min_value, max_value, avg_value,
    last_value, last_at)
  select x.project_id, x.point_id, date_trunc('hour', x.observed_at at time zone 'UTC') at time zone 'UTC', count(*)::int,
    (count(*) filter (where x.quality = 'bad' or x.value is null))::int, min(x.value), max(x.value), avg(x.value),
    (array_agg(x.value order by x.observed_at desc) filter (where x.value is not null))[1], max(x.observed_at)
  from public.iot_readings x
  where x.project_id = p_project and x.point_id = any (p_points) and x.observed_at >= from1h and x.observed_at < to1h
  group by x.project_id, x.point_id, date_trunc('hour', x.observed_at at time zone 'UTC')
  on conflict (project_id, point_id, bucket) do update set samples = excluded.samples, bad_samples = excluded.bad_samples,
    min_value = excluded.min_value, max_value = excluded.max_value, avg_value = excluded.avg_value,
    last_value = excluded.last_value, last_at = excluded.last_at;
end $$;

-- ── 8. Gateway registration and key rotation (service role) ─────────────────────────────────────────────────────
create function public.iot_register_gateway(p_project uuid, p_code text, p_name text, p_protocol text default null,
  p_clock_mode text default 'wall') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare secret text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); saved public.iot_gateways;
begin
  if auth.uid() is not null then raise exception 'Chỉ dịch vụ máy chủ đăng ký gateway' using errcode = '42501'; end if;
  if not exists (select 1 from public.sxd_bim_projects p where p.id = p_project) then
    raise exception 'Không tìm thấy dự án %', p_project;
  end if;
  insert into public.iot_gateways (project_id, code, name, protocol, clock_mode, secret_sha256)
  values (p_project, p_code, p_name, p_protocol, coalesce(p_clock_mode, 'wall'), encode(sha256(convert_to(secret, 'UTF8')), 'hex'))
  on conflict (project_id, code) do update set name = excluded.name, protocol = excluded.protocol, clock_mode = excluded.clock_mode,
    secret_sha256 = excluded.secret_sha256, secret_rotated_at = now(), status = 'active'
  returning * into saved;
  return jsonb_build_object('gateway_id', saved.id, 'code', saved.code, 'secret', secret);
end $$;

-- ── 9. Context for one batch (one call) ─────────────────────────────────────────────────────────────────────────
create function public.iot_ingest_context(p_gateway uuid, p_event_ids uuid[], p_keys jsonb default '[]') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g public.iot_gateways;
begin
  select * into g from public.iot_gateways where id = p_gateway;
  if g.id is null then return null; end if;
  return jsonb_build_object(
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'gateway_id', d.gateway_id, 'asset_id', d.asset_id,
        'stale_after_seconds', d.stale_after_seconds, 'current_boot_id', d.current_boot_id, 'last_sequence', d.last_sequence))
      from public.iot_devices d where d.gateway_id = g.id), '[]'),
    'points', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'device_id', p.device_id, 'asset_id', p.asset_id,
        'unit', p.unit, 'source_unit', p.source_unit, 'scale', p.scale, 'value_offset', p.value_offset,
        'value_type', p.value_type, 'valid_min', p.valid_min, 'valid_max', p.valid_max,
        'stale_after_seconds', coalesce(p.stale_after_seconds, d.stale_after_seconds)))
      from public.bim_iot_points p join public.iot_devices d on d.project_id = p.project_id and d.id = p.device_id
      where d.gateway_id = g.id), '[]'),
    'latest', coalesce((select jsonb_agg(jsonb_build_object('point_id', l.point_id, 'observed_at', l.observed_at))
      from public.iot_latest l
      join public.bim_iot_points p on p.project_id = l.project_id and p.id = l.point_id
      join public.iot_devices d on d.project_id = p.project_id and d.id = p.device_id
      where l.project_id = g.project_id and d.gateway_id = g.id), '[]'),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) - 'created_at' - 'updated_at' - 'note')
      from public.iot_alarm_rules r
      join public.bim_iot_points p on p.project_id = r.project_id and p.id = r.point_id
      join public.iot_devices d on d.project_id = p.project_id and d.id = p.device_id
      where r.project_id = g.project_id and r.enabled and d.gateway_id = g.id), '[]'),
    'states', coalesce((select jsonb_agg(to_jsonb(s) - 'project_id' - 'updated_at')
      from public.iot_alarm_state s
      join public.iot_alarm_rules r on r.project_id = s.project_id and r.id = s.rule_id
      join public.bim_iot_points p on p.project_id = r.project_id and p.id = r.point_id
      join public.iot_devices d on d.project_id = p.project_id and d.id = p.device_id
      where s.project_id = g.project_id and d.gateway_id = g.id), '[]'),
    'known_events', coalesce((select jsonb_agg(e.event_id) from public.iot_ingest_events e
      where e.project_id = g.project_id and e.event_id = any (coalesce(p_event_ids, '{}'))), '[]'),
    'known_keys', coalesce((select jsonb_agg(jsonb_build_object('d', e.device_id, 'p', e.point_id, 'b', e.boot_id, 's', e.sequence))
      from public.iot_ingest_events e
      join jsonb_to_recordset(coalesce(p_keys, '[]')) as k(d text, p text, b text, s bigint)
        on e.device_id = k.d and e.point_id = k.p and e.boot_id = k.b and e.sequence = k.s
      where e.project_id = g.project_id), '[]'),
    'ordered_alerts', coalesce((select jsonb_agg(a.source_key) from public.bim_iot_alerts a
      join public.facility_work_orders o on o.iot_source_alert_id = a.id
      where a.project_id = g.project_id and a.resolved_at is null), '[]')
  );
end $$;

-- ── 10. Automatic work order as the rule's operator account ─────────────────────────────────────────────────────
-- Order history needs a user identity: the order is written as work_order_actor (who must be able to write the
-- project); without a valid account the order is skipped.
create function public.iot_create_work_order_as_actor(p_alert uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.bim_iot_alerts; r public.iot_alarm_rules; saved public.facility_work_orders; v_order uuid;
  previous_claims text := current_setting('request.jwt.claims', true);
  previous_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select * into a from public.bim_iot_alerts where id = p_alert;
  if a.id is null then return null; end if;
  select id into v_order from public.facility_work_orders where iot_source_alert_id = a.id;
  if v_order is not null then return v_order; end if;
  select * into r from public.iot_alarm_rules where project_id = a.project_id and id = a.rule_id;
  if r.id is null or not r.auto_work_order or r.work_order_actor is null then return null; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', r.work_order_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', r.work_order_actor::text, true);
  begin
    saved := public.bim_iot_create_work_order(a.id);
    v_order := saved.id;
  exception when others then
    raise warning 'IoT: không tạo được phiếu tự động cho cảnh báo %: %', a.id, sqlerrm;
    v_order := null;
  end;
  perform set_config('request.jwt.claims', coalesce(previous_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  return v_order;
end $$;

-- ── 11. Apply a batch planned by iot-ingest (one transaction, locked per project) ───────────────────────────────
create function public.iot_ingest_apply(p_gateway uuid, p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.iot_gateways; received timestamptz := now();
  n_events integer := 0; n_readings integer := 0; n_quarantine integer := 0; n_latest integer := 0; n_open integer := 0;
  n_resolved integer := 0; bad_count integer; orders jsonb := '[]'; v_order uuid; item record;
  min_at timestamptz; max_at timestamptz; touched text[];
begin
  select * into g from public.iot_gateways where id = p_gateway;
  if g.id is null or g.status <> 'active' then raise exception 'IOT_GATEWAY_INACTIVE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('iot:' || g.project_id::text, 0));

  -- Rule states read in the context step must be unchanged (optimistic); otherwise iot-ingest plans again.
  select count(*) into bad_count
    from jsonb_to_recordset(coalesce(p_plan -> 'states', '[]')) as s(rule_id text, point_id text, expected_version integer)
    left join public.iot_alarm_state cur on cur.project_id = g.project_id and cur.rule_id = s.rule_id and cur.point_id = s.point_id
   where coalesce(cur.version, 0) <> s.expected_version;
  if bad_count > 0 then raise exception 'IOT_CONFLICT' using errcode = '40001'; end if;

  -- Every reading belongs to a point/device of the authenticated gateway.
  select count(*) into bad_count
    from jsonb_to_recordset(coalesce(p_plan -> 'readings', '[]')) as x(point_id text, device_id text)
   where not exists (select 1 from public.bim_iot_points p join public.iot_devices d on d.project_id = p.project_id and d.id = p.device_id
                      where p.project_id = g.project_id and p.id = x.point_id and d.id = x.device_id and d.gateway_id = g.id);
  if bad_count > 0 then raise exception 'IOT_SCOPE: % số đo ngoài phạm vi gateway', bad_count; end if;

  with incoming as (
    select * from jsonb_to_recordset(coalesce(p_plan -> 'events', '[]')) as e(event_id uuid, device_id text, point_id text,
      boot_id text, sequence bigint, observed_at timestamptz, status text)
  ), inserted as (
    insert into public.iot_ingest_events (project_id, event_id, gateway_id, device_id, point_id, boot_id, sequence, observed_at,
      received_at, status)
    select g.project_id, i.event_id, g.id, i.device_id, i.point_id, i.boot_id, i.sequence, i.observed_at, received, i.status
      from incoming i
    on conflict do nothing
    returning 1
  ) select count(*) into n_events from inserted;
  if n_events <> jsonb_array_length(coalesce(p_plan -> 'events', '[]')) then
    raise exception 'IOT_CONFLICT' using errcode = '40001';
  end if;

  select min(x.observed_at), max(x.observed_at), array_agg(distinct x.point_id) into min_at, max_at, touched
    from jsonb_to_recordset(coalesce(p_plan -> 'readings', '[]')) as x(point_id text, observed_at timestamptz);
  if min_at is not null then
    if max_at - min_at > interval '93 days' then raise exception 'Lô dữ liệu trải quá 3 tháng'; end if;
    for item in select generate_series(date_trunc('month', min_at at time zone 'UTC'), date_trunc('month', max_at at time zone 'UTC'),
                                       interval '1 month') as m loop
      perform public.iot_ensure_reading_partitions(item.m at time zone 'UTC', 0);
    end loop;
  end if;

  with inserted as (
    insert into public.iot_readings (project_id, point_id, observed_at, received_at, value, raw_value, quality, unit, device_id,
      event_id, boot_id, sequence, late)
    select g.project_id, x.point_id, x.observed_at, received, x.value, x.raw_value, x.quality, x.unit, x.device_id, x.event_id,
      x.boot_id, x.sequence, coalesce(x.late, false)
      from jsonb_to_recordset(coalesce(p_plan -> 'readings', '[]')) as x(point_id text, device_id text, observed_at timestamptz,
        value double precision, raw_value double precision, quality text, unit text, event_id uuid, boot_id text, sequence bigint,
        late boolean)
    on conflict do nothing
    returning 1
  ) select count(*) into n_readings from inserted;

  with inserted as (
    insert into public.iot_quarantine (project_id, gateway_id, event_id, point_id, device_id, observed_at, reason, detail, payload,
      received_at)
    select g.project_id, g.id, q.event_id, q.point_id, q.device_id,
      case when q.observed_at ~ '^\d{4}-\d{2}-\d{2}T' then q.observed_at::timestamptz end, q.reason, q.detail,
      coalesce(q.payload, '{}'), received
      from jsonb_to_recordset(coalesce(p_plan -> 'quarantine', '[]')) as q(event_id text, point_id text, device_id text,
        observed_at text, reason text, detail text, payload jsonb)
    on conflict do nothing
    returning 1
  ) select count(*) into n_quarantine from inserted;

  with upserted as (
    insert into public.iot_latest as l (project_id, point_id, device_id, observed_at, received_at, value, raw_value, quality, unit,
      event_id, boot_id, sequence, last_good_value, last_good_at, updated_at)
    select g.project_id, x.point_id, x.device_id, x.observed_at, received, x.value, x.raw_value, x.quality, x.unit, x.event_id,
      x.boot_id, x.sequence, x.last_good_value, x.last_good_at, now()
      from jsonb_to_recordset(coalesce(p_plan -> 'latest', '[]')) as x(point_id text, device_id text, observed_at timestamptz,
        value double precision, raw_value double precision, quality text, unit text, event_id uuid, boot_id text, sequence bigint,
        last_good_value double precision, last_good_at timestamptz)
    on conflict (project_id, point_id) do update set device_id = excluded.device_id, observed_at = excluded.observed_at,
      received_at = excluded.received_at, value = excluded.value, raw_value = excluded.raw_value, quality = excluded.quality,
      unit = excluded.unit, event_id = excluded.event_id, boot_id = excluded.boot_id, sequence = excluded.sequence,
      last_good_value = case when excluded.last_good_at is not null and (l.last_good_at is null or excluded.last_good_at > l.last_good_at)
                             then excluded.last_good_value else l.last_good_value end,
      last_good_at = case when excluded.last_good_at is not null and (l.last_good_at is null or excluded.last_good_at > l.last_good_at)
                          then excluded.last_good_at else l.last_good_at end,
      updated_at = now()
    -- Latest never goes back to an older observation.
    where excluded.observed_at > l.observed_at
    returning 1
  ) select count(*) into n_latest from upserted;

  update public.iot_devices d set current_boot_id = x.boot_id, last_sequence = x.sequence, last_seen_at = x.last_seen_at
    from jsonb_to_recordset(coalesce(p_plan -> 'devices', '[]')) as x(device_id text, boot_id text, sequence bigint, last_seen_at timestamptz)
   where d.project_id = g.project_id and d.id = x.device_id and d.gateway_id = g.id
     and (d.last_seen_at is null or x.last_seen_at >= d.last_seen_at);

  insert into public.iot_alarm_state as s (project_id, rule_id, point_id, phase, since, clear_since, open_source_key, last_observed_at,
    version, updated_at)
  select g.project_id, x.rule_id, x.point_id, x.phase, x.since, x.clear_since, x.open_source_key, x.last_observed_at,
    x.expected_version + 1, now()
    from jsonb_to_recordset(coalesce(p_plan -> 'states', '[]')) as x(rule_id text, point_id text, phase text, since timestamptz,
      clear_since timestamptz, open_source_key text, last_observed_at timestamptz, expected_version integer)
  on conflict (project_id, rule_id, point_id) do update set phase = excluded.phase, since = excluded.since,
    clear_since = excluded.clear_since, open_source_key = excluded.open_source_key, last_observed_at = excluded.last_observed_at,
    version = excluded.version, updated_at = now();

  update public.bim_iot_alerts a set resolved_at = x.resolved_at
    from jsonb_to_recordset(coalesce(p_plan -> 'alerts_resolve', '[]')) as x(source_key text, resolved_at timestamptz)
   where a.project_id = g.project_id and a.source_key = x.source_key and a.resolved_at is null and x.resolved_at >= a.opened_at;
  get diagnostics n_resolved = row_count;

  with inserted as (
    insert into public.bim_iot_alerts (project_id, source_key, point_id, asset_id, rule_id, name, severity, condition_since, opened_at,
      resolved_at, rule_version)
    select g.project_id, x.source_key, x.point_id, p.asset_id, x.rule_id, x.name, x.severity, x.condition_since, x.opened_at,
      x.resolved_at, x.rule_version
      from jsonb_to_recordset(coalesce(p_plan -> 'alerts_open', '[]')) as x(source_key text, rule_id text, rule_version integer,
        point_id text, name text, severity text, condition_since timestamptz, opened_at timestamptz, resolved_at timestamptz)
      join public.bim_iot_points p on p.project_id = g.project_id and p.id = x.point_id
    on conflict do nothing
    returning 1
  ) select count(*) into n_open from inserted;

  for item in select a.id from jsonb_array_elements_text(coalesce(p_plan -> 'work_orders', '[]')) as k(source_key)
                join public.bim_iot_alerts a on a.project_id = g.project_id and a.source_key = k.source_key loop
    v_order := public.iot_create_work_order_as_actor(item.id);
    if v_order is not null then orders := orders || to_jsonb(v_order); end if;
  end loop;

  perform public.iot_refresh_rollups(g.project_id, touched, min_at, max_at);
  update public.iot_gateways set last_seen_at = received where id = g.id;

  return jsonb_build_object('events', n_events, 'readings', n_readings, 'quarantined', n_quarantine, 'latest', n_latest,
    'alerts_opened', n_open, 'alerts_resolved', n_resolved, 'work_orders', orders, 'received_at', received);
end $$;

-- ── 12. Offline by the server clock (gateways in clock_mode wall) ───────────────────────────────────────────────
-- Same source key as iot-ingest (rule:<rule>:<point>:<condition time UTC ISO>), so both paths never duplicate.
create function public.iot_offline_sweep(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_since timestamptz; v_key text; changed integer; opened integer := 0; v_alert uuid;
begin
  for r in
    select ru.project_id, ru.id as rule_id, ru.version as rule_version, ru.point_id, ru.name, ru.severity, ru.threshold, p.asset_id,
           coalesce(st.version, 0) as state_version, coalesce(st.last_observed_at, l.observed_at) as last_observed
      from public.iot_alarm_rules ru
      join public.bim_iot_points p on p.project_id = ru.project_id and p.id = ru.point_id
      join public.iot_devices d on d.project_id = p.project_id and d.id = p.device_id
      join public.iot_gateways g on g.id = d.gateway_id and g.status = 'active' and g.clock_mode = 'wall'
      left join public.iot_alarm_state st on st.project_id = ru.project_id and st.rule_id = ru.id and st.point_id = ru.point_id
      left join public.iot_latest l on l.project_id = ru.project_id and l.point_id = ru.point_id
     where ru.enabled and ru.operator = 'offline' and coalesce(st.phase, 'normal') <> 'open'
       and coalesce(st.last_observed_at, l.observed_at) is not null
       and p_now - coalesce(st.last_observed_at, l.observed_at) >= make_interval(secs => ru.threshold)
  loop
    perform pg_advisory_xact_lock(hashtextextended('iot:' || r.project_id::text, 0));
    v_since := r.last_observed + make_interval(secs => r.threshold);
    v_key := format('rule:%s:%s:%s', r.rule_id, r.point_id, to_char(v_since at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    if r.state_version = 0 then
      insert into public.iot_alarm_state (project_id, rule_id, point_id, phase, since, open_source_key, last_observed_at, version)
      values (r.project_id, r.rule_id, r.point_id, 'open', v_since, v_key, r.last_observed, 1)
      on conflict do nothing;
    else
      update public.iot_alarm_state set phase = 'open', since = v_since, clear_since = null, open_source_key = v_key,
        version = version + 1, updated_at = now()
       where project_id = r.project_id and rule_id = r.rule_id and point_id = r.point_id and version = r.state_version;
    end if;
    get diagnostics changed = row_count;
    continue when changed = 0;
    v_alert := null;
    insert into public.bim_iot_alerts (project_id, source_key, point_id, asset_id, rule_id, name, severity, condition_since, opened_at,
      rule_version)
    values (r.project_id, v_key, r.point_id, r.asset_id, r.rule_id, r.name, r.severity, v_since, v_since, r.rule_version)
    on conflict do nothing
    returning id into v_alert;
    if v_alert is not null then
      opened := opened + 1;
      perform public.iot_create_work_order_as_actor(v_alert);
    end if;
  end loop;
  return opened;
end $$;

-- ── 13. Maintenance: partitions, retention, offline sweep ───────────────────────────────────────────────────────
create function public.iot_maintenance(p_now timestamptz default now(), p_raw_days integer default 14,
  p_5min_days integer default 90, p_hourly_days integer default 730, p_replay_hours integer default 72,
  p_quarantine_days integer default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz := p_now - make_interval(days => p_raw_days); created integer; dropped integer := 0; removed bigint := 0;
  n bigint; part record; scope record; offline integer;
begin
  created := public.iot_ensure_reading_partitions(p_now, 2);
  for part in select c.relname from pg_catalog.pg_inherits i join pg_catalog.pg_class c on c.oid = i.inhrelid
               where i.inhparent = 'public.iot_readings'::regclass and c.relname ~ '^iot_readings_p[0-9]{6}$' loop
    if (to_timestamp(substr(part.relname, 15, 6), 'YYYYMM')::timestamp at time zone 'UTC') + interval '1 month' <= cutoff then
      execute format('drop table public.%I', part.relname);
      dropped := dropped + 1;
    end if;
  end loop;
  for scope in select distinct project_id from public.iot_gateways loop
    delete from public.iot_readings where project_id = scope.project_id and observed_at < cutoff;
    get diagnostics n = row_count;
    removed := removed + n;
  end loop;
  delete from public.iot_readings_5min where bucket < p_now - make_interval(days => p_5min_days);
  delete from public.iot_readings_hourly where bucket < p_now - make_interval(days => p_hourly_days);
  delete from public.iot_ingest_events where received_at < p_now - make_interval(hours => p_replay_hours);
  delete from public.iot_quarantine where received_at < p_now - make_interval(days => p_quarantine_days);
  offline := public.iot_offline_sweep(p_now);
  return jsonb_build_object('partitions_created', created, 'partitions_dropped', dropped, 'raw_rows_removed', removed,
    'offline_alerts_opened', offline, 'at', p_now);
end $$;
create function public.iot_maintenance_if_due(p_min_interval interval default interval '4 minutes') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare last_run timestamptz; result jsonb;
begin
  insert into public.iot_maintenance_runs (job, last_run_at) values ('maintenance', '-infinity') on conflict do nothing;
  select last_run_at into last_run from public.iot_maintenance_runs where job = 'maintenance' for update skip locked;
  if not found or last_run > now() - p_min_interval then return null; end if;
  result := public.iot_maintenance(now());
  update public.iot_maintenance_runs set last_run_at = now(), last_result = result where job = 'maintenance';
  return result;
end $$;
-- Call again after enabling pg_cron to schedule maintenance every 5 minutes.
create function public.iot_schedule_maintenance() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    return 'pg_cron chưa bật: iot-ingest tự gọi iot_maintenance_if_due() khi nhận dữ liệu';
  end if;
  execute $cron$select cron.schedule('iot-maintenance', '*/5 * * * *', 'select public.iot_maintenance_if_due(interval ''4 minutes'')')$cron$;
  return 'Đã lên lịch iot-maintenance 5 phút/lần';
end $$;

-- ── 14. Access ──────────────────────────────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['iot_gateways', 'iot_devices', 'bim_iot_points', 'bim_iot_alerts', 'bim_iot_alert_events', 'iot_readings',
      'iot_latest', 'iot_readings_5min', 'iot_readings_hourly', 'iot_alarm_rules', 'iot_quarantine', 'iot_ingest_events',
      'iot_alarm_state', 'iot_maintenance_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['iot_devices', 'bim_iot_points', 'bim_iot_alerts', 'bim_iot_alert_events', 'iot_readings', 'iot_latest',
      'iot_readings_5min', 'iot_readings_hourly', 'iot_alarm_rules'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy iot_read on public.%I for select to authenticated using (project_id = any ((select bim_private.readable_projects())::uuid[]))', t);
  end loop;
end $$;
-- Gateways: identity columns only, never the key hash.
grant select (id, project_id, code, name, protocol, status, clock_mode, max_future_skew_seconds, max_batch, last_seen_at,
  secret_rotated_at, created_at, updated_at) on public.iot_gateways to authenticated;
create policy iot_read on public.iot_gateways for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
-- Quarantine may hold raw payloads: project writers only.
grant select on public.iot_quarantine to authenticated;
create policy iot_quarantine_read on public.iot_quarantine for select to authenticated
  using (project_id = any ((select bim_private.writable_projects())::uuid[]));
grant usage, select on sequence public.iot_quarantine_id_seq, public.bim_iot_alert_events_id_seq to service_role;

create view public.iot_latest_status with (security_invoker = true) as
select l.project_id, l.point_id, l.device_id, l.observed_at, l.received_at, l.value, l.raw_value, l.quality, l.unit,
  l.last_good_value, l.last_good_at,
  extract(epoch from (now() - l.observed_at))::bigint as age_seconds,
  coalesce(p.stale_after_seconds, d.stale_after_seconds, 900) as stale_after_seconds,
  now() - l.observed_at > make_interval(secs => coalesce(p.stale_after_seconds, d.stale_after_seconds, 900)) as stale
from public.iot_latest l
left join public.bim_iot_points p on p.project_id = l.project_id and p.id = l.point_id
left join public.iot_devices d on d.project_id = l.project_id and d.id = l.device_id;
revoke all on public.iot_latest_status from public, anon;
grant select on public.iot_latest_status to authenticated, service_role;

-- History names now include IoT alert actors (facility_actor_names reads bim_iot_alert_events when present).

revoke all on function bim_private.iot_validate_point(), bim_private.iot_protect_asset_scope(), bim_private.iot_alert_before_update(),
  bim_private.iot_alert_audit(), bim_private.iot_order_source_guard(), bim_private.iot_touch(), bim_private.iot_alarm_rule_version()
  from public, anon, authenticated;
revoke all on function public.iot_reading_partition_name(timestamptz), public.iot_ensure_reading_partitions(timestamptz, integer),
  public.iot_refresh_rollups(uuid, text[], timestamptz, timestamptz), public.iot_register_gateway(uuid, text, text, text, text),
  public.iot_ingest_context(uuid, uuid[], jsonb), public.iot_create_work_order_as_actor(uuid), public.iot_ingest_apply(uuid, jsonb),
  public.iot_offline_sweep(timestamptz), public.iot_maintenance(timestamptz, integer, integer, integer, integer, integer),
  public.iot_maintenance_if_due(interval), public.iot_schedule_maintenance()
  from public, anon, authenticated;
grant execute on function public.iot_reading_partition_name(timestamptz), public.iot_ensure_reading_partitions(timestamptz, integer),
  public.iot_refresh_rollups(uuid, text[], timestamptz, timestamptz), public.iot_register_gateway(uuid, text, text, text, text),
  public.iot_ingest_context(uuid, uuid[], jsonb), public.iot_ingest_apply(uuid, jsonb), public.iot_offline_sweep(timestamptz),
  public.iot_maintenance(timestamptz, integer, integer, integer, integer, integer), public.iot_maintenance_if_due(interval),
  public.iot_schedule_maintenance()
  to service_role;
revoke all on function public.bim_iot_acknowledge_alert(uuid, integer),
  public.bim_iot_update_alert(uuid, integer, text, uuid, text, boolean), public.bim_iot_create_work_order(uuid, date)
  from public, anon;
grant execute on function public.bim_iot_acknowledge_alert(uuid, integer),
  public.bim_iot_update_alert(uuid, integer, text, uuid, text, boolean), public.bim_iot_create_work_order(uuid, date)
  to authenticated;

-- ── 15. Realtime: private topic iot:<project uuid> for project readers; postgres_changes on alerts ──────────────
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists iot_project_broadcast_read on realtime.messages';
    execute $p$create policy iot_project_broadcast_read on realtime.messages for select to authenticated
      using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'iot:%'
             and substr(realtime.topic(), 5) = any ((select bim_private.readable_project_texts())::text[]))$p$;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'bim_iot_alerts') then
    execute 'alter publication supabase_realtime add table public.bim_iot_alerts';
  end if;
end $$;

-- ── 16. Current month + 2 ahead; pg_cron schedule if enabled ────────────────────────────────────────────────────
select public.iot_ensure_reading_partitions(now(), 2);
select public.iot_schedule_maintenance();

notify pgrst, 'reload schema';

-- Upstream: 20261027180000_bim_ai.sql
-- "Trợ lý BuildSIA" BIM tools (DB part of AI-6 in docs/plans/KE_HOACH_PHAN_HE_BIM_VA_AI_HO_TRO_20261026.md §5).
-- Port of cic-hud 20261022030000_bim_ai_compound_search.sql and 20261022030100_bim_element_embeddings.sql:
--   * uuid project/model ids; access by bim_private.readable_projects() on top of the tables' own RLS
--     (functions are SECURITY INVOKER);
--   * cic-hud's project dictionary (thuoc_tinh.hud_chuan, HUD_ViTri) is dropped: storey and tower come from
--     phan_doan_tang, systems from Uniclass Ss entries in thuoc_tinh.phan_loai and SystemName-like properties,
--     fire rating from FireRating or the element name (same rules as src/features/bim/ai/elementFilters.ts);
--   * acceptance = bim_nghiem_thu.bim_guid or a 'nghiem_thu' link; documents/tasks = bim_lien_ket_tai_lieu;
--     assets = bim_assets.bim_element_id; open issues = bim_issues (new filter has_issue);
--   * embeddings are written by the worker (service role) from a queue filled by triggers on bim_elements whenever
--     an element's descriptive text changes; readers only search. bim_ai_standard_counts (HUD dictionary) is not
--     ported.
-- The pgvector part sits between the ">>> pgvector" and "<<< pgvector" markers: scripts/verify-assistant-db.mjs
-- removes it when the local PGlite build has no vector extension; on a server without pgvector it fails clearly.

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
create function public.bim_ai_num(p text) returns numeric
language sql immutable parallel safe set search_path = '' as $$
  select case when p ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$' then replace(btrim(p), ',', '.')::numeric end
$$;

-- Property by key: "Pset.Property" within one property set, otherwise the first match in the element's psets, its
-- type's psets, then quantities. Keys are case sensitive as stored.
create function public.bim_ai_prop(p_props jsonb, p_key text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when position('.' in p_key) > 0 then nullif(coalesce(
      p_props #>> array['psets', split_part(p_key, '.', 1), split_part(p_key, '.', 2)],
      p_props #>> array['kieu', 'psets', split_part(p_key, '.', 1), split_part(p_key, '.', 2)],
      p_props #>> array['qto', split_part(p_key, '.', 1), split_part(p_key, '.', 2)]), '')
    else nullif(coalesce(
      jsonb_path_query_first(p_props, '$.psets.*.keyvalue() ? (@.key == $k).value', jsonb_build_object('k', p_key), true) #>> '{}',
      jsonb_path_query_first(p_props, '$.kieu.psets.*.keyvalue() ? (@.key == $k).value', jsonb_build_object('k', p_key), true) #>> '{}',
      jsonb_path_query_first(p_props, '$.qto.*.keyvalue() ? (@.key == $k).value', jsonb_build_object('k', p_key), true) #>> '{}'), '')
  end
$$;

create function public.bim_ai_match(p_actual text, p_op text, p_expected text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select case coalesce(lower(p_op), 'eq')
    when 'exists' then p_actual is not null
    when 'missing' then p_actual is null
    when 'eq' then p_actual is not null and (
      lower(btrim(p_actual)) = lower(btrim(coalesce(p_expected, '')))
      or (public.bim_ai_num(p_actual) is not null and public.bim_ai_num(p_actual) = public.bim_ai_num(p_expected)))
    when 'ne' then p_actual is null or not (
      lower(btrim(p_actual)) = lower(btrim(coalesce(p_expected, '')))
      or (public.bim_ai_num(p_actual) is not null and public.bim_ai_num(p_actual) = public.bim_ai_num(p_expected)))
    when 'contains' then p_actual is not null and strpos(lower(p_actual), lower(coalesce(p_expected, ''))) > 0
    when 'gt' then public.bim_ai_num(p_actual) > public.bim_ai_num(p_expected)
    when 'gte' then public.bim_ai_num(p_actual) >= public.bim_ai_num(p_expected)
    when 'lt' then public.bim_ai_num(p_actual) < public.bim_ai_num(p_expected)
    when 'lte' then public.bim_ai_num(p_actual) <= public.bim_ai_num(p_expected)
    else false
  end
$$;

create function public.bim_ai_regex_escape(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
$$;

-- Lower case without Vietnamese diacritics (shared with document_search).
create function public.bim_ai_fold(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select public.f_unaccent(lower(coalesce(p,'')))
$$;

-- Folded, escaped LIKE pattern for public.bim_ai_fold(column) like ...
create function public.bim_ai_like(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select '%' || replace(replace(replace(public.bim_ai_fold(p), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%'
$$;

-- Storey regex over the folded phan_doan_tang: "3", "T3", "tầng 03" -> storey 3; "B1", "hầm 1" -> basement 1.
create function public.bim_ai_storey_regex(p text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare v text := public.bim_ai_fold(btrim(coalesce(p, ''))); n integer;
begin
  if v = '' then return null; end if;
  if v ~ '^(b|basement|ham|tang ham)\s*-?\s*0*[0-9]+$' then
    n := substring(v from '([0-9]+)$')::integer;
    return '(^|[^0-9a-z])(b|ham|tang ham|basement)\s*-?\s*0*' || n || '([^0-9]|$)';
  end if;
  if v ~ '^(t|l|f|tang|lau|level|floor)?\s*0*[0-9]+$' then
    n := substring(v from '([0-9]+)$')::integer;
    return '(^|[^0-9a-z])(t|l|f|tang|lau|level|floor)\s*0*' || n || '([^0-9]|$)';
  end if;
  return '(^|[^0-9a-z])' || public.bim_ai_regex_escape(v) || '([^0-9a-z]|$)';
end $$;

create function public.bim_ai_fire_rated(p_props jsonb, p_name text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(lower(btrim(coalesce(
           jsonb_path_query_first(p_props, '$.psets.*.FireRating', '{}'::jsonb, true) #>> '{}',
           jsonb_path_query_first(p_props, '$.kieu.psets.*.FireRating', '{}'::jsonb, true) #>> '{}'))), '')
           !~ '^(|0|-|none|n/a|no|khong|không|null|false)$'
      or public.bim_ai_fold(p_name) ~ '(chong chay|ngan chay|fire[ -]?(rated|door|resist)|(^|[^0-9a-z])ei\s*[0-9]{2,3}([^0-9]|$))'
$$;

-- Folded system text: Uniclass Ss classification entries and SystemName-like properties.
create function public.bim_ai_system_text(p_props jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select public.bim_ai_fold(concat_ws(' ',
    (select string_agg(x, ' ') from jsonb_array_elements_text(
       case when jsonb_typeof(p_props -> 'phan_loai') = 'array' then p_props -> 'phan_loai' else '[]'::jsonb end) x
      where x ~* '^\s*ss_'),
    public.bim_ai_prop(p_props, 'SystemName'), public.bim_ai_prop(p_props, 'System Name'),
    public.bim_ai_prop(p_props, 'System'), public.bim_ai_prop(p_props, 'SystemType')))
$$;

-- ── Compound element search ─────────────────────────────────────────────────────────────────────────────────────
-- p_filters: {loai_cau_kien: text | text[], global_ids: text[], keyword, vat_lieu, tang, thap, he_thong,
--   pset: [{key, op: eq|ne|contains|gt|gte|lt|lte|exists|missing, value}] (≤ 10), chong_chay, has_acceptance,
--   has_document, has_task, has_asset, has_issue: boolean, sap_xep: ten|the_tich_giam|dien_tich_giam|chieu_dai_giam}.
-- Returns {tong_so_khop, so_tra_ve, offset, bi_gioi_han, mo_hinh, thong_ke_loai, thong_ke_tang, ket_qua[]}.
create function public.bim_ai_search_elements(
  p_project uuid,
  p_model_ids uuid[] default null,
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 100,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  f jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  v_models uuid[];
  v_classes text[];
  v_guids text[];
  v_storey_regex text;
  v_tower text;
  v_tower_regex text;
  v_keyword text := nullif(btrim(f ->> 'keyword'), '');
  v_material text := nullif(btrim(f ->> 'vat_lieu'), '');
  v_system text := nullif(btrim(f ->> 'he_thong'), '');
  v_pset jsonb := case when jsonb_typeof(f -> 'pset') = 'array' then f -> 'pset' else '[]'::jsonb end;
  v_fire boolean := case when jsonb_typeof(f -> 'chong_chay') = 'boolean' then (f ->> 'chong_chay')::boolean end;
  v_acc boolean := case when jsonb_typeof(f -> 'has_acceptance') = 'boolean' then (f ->> 'has_acceptance')::boolean end;
  v_doc boolean := case when jsonb_typeof(f -> 'has_document') = 'boolean' then (f ->> 'has_document')::boolean end;
  v_task boolean := case when jsonb_typeof(f -> 'has_task') = 'boolean' then (f ->> 'has_task')::boolean end;
  v_asset boolean := case when jsonb_typeof(f -> 'has_asset') = 'boolean' then (f ->> 'has_asset')::boolean end;
  v_issue boolean := case when jsonb_typeof(f -> 'has_issue') = 'boolean' then (f ->> 'has_issue')::boolean end;
  v_sort text := coalesce(f ->> 'sap_xep', 'ten');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 2000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if p_project is null or not (p_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền đọc dữ liệu BIM của dự án %', p_project using errcode = '42501';
  end if;
  if jsonb_array_length(v_pset) > 10 then
    raise exception 'Tối đa 10 điều kiện thuộc tính' using errcode = '22023';
  end if;

  select coalesce(array_agg(m.id), '{}') into v_models
    from public.bim_models m
   where m.project_id = p_project and m.deleted_at is null and m.status = 'ready'
     and (p_model_ids is null or cardinality(p_model_ids) = 0 or m.id = any (p_model_ids));

  if jsonb_typeof(f -> 'loai_cau_kien') = 'array' then
    select array_agg(upper(x)) into v_classes from jsonb_array_elements_text(f -> 'loai_cau_kien') x;
  elsif nullif(f ->> 'loai_cau_kien', '') is not null then
    v_classes := array[upper(f ->> 'loai_cau_kien')];
  end if;
  if jsonb_typeof(f -> 'global_ids') = 'array' then
    select array_agg(x) into v_guids from jsonb_array_elements_text(f -> 'global_ids') x;
  end if;
  v_storey_regex := public.bim_ai_storey_regex(f ->> 'tang');
  v_tower := nullif(regexp_replace(btrim(public.bim_ai_fold(f ->> 'thap')), '^(thap|tower|toa|khoi)\s*', ''), '');
  if v_tower is not null then
    v_tower_regex := '((thap|tower|toa|khoi)\s*' || public.bim_ai_regex_escape(v_tower)
      || '([^0-9a-z]|$))|(^' || public.bim_ai_regex_escape(v_tower) || '([^0-9a-z]|$))';
  end if;

  with acc as (
    select n.bim_guid::text as g from public.bim_nghiem_thu n where n.ma_du_an = p_project and n.bim_guid is not null
    union
    select l.global_id::text from public.bim_lien_ket_tai_lieu l where l.project_id = p_project and l.loai_doi_tuong = 'nghiem_thu'
  ),
  doc as (
    select distinct l.global_id::text as g from public.bim_lien_ket_tai_lieu l
     where l.project_id = p_project and l.loai_doi_tuong = 'tai_lieu'
  ),
  task as (
    select distinct l.global_id::text as g from public.bim_lien_ket_tai_lieu l
     where l.project_id = p_project and l.loai_doi_tuong = 'cong_viec'
  ),
  asset as (
    select distinct a.bim_element_id as g from public.bim_assets a
     where a.project_id = p_project and a.bim_element_id is not null
  ),
  issue as (
    select distinct i.target_element_guid::text as g from public.bim_issues i
     where i.project_id = p_project and i.target_element_guid is not null and i.status in ('open', 'in_progress')
  ),
  -- MATERIALIZED + "|| '{}'" detoasts thuoc_tinh once per row; later filters read the in-memory copy.
  base as materialized (
    select e.model_id, e.global_id::text as global_id, e.express_id, e.ten_cau_kien, e.loai_cau_kien, e.phan_doan_tang,
           e.vat_lieu, e.the_tich_be_tong, e.dien_tich, e.chieu_dai, e.trong_luong, e.nguon_khoi_luong,
           coalesce(e.thuoc_tinh, '{}'::jsonb) || '{}'::jsonb as tt,
           (e.global_id::text in (select g from acc)) as co_nghiem_thu,
           (e.global_id::text in (select g from doc)) as co_ho_so,
           (e.global_id::text in (select g from task)) as co_cong_viec,
           (e.global_id::text in (select g from asset)) as co_tai_san,
           (e.global_id::text in (select g from issue)) as co_vuong_mac
      from public.bim_elements e
     where e.project_id = p_project
       and e.model_id = any (v_models)
       and (v_classes is null or upper(e.loai_cau_kien) = any (v_classes))
       and (v_guids is null or e.global_id::text = any (v_guids))
  ),
  scoped as (
    select b.* from base b
     where (v_keyword is null or public.bim_ai_fold(concat_ws(' ', b.ten_cau_kien, b.global_id, b.tt -> 'kieu' ->> 'ten'))
              like public.bim_ai_like(v_keyword))
       and (v_material is null or public.bim_ai_fold(b.vat_lieu) like public.bim_ai_like(v_material))
       and (v_storey_regex is null or public.bim_ai_fold(b.phan_doan_tang) ~ v_storey_regex)
       and (v_tower_regex is null or public.bim_ai_fold(b.phan_doan_tang) ~ v_tower_regex)
       and (v_acc is null or b.co_nghiem_thu = v_acc)
       and (v_doc is null or b.co_ho_so = v_doc)
       and (v_task is null or b.co_cong_viec = v_task)
       and (v_asset is null or b.co_tai_san = v_asset)
       and (v_issue is null or b.co_vuong_mac = v_issue)
       -- CASE keeps the evaluation order: properties (costly) are read only when the condition is requested.
       and case when v_system is null then true
                else public.bim_ai_system_text(b.tt) like public.bim_ai_like(v_system) end
       and case when jsonb_array_length(v_pset) = 0 then true else not exists (
             select 1 from jsonb_array_elements(v_pset) c
              where not coalesce(public.bim_ai_match(public.bim_ai_prop(b.tt, c ->> 'key'), c ->> 'op', c ->> 'value'), false)) end
       and case when v_fire is null then true else public.bim_ai_fire_rated(b.tt, b.ten_cau_kien) = v_fire end
  ),
  matched as (
    select s.*, count(*) over () as total from scoped s
  ),
  ranked as (
    select m.*, row_number() over (order by
       case when v_sort = 'the_tich_giam' then m.the_tich_be_tong end desc nulls last,
       case when v_sort = 'dien_tich_giam' then m.dien_tich end desc nulls last,
       case when v_sort = 'chieu_dai_giam' then m.chieu_dai end desc nulls last,
       m.ten_cau_kien, m.model_id, m.express_id) as rn
      from matched m
  ),
  page as (
    select r.*, public.bim_ai_fire_rated(r.tt, r.ten_cau_kien) as chong_chay
      from ranked r where r.rn > v_offset and r.rn <= v_offset + v_limit
  )
  select jsonb_build_object(
    'tong_so_khop', coalesce((select max(total) from matched), 0),
    'so_tra_ve', (select count(*) from page),
    'offset', v_offset,
    'bi_gioi_han', coalesce((select max(total) from matched), 0) > v_offset + (select count(*) from page),
    'mo_hinh', to_jsonb(v_models),
    'thong_ke_loai', coalesce((select jsonb_object_agg(loai_cau_kien, n) from (
        select loai_cau_kien, count(*) n from matched group by 1 order by 2 desc limit 20) t), '{}'::jsonb),
    'thong_ke_tang', coalesce((select jsonb_object_agg(tang, n) from (
        select coalesce(phan_doan_tang, 'chua_co_tang') tang, count(*) n from matched group by 1 order by 2 desc limit 40) t), '{}'::jsonb),
    'ket_qua', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'model_id', model_id,
        'global_id', global_id,
        'express_id', express_id,
        'ten', ten_cau_kien,
        'loai', loai_cau_kien,
        'tang', phan_doan_tang,
        'vat_lieu', vat_lieu,
        'phan_loai', case when jsonb_typeof(tt -> 'phan_loai') = 'array' and jsonb_array_length(tt -> 'phan_loai') > 0
                          then tt -> 'phan_loai' end,
        'the_tich_m3', round(the_tich_be_tong::numeric, 3),
        'dien_tich_m2', round(dien_tich::numeric, 3),
        'chieu_dai_m', round(chieu_dai::numeric, 3),
        'nguon_khoi_luong', nguon_khoi_luong,
        'chong_chay', chong_chay,
        'co_nghiem_thu', co_nghiem_thu,
        'co_ho_so', co_ho_so,
        'co_cong_viec', co_cong_viec,
        'co_tai_san', co_tai_san,
        'co_vuong_mac', co_vuong_mac
      )) order by rn) from page), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
comment on function public.bim_ai_search_elements(uuid, uuid[], jsonb, integer, integer) is
  'Trợ lý BIM: tìm cấu kiện kết hợp loại, tầng/tháp, hệ thống, Pset, chống cháy và liên kết nghiệp vụ (nghiệm thu = bim_nghiem_thu.bim_guid hoặc liên kết nghiem_thu).';

-- Details of up to 50 elements by GlobalId with their links, acceptance records, open issues and assets.
-- Returns {so_cau_kien, khong_tim_thay[], cau_kien[]}.
create function public.bim_ai_element_details(
  p_project uuid,
  p_global_ids text[],
  p_model_ids uuid[] default null
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if p_project is null or not (p_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền đọc dữ liệu BIM của dự án %', p_project using errcode = '42501';
  end if;
  if coalesce(cardinality(p_global_ids), 0) = 0 then
    return jsonb_build_object('so_cau_kien', 0, 'cau_kien', '[]'::jsonb, 'khong_tim_thay', '[]'::jsonb);
  end if;
  if cardinality(p_global_ids) > 50 then
    raise exception 'Tối đa 50 GUID mỗi lần' using errcode = '22023';
  end if;

  with els as (
    select e.*
      from public.bim_elements e
      join public.bim_models m on m.id = e.model_id and m.deleted_at is null
     where e.project_id = p_project
       and e.global_id::text = any (p_global_ids)
       and (p_model_ids is null or cardinality(p_model_ids) = 0 or e.model_id = any (p_model_ids))
  )
  select jsonb_build_object(
    'so_cau_kien', (select count(*) from els),
    'khong_tim_thay', coalesce((select jsonb_agg(g) from unnest(p_global_ids) g
                                 where not exists (select 1 from els where els.global_id::text = g)), '[]'::jsonb),
    'cau_kien', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'model_id', e.model_id,
      'global_id', e.global_id,
      'express_id', e.express_id,
      'ten', e.ten_cau_kien,
      'loai', e.loai_cau_kien,
      'tang', e.phan_doan_tang,
      'vat_lieu', e.vat_lieu,
      'the_tich_m3', round(e.the_tich_be_tong::numeric, 3),
      'dien_tich_m2', round(e.dien_tich::numeric, 3),
      'chieu_dai_m', round(e.chieu_dai::numeric, 3),
      'trong_luong_kg', round(e.trong_luong::numeric, 1),
      'nguon_khoi_luong', e.nguon_khoi_luong,
      'thuoc_tinh', case when length(e.thuoc_tinh::text) > 8000
                         then jsonb_build_object('ghi_chu', 'Đã rút gọn, chỉ giữ Pset và phân loại',
                                'psets', e.thuoc_tinh -> 'psets', 'phan_loai', e.thuoc_tinh -> 'phan_loai')
                         else e.thuoc_tinh end,
      'ho_so_lien_ket', (select jsonb_agg(jsonb_build_object('loai', l.loai_doi_tuong, 'doi_tuong_id', l.doi_tuong_id,
                             'ten', l.ten_hien_thi) order by l.created_at)
                           from public.bim_lien_ket_tai_lieu l
                          where l.project_id = e.project_id and l.global_id = e.global_id
                            and (l.model_id is null or l.model_id = e.model_id)),
      'bien_ban_nghiem_thu', (select jsonb_agg(jsonb_build_object('ma', n.ma_nghiem_thu, 'ten', n.ten_nghiem_thu,
                                 'cap', n.cap_nghiem_thu, 'ket_luan', n.ket_luan, 'ngay', n.ngay_nghiem_thu,
                                 'trang_thai', n.trang_thai) order by n.tao_luc)
                                from public.bim_nghiem_thu n
                               where n.ma_du_an = e.project_id
                                 and (n.bim_guid = e.global_id
                                      or exists (select 1 from public.bim_lien_ket_tai_lieu l
                                                  where l.project_id = e.project_id and l.global_id = e.global_id
                                                    and l.loai_doi_tuong = 'nghiem_thu'
                                                    and l.doi_tuong_id = n.ma_nghiem_thu::text))),
      'vuong_mac', (select jsonb_agg(jsonb_build_object('id', i.id, 'so_hieu', i.so_hieu, 'tieu_de', i.title,
                       'loai', i.loai_ho_so, 'trang_thai', i.status, 'muc_do', i.priority,
                       'nguoi_xu_ly', i.assigned_to_name, 'han', i.due_date) order by i.created_at)
                      from public.bim_issues i
                     where i.project_id = e.project_id and i.target_element_guid = e.global_id),
      'tai_san', (select jsonb_agg(jsonb_build_object('id', a.asset_id, 'ma', a.asset_code, 'ten', a.asset_name,
                     'trang_thai', a.status, 'tinh_trang', a.condition, 'bao_tri_ke_tiep', a.next_maintenance))
                    from public.bim_assets a
                   where a.project_id = e.project_id and a.bim_element_id = e.global_id::text
                     and (a.model_id is null or a.model_id = e.model_id))
    )) order by e.model_id, e.express_id) from els e), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ── Embedding queue (no pgvector needed) ────────────────────────────────────────────────────────────────────────
-- Descriptive text embedded for semantic search: IFC class, names, storey, material, classifications and a few
-- telling properties. Deterministic, so its hash tells when an element needs a new vector.
create function bim_private.ai_element_text(p_loai text, p_ten text, p_tang text, p_vat_lieu text, p_props jsonb)
returns text language sql immutable set search_path = '' as $$
  select left(concat_ws(' | ', p_loai, nullif(btrim(p_ten), ''), nullif(btrim(p_props -> 'kieu' ->> 'ten'), ''),
    'Tầng ' || nullif(btrim(p_tang), ''), 'Vật liệu ' || nullif(btrim(p_vat_lieu), ''),
    (select string_agg(x, '; ') from (select x from jsonb_array_elements_text(
        case when jsonb_typeof(p_props -> 'phan_loai') = 'array' then p_props -> 'phan_loai' else '[]'::jsonb end) x limit 6) c),
    'Mô tả ' || public.bim_ai_prop(p_props, 'Description'),
    'Hệ thống ' || public.bim_ai_prop(p_props, 'SystemName'),
    'Chống cháy ' || public.bim_ai_prop(p_props, 'FireRating'),
    'Tham chiếu ' || public.bim_ai_prop(p_props, 'Reference')), 2000)
$$;

create table public.bim_ai_embedding_queue (
  model_id uuid not null references public.bim_models(id) on delete cascade,
  global_id varchar(22) not null,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  text text not null,
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  -- Hash of the text whose vector is stored; work is pending while it differs from text_hash.
  embedded_hash text,
  attempts integer not null default 0 check (attempts between 0 and 5),
  lease uuid,
  lease_until timestamptz,
  error_code text check (error_code is null or error_code ~ '^[A-Z_]{1,100}$'),
  updated_at timestamptz not null default now(),
  primary key (model_id, global_id)
);
create index bim_ai_embedding_queue_pending on public.bim_ai_embedding_queue (updated_at)
  where embedded_hash is distinct from text_hash;
create index bim_ai_embedding_queue_project on public.bim_ai_embedding_queue (project_id);
alter table public.bim_ai_embedding_queue enable row level security;
revoke all on public.bim_ai_embedding_queue from public, anon, authenticated;
grant all on public.bim_ai_embedding_queue to service_role;

-- Statement-level: one upsert per converter swap. A changed text resets attempts; an unchanged one keeps the row.
create function bim_private.ai_embedding_enqueue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bim_ai_embedding_queue as q (model_id, global_id, project_id, text, text_hash)
  select distinct on (n.model_id, n.global_id) n.model_id, n.global_id, n.project_id, t.text,
         encode(sha256(convert_to(t.text, 'UTF8')), 'hex')
    from changed_rows n
    cross join lateral (select bim_private.ai_element_text(n.loai_cau_kien, n.ten_cau_kien, n.phan_doan_tang, n.vat_lieu,
                                                            n.thuoc_tinh) as text) t
   order by n.model_id, n.global_id, n.express_id
  on conflict (model_id, global_id) do update set
    text = excluded.text, text_hash = excluded.text_hash, project_id = excluded.project_id, attempts = 0,
    error_code = null, lease = null, lease_until = null, updated_at = now()
  where q.text_hash is distinct from excluded.text_hash or q.project_id is distinct from excluded.project_id;
  return null;
end $$;
create trigger bim_elements_ai_embedding_insert after insert on public.bim_elements
  referencing new table as changed_rows for each statement execute function bim_private.ai_embedding_enqueue();
create trigger bim_elements_ai_embedding_update after update on public.bim_elements
  referencing new table as changed_rows for each statement execute function bim_private.ai_embedding_enqueue();

-- Existing elements.
insert into public.bim_ai_embedding_queue (model_id, global_id, project_id, text, text_hash)
select distinct on (e.model_id, e.global_id) e.model_id, e.global_id, e.project_id, t.text,
       encode(sha256(convert_to(t.text, 'UTF8')), 'hex')
  from public.bim_elements e
  cross join lateral (select bim_private.ai_element_text(e.loai_cau_kien, e.ten_cau_kien, e.phan_doan_tang, e.vat_lieu,
                                                          e.thuoc_tinh) as text) t
 order by e.model_id, e.global_id, e.express_id
on conflict do nothing;

-- Worker (service role + worker key): lease up to p_limit pending rows of ready models for 5 minutes (≤ 5 attempts each).
-- Returns {lease, items:[{modelId, globalId, projectId, text, textHash}]}. Rows of removed elements are dropped.
create function public.bim_ai_embedding_next(p_key text, p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lease uuid := gen_random_uuid(); v_items jsonb;
begin
  if auth.uid() is not null then raise exception 'ACCESS_DENIED' using errcode = '42501'; end if;
  if p_key is null or not sxd_bim_appraisal_private.worker_authorized(p_key) then raise exception 'WORKER_DENIED'; end if;
  delete from public.bim_ai_embedding_queue q
   where q.ctid in (select o.ctid from public.bim_ai_embedding_queue o
                     where not exists (select 1 from public.bim_elements e where e.model_id = o.model_id and e.global_id = o.global_id)
                     limit 1000);
  with picked as (
    select q.model_id, q.global_id from public.bim_ai_embedding_queue q
      join public.bim_models m on m.id = q.model_id and m.status = 'ready' and m.deleted_at is null
     where q.embedded_hash is distinct from q.text_hash and q.attempts < 5
       and (q.lease_until is null or q.lease_until < now())
     order by q.updated_at, q.model_id, q.global_id
     limit least(greatest(coalesce(p_limit, 100), 1), 500)
     for update of q skip locked
  ), leased as (
    update public.bim_ai_embedding_queue q set lease = v_lease, lease_until = now() + interval '5 minutes',
      attempts = q.attempts + 1
      from picked where q.model_id = picked.model_id and q.global_id = picked.global_id
    returning q.model_id, q.global_id, q.project_id, q.text, q.text_hash
  )
  select coalesce(jsonb_agg(jsonb_build_object('modelId', l.model_id, 'globalId', l.global_id, 'projectId', l.project_id,
           'text', l.text, 'textHash', l.text_hash) order by l.model_id, l.global_id), '[]'::jsonb)
    into v_items from leased l;
  return jsonb_build_object('lease', v_lease, 'items', v_items);
end $$;

-- Readers: embedding progress of a project {tong, da_nhung, dang_cho, loi}.
create function public.bim_ai_embedding_status(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not (p_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền đọc dữ liệu BIM của dự án %', p_project using errcode = '42501';
  end if;
  return (select jsonb_build_object('tong', count(*),
      'da_nhung', count(*) filter (where q.embedded_hash = q.text_hash),
      'dang_cho', count(*) filter (where q.embedded_hash is distinct from q.text_hash and q.attempts < 5),
      'loi', count(*) filter (where q.embedded_hash is distinct from q.text_hash and q.attempts >= 5))
    from public.bim_ai_embedding_queue q where q.project_id = p_project);
end $$;

revoke all on function public.bim_ai_num(text), public.bim_ai_prop(jsonb, text), public.bim_ai_match(text, text, text),
  public.bim_ai_regex_escape(text), public.bim_ai_fold(text), public.bim_ai_like(text), public.bim_ai_storey_regex(text),
  public.bim_ai_fire_rated(jsonb, text), public.bim_ai_system_text(jsonb),
  public.bim_ai_search_elements(uuid, uuid[], jsonb, integer, integer), public.bim_ai_element_details(uuid, text[], uuid[]),
  public.bim_ai_embedding_next(text, integer), public.bim_ai_embedding_status(uuid) from public, anon;
grant execute on function public.bim_ai_num(text), public.bim_ai_prop(jsonb, text), public.bim_ai_match(text, text, text),
  public.bim_ai_regex_escape(text), public.bim_ai_fold(text), public.bim_ai_like(text), public.bim_ai_storey_regex(text),
  public.bim_ai_fire_rated(jsonb, text), public.bim_ai_system_text(jsonb),
  public.bim_ai_search_elements(uuid, uuid[], jsonb, integer, integer), public.bim_ai_element_details(uuid, text[], uuid[]),
  public.bim_ai_embedding_status(uuid) to authenticated, service_role;
revoke all on function public.bim_ai_embedding_next(text, integer) from authenticated;
grant execute on function public.bim_ai_embedding_next(text, integer) to service_role;
revoke all on function bim_private.ai_element_text(text, text, text, text, jsonb), bim_private.ai_embedding_enqueue()
  from public, anon, authenticated;

-- >>> pgvector ──────────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'vector') then
    raise exception 'BIM_AI_VECTOR_UNAVAILABLE: máy chủ chưa có extension pgvector (vector) cho bim_element_embeddings';
  end if;
end $$;
create extension if not exists vector with schema extensions;
do $$
declare v_schema text;
begin
  select n.nspname into v_schema from pg_catalog.pg_extension x join pg_catalog.pg_namespace n on n.oid = x.extnamespace
   where x.extname = 'vector';
  if v_schema is distinct from 'extensions' then
    raise exception 'BIM_AI_VECTOR_SCHEMA: pgvector đang ở schema %, migration này cần schema extensions', v_schema;
  end if;
end $$;

-- 768-dimension vectors (Vertex text-embedding-004 / text-multilingual-embedding-002) of the queue text.
create table public.bim_element_embeddings (
  model_id uuid not null references public.bim_models(id) on delete cascade,
  global_id varchar(22) not null,
  project_id uuid not null references public.sxd_bim_projects(id) on delete cascade,
  embedding extensions.vector(768) not null,
  text text not null,
  text_hash text not null,
  embedding_model text not null default 'text-embedding-004' check (embedding_model ~ '^[a-z0-9][a-z0-9.@-]{1,80}$'),
  updated_at timestamptz not null default now(),
  primary key (model_id, global_id)
);
comment on table public.bim_element_embeddings is
  'Vector ngữ nghĩa của nhãn IFC, tên, tầng, vật liệu, phân loại và vài thuộc tính nổi bật; dự phòng khi từ khóa không khớp.';
create index bim_element_embeddings_project on public.bim_element_embeddings (project_id, model_id);
create index bim_element_embeddings_hnsw on public.bim_element_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);
alter table public.bim_element_embeddings enable row level security;
create policy bim_element_embeddings_read on public.bim_element_embeddings for select to authenticated
  using (project_id = any ((select bim_private.readable_projects())::uuid[]));
revoke all on public.bim_element_embeddings from public, anon, authenticated;
grant select on public.bim_element_embeddings to authenticated;
grant all on public.bim_element_embeddings to service_role;

-- Worker (service role + worker key): p_rows = [{modelId, globalId, textHash, lease, embedding: number[768], model?}] or
-- [{modelId, globalId, lease, error: 'CODE'}]. A row whose text changed after the lease is skipped (stale).
-- Returns {stored, failed, stale}.
create function public.bim_ai_embedding_store(p_key text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x jsonb; q public.bim_ai_embedding_queue; v_stored integer := 0; v_failed integer := 0; v_stale integer := 0;
begin
  if auth.uid() is not null then raise exception 'ACCESS_DENIED' using errcode = '42501'; end if;
  if p_key is null or not sxd_bim_appraisal_private.worker_authorized(p_key) then raise exception 'WORKER_DENIED'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'BIM_AI_EMBEDDING_INVALID';
  end if;
  for x in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(x) is distinct from 'object' or coalesce(x ->> 'modelId', '') !~ '^[0-9a-f-]{36}$'
       or coalesce(x ->> 'lease', '') !~ '^[0-9a-f-]{36}$' or jsonb_typeof(x -> 'globalId') is distinct from 'string' then
      raise exception 'BIM_AI_EMBEDDING_INVALID';
    end if;
    select * into q from public.bim_ai_embedding_queue
     where model_id = (x ->> 'modelId')::uuid and global_id = x ->> 'globalId' for update;
    if q.model_id is null or q.lease is distinct from (x ->> 'lease')::uuid then
      v_stale := v_stale + 1;
      continue;
    end if;
    if x ? 'error' then
      if coalesce(x ->> 'error', '') !~ '^[A-Z_]{1,100}$' then raise exception 'BIM_AI_EMBEDDING_INVALID'; end if;
      update public.bim_ai_embedding_queue set error_code = x ->> 'error', lease = null, lease_until = null
       where model_id = q.model_id and global_id = q.global_id;
      v_failed := v_failed + 1;
      continue;
    end if;
    if jsonb_typeof(x -> 'embedding') is distinct from 'array' or jsonb_array_length(x -> 'embedding') <> 768
       or exists (select 1 from jsonb_array_elements(x -> 'embedding') v where jsonb_typeof(v) <> 'number')
       or (x ? 'model' and coalesce(x ->> 'model', '') !~ '^[a-z0-9][a-z0-9.@-]{1,80}$') then
      raise exception 'BIM_AI_EMBEDDING_INVALID';
    end if;
    if x ->> 'textHash' is distinct from q.text_hash then
      v_stale := v_stale + 1;
      continue;
    end if;
    insert into public.bim_element_embeddings (model_id, global_id, project_id, embedding, text, text_hash, embedding_model)
    values (q.model_id, q.global_id, q.project_id, (x -> 'embedding')::text::extensions.vector(768), q.text, q.text_hash,
      coalesce(x ->> 'model', 'text-embedding-004'))
    on conflict (model_id, global_id) do update set embedding = excluded.embedding, text = excluded.text,
      text_hash = excluded.text_hash, project_id = excluded.project_id, embedding_model = excluded.embedding_model,
      updated_at = now();
    update public.bim_ai_embedding_queue set embedded_hash = q.text_hash, error_code = null, lease = null, lease_until = null
     where model_id = q.model_id and global_id = q.global_id;
    v_stored := v_stored + 1;
  end loop;
  return jsonb_build_object('stored', v_stored, 'failed', v_failed, 'stale', v_stale);
end $$;

-- p_query_embedding is the vector literal '[0.1,0.2,...]' so PostgREST need not know the vector type.
-- Returns {so_vector_da_co, nguong_tuong_dong, ket_qua:[{model_id, global_id, express_id, ten, loai, tang, vat_lieu,
-- do_tuong_dong, van_ban}]}.
create function public.bim_ai_semantic_search(
  p_project uuid,
  p_query_embedding text,
  p_model_ids uuid[] default null,
  p_limit integer default 20,
  p_min_similarity real default 0.55
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_query extensions.vector(768);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_min real := least(greatest(coalesce(p_min_similarity, 0.55), 0), 1);
  v_result jsonb;
begin
  if p_project is null or not (p_project = any (bim_private.readable_projects())) then
    raise exception 'Không có quyền đọc dữ liệu BIM của dự án %', p_project using errcode = '42501';
  end if;
  v_query := p_query_embedding::extensions.vector(768);
  with hits as (
    select v.model_id, v.global_id, v.text, 1 - (v.embedding operator(extensions.<=>) v_query) as similarity
      from public.bim_element_embeddings v
      join public.bim_models m on m.id = v.model_id and m.deleted_at is null and m.status = 'ready'
     where v.project_id = p_project
       and (p_model_ids is null or cardinality(p_model_ids) = 0 or v.model_id = any (p_model_ids))
     order by v.embedding operator(extensions.<=>) v_query
     limit v_limit * 3
  )
  select jsonb_build_object(
    'so_vector_da_co', (select count(*) from public.bim_element_embeddings v
                         where v.project_id = p_project
                           and (p_model_ids is null or cardinality(p_model_ids) = 0 or v.model_id = any (p_model_ids))),
    'nguong_tuong_dong', v_min,
    'ket_qua', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'model_id', e.model_id,
        'global_id', e.global_id,
        'express_id', e.express_id,
        'ten', e.ten_cau_kien,
        'loai', e.loai_cau_kien,
        'tang', e.phan_doan_tang,
        'vat_lieu', e.vat_lieu,
        'do_tuong_dong', round(h.similarity::numeric, 3),
        'van_ban', left(h.text, 200)
      )) order by h.similarity desc, e.model_id, e.express_id)
      from (select * from hits where similarity >= v_min order by similarity desc limit v_limit) h
      cross join lateral (select * from public.bim_elements x where x.model_id = h.model_id and x.global_id = h.global_id
                           order by x.express_id limit 1) e), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.bim_ai_embedding_store(text, jsonb), public.bim_ai_semantic_search(uuid, text, uuid[], integer, real)
  from public, anon;
revoke all on function public.bim_ai_embedding_store(text, jsonb) from authenticated;
grant execute on function public.bim_ai_embedding_store(text, jsonb) to service_role;
grant execute on function public.bim_ai_semantic_search(uuid, text, uuid[], integer, real) to authenticated, service_role;
-- <<< pgvector ──────────────────────────────────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Upstream: 20261028150000_bim_browser_converter.sql
-- Browser-native (WebAssembly) IFC -> Fragments (.frag) conversion support.
-- Eliminates the requirement for an external Docker worker by allowing authenticated project writers
-- to convert IFC models directly in the browser and persist .frag + extracted bim_elements safely.

drop policy if exists bim_frag_browser_insert on storage.objects;
create policy bim_frag_browser_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bim-models'
    and (storage.foldername(name))[1] = 'frags'
    and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[])
  );

drop policy if exists bim_frag_browser_update on storage.objects;
create policy bim_frag_browser_update on storage.objects for update to authenticated
  using (
    bucket_id = 'bim-models'
    and (storage.foldername(name))[1] = 'frags'
    and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[])
  )
  with check (
    bucket_id = 'bim-models'
    and (storage.foldername(name))[1] = 'frags'
    and (storage.foldername(name))[2] = any ((select bim_private.writable_project_texts())::text[])
  );

create or replace function public.bim_browser_claim_conversion(p_model uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  m public.bim_models;
  v_job uuid := gen_random_uuid();
begin
  select * into m from public.bim_models where id = p_model for update;
  if m.id is null or m.deleted_at is not null then
    raise exception 'Không tìm thấy mô hình cần chuyển đổi';
  end if;
  if auth.uid() is not null and not bim_private.can_write(m.project_id) then
    raise exception 'Không có quyền chuyển đổi mô hình trong dự án này' using errcode = '42501';
  end if;
  if m.status = 'ready' then
    return null;
  end if;
  if m.status = 'processing' and m.heartbeat_at is not null and m.heartbeat_at > now() - interval '90 seconds' then
    return null;
  end if;

  delete from public.bim_elements_staging where model_id = p_model;

  update public.bim_models set
    status = 'processing',
    ma_job = v_job,
    tien_do = 5,
    error_message = null,
    loai_loi = null,
    ngung_thu_luc = null,
    thu_lai_sau = null,
    heartbeat_at = now(),
    so_lan_thu = coalesce(so_lan_thu, 0) + 1
  where id = p_model;

  return v_job;
end $$;

create or replace function public.bim_browser_stage_elements(
  p_model uuid,
  p_job uuid,
  p_elements jsonb,
  p_progress smallint default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  m public.bim_models;
  v_count integer := 0;
begin
  select * into m from public.bim_models where id = p_model;
  if m.id is null then
    raise exception 'Không tìm thấy mô hình %', p_model;
  end if;
  if auth.uid() is not null and not bim_private.can_write(m.project_id) then
    raise exception 'Không có quyền ghi dữ liệu mô hình' using errcode = '42501';
  end if;
  if m.status <> 'processing' or m.ma_job is distinct from p_job then
    raise exception 'Phiên chuyển đổi % không còn giữ mô hình %', p_job, p_model;
  end if;

  if p_elements is not null and jsonb_typeof(p_elements) = 'array' and jsonb_array_length(p_elements) > 0 then
    insert into public.bim_elements_staging (
      job_id, model_id, project_id, express_id, global_id, ten_cau_kien, loai_cau_kien,
      phan_doan_tang, parent_express_id, vat_lieu, the_tich_be_tong, dien_tich,
      dien_tich_van_khuon, chieu_dai, trong_luong, nguon_khoi_luong, thuoc_tinh, hash_noi_dung
    )
    select
      p_job,
      p_model,
      m.project_id,
      (x ->> 'express_id')::integer,
      nullif(x ->> 'global_id', ''),
      nullif(x ->> 'ten_cau_kien', ''),
      coalesce(nullif(x ->> 'loai_cau_kien', ''), 'IFCPRODUCT'),
      nullif(x ->> 'phan_doan_tang', ''),
      nullif(x ->> 'parent_express_id', '')::integer,
      nullif(x ->> 'vat_lieu', ''),
      nullif(x ->> 'the_tich_be_tong', '')::double precision,
      nullif(x ->> 'dien_tich', '')::double precision,
      nullif(x ->> 'dien_tich_van_khuon', '')::double precision,
      nullif(x ->> 'chieu_dai', '')::double precision,
      nullif(x ->> 'trong_luong', '')::double precision,
      case when (x ->> 'nguon_khoi_luong') in ('qto', 'hinh_hoc') then x ->> 'nguon_khoi_luong' else null end,
      case when jsonb_typeof(x -> 'thuoc_tinh') = 'object' then x -> 'thuoc_tinh' else '{}'::jsonb end,
      nullif(x ->> 'hash_noi_dung', '')
    from jsonb_array_elements(p_elements) x
    where (x ->> 'express_id') is not null
    on conflict (job_id, express_id) do update set
      global_id = excluded.global_id,
      ten_cau_kien = excluded.ten_cau_kien,
      loai_cau_kien = excluded.loai_cau_kien,
      phan_doan_tang = excluded.phan_doan_tang,
      parent_express_id = excluded.parent_express_id,
      vat_lieu = excluded.vat_lieu,
      the_tich_be_tong = excluded.the_tich_be_tong,
      dien_tich = excluded.dien_tich,
      dien_tich_van_khuon = excluded.dien_tich_van_khuon,
      chieu_dai = excluded.chieu_dai,
      trong_luong = excluded.trong_luong,
      nguon_khoi_luong = excluded.nguon_khoi_luong,
      thuoc_tinh = excluded.thuoc_tinh,
      hash_noi_dung = excluded.hash_noi_dung;
    get diagnostics v_count = row_count;
  end if;

  update public.bim_models set
    heartbeat_at = now(),
    tien_do = coalesce(least(greatest(p_progress, 0), 99), tien_do)
  where id = p_model and ma_job = p_job;

  return v_count;
end $$;

create or replace function public.bim_browser_complete_conversion(
  p_model uuid,
  p_job uuid,
  p_patch jsonb
) returns public.bim_models
language plpgsql security definer set search_path = '' as $$
declare
  m public.bim_models;
begin
  select * into m from public.bim_models where id = p_model;
  if m.id is null then
    raise exception 'Không tìm thấy mô hình %', p_model;
  end if;
  if auth.uid() is not null and not bim_private.can_write(m.project_id) then
    raise exception 'Không có quyền hoàn tất chuyển đổi mô hình' using errcode = '42501';
  end if;

  select * into m from public.bim_swap_model_elements(p_model, p_job, p_patch);

  if (p_patch ? 'he_thong') or (p_patch ? 'ket_noi') then
    perform public.bim_ket_noi_ghi(
      p_model,
      coalesce(p_patch -> 'he_thong', '[]'::jsonb),
      coalesce(p_patch -> 'ket_noi', '[]'::jsonb),
      false
    );
  end if;

  return m;
end $$;

create or replace function public.bim_browser_fail_conversion(
  p_model uuid,
  p_job uuid,
  p_error text,
  p_kind text default 'transient'
) returns public.bim_models
language plpgsql security definer set search_path = '' as $$
declare
  m public.bim_models;
begin
  select * into m from public.bim_models where id = p_model for update;
  if m.id is null then
    raise exception 'Không tìm thấy mô hình %', p_model;
  end if;
  if auth.uid() is not null and not bim_private.can_write(m.project_id) then
    raise exception 'Không có quyền cập nhật trạng thái mô hình' using errcode = '42501';
  end if;

  delete from public.bim_elements_staging where model_id = p_model and (p_job is null or job_id = p_job);

  update public.bim_models set
    status = 'error',
    error_message = left(coalesce(nullif(btrim(p_error), ''), 'Lỗi chuyển đổi IFC trên trình duyệt'), 500),
    loai_loi = case when p_kind in ('permanent', 'transient') then p_kind else 'transient' end,
    ma_job = null,
    tien_do = 0,
    heartbeat_at = null
  where id = p_model and (p_job is null or ma_job = p_job or status = 'uploaded')
  returning * into m;

  return m;
end $$;

revoke all on function
  public.bim_browser_claim_conversion(uuid),
  public.bim_browser_stage_elements(uuid, uuid, jsonb, smallint),
  public.bim_browser_complete_conversion(uuid, uuid, jsonb),
  public.bim_browser_fail_conversion(uuid, uuid, text, text)
from public, anon;

grant execute on function
  public.bim_browser_claim_conversion(uuid),
  public.bim_browser_stage_elements(uuid, uuid, jsonb, smallint),
  public.bim_browser_complete_conversion(uuid, uuid, jsonb),
  public.bim_browser_fail_conversion(uuid, uuid, text, text)
to authenticated, service_role;

alter function public.bim_swap_model_elements(uuid, uuid, jsonb) set statement_timeout = '300s';
alter function public.bim_ket_noi_ghi(uuid, jsonb, jsonb, boolean) set statement_timeout = '300s';
alter function public.bim_browser_stage_elements(uuid, uuid, jsonb, smallint) set statement_timeout = '300s';
alter function public.bim_browser_complete_conversion(uuid, uuid, jsonb) set statement_timeout = '300s';

create index if not exists bim_elements_5d_cover_idx
  on public.bim_elements (project_id, model_id, loai_cau_kien, coalesce(vat_lieu, ''), coalesce(phan_doan_tang, ''))
  include (global_id, express_id, the_tich_be_tong, dien_tich, chieu_dai, trong_luong, nguon_khoi_luong);

create or replace function public.bim_5d_overview(p_project uuid, p_model_ids uuid[])
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
 set statement_timeout to '120s'
as $function$
declare
  v_result jsonb;
begin
  if p_project is null or coalesce(cardinality(p_model_ids), 0) = 0 then
    return jsonb_build_object('groups', '[]'::jsonb, 'element_total', 0, 'computed_at', now());
  end if;
  if not (p_project = any (bim_private.readable_projects())) then
    return jsonb_build_object('groups', '[]'::jsonb, 'element_total', 0, 'computed_at', now());
  end if;

  with models as (
    select m.id
      from public.bim_models m
     where m.project_id = p_project
       and m.id = any (p_model_ids)
       and m.deleted_at is null
  ), linked as (
    select l.model_id,
           l.global_id,
           bool_and(t.phan_tram_thuc_te is not null) as known,
           min(greatest(0, least(100, t.phan_tram_thuc_te))) / 100.0 as fraction
      from public.bim_schedule_links l
      join models m on m.id = l.model_id
      join public.bim_schedule_tasks t on t.id = l.task_id
     where l.project_id = p_project
     group by l.model_id, l.global_id
  ), groups as (
    select e.model_id,
           e.project_id,
           e.loai_cau_kien,
           coalesce(e.vat_lieu, '') as vat_lieu,
           coalesce(e.phan_doan_tang, '') as phan_doan_tang,
           count(*)::integer as so_luong,
           sum(e.the_tich_be_tong) as tong_the_tich,
           sum(e.dien_tich) as tong_dien_tich,
           sum(e.chieu_dai) as tong_chieu_dai,
           sum(e.trong_luong) as tong_trong_luong,
           bool_or(e.nguon_khoi_luong = 'hinh_hoc') as co_uoc_tinh_hinh_hoc,
           count(*) filter (where e.the_tich_be_tong is null or e.the_tich_be_tong < 0)::integer as thieu_the_tich,
           count(*) filter (where e.dien_tich is null or e.dien_tich < 0)::integer as thieu_dien_tich,
           count(*) filter (where e.chieu_dai is null or e.chieu_dai < 0)::integer as thieu_chieu_dai,
           count(*) filter (where e.trong_luong is null or e.trong_luong < 0)::integer as thieu_trong_luong,
           count(lk.global_id) filter (where lk.known)::integer as lien_ket_tien_do,
           case
             when bool_and(lk.known is true) then jsonb_build_object(
               'm3', case when bool_and(coalesce(e.the_tich_be_tong >= 0 and e.the_tich_be_tong < 'Infinity'::float8, false))
                          then sum(e.the_tich_be_tong * lk.fraction) filter (where lk.known) end,
               'm2', case when bool_and(coalesce(e.dien_tich >= 0 and e.dien_tich < 'Infinity'::float8, false))
                          then sum(e.dien_tich * lk.fraction) filter (where lk.known) end,
               'm',  case when bool_and(coalesce(e.chieu_dai >= 0 and e.chieu_dai < 'Infinity'::float8, false))
                          then sum(e.chieu_dai * lk.fraction) filter (where lk.known) end,
               'kg', case when bool_and(coalesce(e.trong_luong >= 0 and e.trong_luong < 'Infinity'::float8, false))
                          then sum(e.trong_luong * lk.fraction) filter (where lk.known) end,
               'cai', sum(lk.fraction) filter (where lk.known)
             )
           end as hoan_thanh
      from public.bim_elements e
      join models m on m.id = e.model_id
      left join linked lk on lk.model_id = e.model_id and lk.global_id = e.global_id
     where e.project_id = p_project
       and e.model_id = any (p_model_ids)
     group by e.model_id, e.project_id, e.loai_cau_kien, coalesce(e.vat_lieu, ''), coalesce(e.phan_doan_tang, '')
  )
  select jsonb_build_object(
    'groups', coalesce(jsonb_agg(to_jsonb(g) order by g.model_id, g.loai_cau_kien, g.vat_lieu, g.phan_doan_tang), '[]'::jsonb),
    'element_total', coalesce(sum(g.so_luong), 0),
    'computed_at', now()
  )
  into v_result
  from groups g;

  return v_result;
end;
$function$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'bim_%'
      and p.proname not in ('bim_swap_model_elements', 'bim_ket_noi_ghi', 'bim_browser_stage_elements', 'bim_browser_complete_conversion')
  loop
    execute format('alter function %s set statement_timeout = ''120s''', r.sig);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
