-- ====================================================================
-- QUY TRÌNH THẨM ĐỊNH (WORKFLOW) & SLA NGÀY LÀM VIỆC — NĐ 217/2026/NĐ-CP (Điều 35–38)
-- Tiếp nhận → Kiểm tra hợp lệ → (Yêu cầu bổ sung — 01 lần) → Thẩm định → Trưởng phòng
-- → Lãnh đạo Sở ký → Phát hành  |  Trả hồ sơ (không thuộc thẩm quyền / không hợp lệ)
-- ====================================================================

-- 1. CỘT QUY TRÌNH TRÊN HỒ SƠ ------------------------------------------------
alter table public.projects
    add column if not exists workflow_state text,
    add column if not exists received_date date,
    add column if not exists supplement_count integer not null default 0,
    add column if not exists extension_count integer not null default 0,
    add column if not exists paused_at date,
    add column if not exists is_appendix_iv boolean not null default false,
    add column if not exists decided_by_commune boolean not null default false,
    add column if not exists submitted_documents jsonb not null default '[]'::jsonb;

update public.projects set workflow_state = case sla_status
    when 'tiep_nhan' then 'tiep_nhan'
    when 'yeu_cau_bo_sung' then 'yeu_cau_bo_sung'
    when 'da_tham_dinh' then 'da_phat_hanh'
    else 'dang_tham_dinh'
end
where workflow_state is null;

update public.projects set supplement_count = 1 where sla_status = 'yeu_cau_bo_sung' and supplement_count = 0;
update public.projects set received_date = submission_date where received_date is null and sla_status <> 'tiep_nhan';

alter table public.projects alter column workflow_state set default 'tiep_nhan';
alter table public.projects alter column workflow_state set not null;

alter table public.projects drop constraint if exists projects_workflow_state_check;
alter table public.projects add constraint projects_workflow_state_check check (workflow_state in (
    'tiep_nhan', 'yeu_cau_bo_sung', 'dang_tham_dinh', 'cho_truong_phong', 'cho_lanh_dao', 'da_phat_hanh', 'tra_ho_so'
));

alter table public.projects drop constraint if exists projects_sla_status_check;
alter table public.projects add constraint projects_sla_status_check
    check (sla_status in ('tiep_nhan', 'dang_tham_dinh', 'yeu_cau_bo_sung', 'da_tham_dinh', 'qua_han', 'tra_ho_so'));

create index if not exists idx_projects_workflow on public.projects(workflow_state);

-- 2. LỊCH SỬ CHUYỂN BƯỚC ------------------------------------------------------
create table if not exists public.workflow_transitions (
    id bigserial primary key,
    project_id text not null references public.projects(id) on delete cascade,
    action text not null,
    from_state text not null,
    to_state text not null,
    note text,
    actor_id text not null default 'system',
    created_at timestamptz not null default now()
);

create index if not exists idx_workflow_transitions_project on public.workflow_transitions(project_id, created_at desc);
alter table public.workflow_transitions enable row level security;
drop policy if exists "dev_open_access" on public.workflow_transitions;
create policy "dev_open_access" on public.workflow_transitions for all to anon, authenticated using (true) with check (true);
grant select, insert on public.workflow_transitions to anon, authenticated;
grant usage, select on sequence public.workflow_transitions_id_seq to anon, authenticated;

create or replace view public.workflow_transitions_resolved with (security_invoker = true) as
select t.*, coalesce(s.full_name, 'Hệ thống') as actor_name, s.title as actor_title
from public.workflow_transitions t
left join public.staff_users s on s.id = t.actor_id;

grant select on public.workflow_transitions_resolved to anon, authenticated;

-- 3. HÀM NGÀY LÀM VIỆC (đồng bộ với src/lib/sla.ts) -------------------------
create or replace function public.is_working_day(p_date date) returns boolean
language sql stable as $$
    select extract(isodow from p_date) < 6
       and not exists (select 1 from public.holidays h where h.holiday_date = p_date and h.kind <> 'lam_bu')
$$;

create or replace function public.add_working_days(p_start date, p_days integer) returns date
language plpgsql stable as $$
declare
    d date := p_start;
    remaining integer := p_days;
begin
    while remaining > 0 loop
        d := d + 1;
        if public.is_working_day(d) then
            remaining := remaining - 1;
        end if;
    end loop;
    return d;
end $$;

create or replace function public.working_days_between(p_from date, p_to date) returns integer
language sql stable as $$
    select case
        when p_to = p_from then 0
        when p_to > p_from then (select count(*)::int from generate_series(p_from + 1, p_to, interval '1 day') g(d) where public.is_working_day(g.d::date))
        else -(select count(*)::int from generate_series(p_to + 1, p_from, interval '1 day') g(d) where public.is_working_day(g.d::date))
    end
$$;

-- 4. ĐỒNG BỘ TRẠNG THÁI SLA THEO QUY TRÌNH + HẠN CHÓT ---------------------------
create or replace function public.derive_sla_status(p_state text, p_deadline date) returns text
language sql stable as $$
    select case
        when p_state = 'tiep_nhan' then 'tiep_nhan'
        when p_state = 'yeu_cau_bo_sung' then 'yeu_cau_bo_sung'
        when p_state = 'da_phat_hanh' then 'da_tham_dinh'
        when p_state = 'tra_ho_so' then 'tra_ho_so'
        when p_deadline < current_date then 'qua_han'
        else 'dang_tham_dinh'
    end
$$;

create or replace function public.refresh_sla_status() returns integer
language plpgsql security definer set search_path = public as $$
declare
    affected integer;
begin
    perform set_config('app.skip_audit', 'on', true);
    update public.projects
    set sla_status = public.derive_sla_status(workflow_state, deadline)
    where sla_status is distinct from public.derive_sla_status(workflow_state, deadline);
    get diagnostics affected = row_count;
    return affected;
end $$;

-- 5. RPC CHUYỂN BƯỚC QUY TRÌNH (kiểm tra trạng thái hợp lệ & vai trò) ------------
create or replace function public.transition_dossier(
    p_project_id text,
    p_action text,
    p_note text default null,
    p_deadline date default null,
    p_assignee_staff_id text default null
) returns public.projects
language plpgsql security definer set search_path = public as $$
declare
    v_project public.projects;
    v_actor text;
    v_role text;
    v_headers jsonb;
    v_to text;
    v_from text;
    v_allowed_from text[];
    v_allowed_roles text[];
    v_assignee public.staff_users;
begin
    begin
        v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
        v_headers := null;
    end;
    v_actor := coalesce(v_headers ->> 'x-actor-id', 'system');
    select role into v_role from public.staff_users where id = v_actor;

    select * into v_project from public.projects where id = p_project_id for update;
    if not found then
        raise exception 'Không tìm thấy hồ sơ %', p_project_id;
    end if;
    v_from := v_project.workflow_state;

    case p_action
        when 'xac_nhan_hop_le' then v_allowed_from := array['tiep_nhan']; v_to := 'dang_tham_dinh'; v_allowed_roles := array['officer', 'head_of_department'];
        when 'yeu_cau_bo_sung' then v_allowed_from := array['tiep_nhan', 'dang_tham_dinh']; v_to := 'yeu_cau_bo_sung'; v_allowed_roles := array['officer', 'head_of_department'];
        when 'nhan_bo_sung' then v_allowed_from := array['yeu_cau_bo_sung']; v_to := 'dang_tham_dinh'; v_allowed_roles := array['officer', 'head_of_department'];
        when 'trinh_truong_phong' then v_allowed_from := array['dang_tham_dinh']; v_to := 'cho_truong_phong'; v_allowed_roles := array['officer'];
        when 'tra_lai_chuyen_vien' then v_allowed_from := array['cho_truong_phong']; v_to := 'dang_tham_dinh'; v_allowed_roles := array['head_of_department'];
        when 'trinh_lanh_dao' then v_allowed_from := array['cho_truong_phong']; v_to := 'cho_lanh_dao'; v_allowed_roles := array['head_of_department'];
        when 'tra_lai_truong_phong' then v_allowed_from := array['cho_lanh_dao']; v_to := 'cho_truong_phong'; v_allowed_roles := array['director'];
        when 'ky_phat_hanh' then v_allowed_from := array['cho_lanh_dao']; v_to := 'da_phat_hanh'; v_allowed_roles := array['director'];
        when 'tra_ho_so' then v_allowed_from := array['tiep_nhan', 'yeu_cau_bo_sung']; v_to := 'tra_ho_so'; v_allowed_roles := array['officer', 'head_of_department', 'director'];
        when 'gia_han' then v_allowed_from := array['dang_tham_dinh', 'cho_truong_phong', 'cho_lanh_dao']; v_to := v_project.workflow_state; v_allowed_roles := array['head_of_department', 'director'];
        when 'phan_cong' then v_allowed_from := array['tiep_nhan', 'yeu_cau_bo_sung', 'dang_tham_dinh', 'cho_truong_phong']; v_to := v_project.workflow_state; v_allowed_roles := array['head_of_department', 'director'];
        else raise exception 'Thao tác không hợp lệ: %', p_action;
    end case;

    if not (v_project.workflow_state = any (v_allowed_from)) then
        raise exception 'Không thể thực hiện "%" khi hồ sơ đang ở bước "%"', p_action, v_project.workflow_state;
    end if;
    if coalesce(v_role, '') <> 'admin' and not (coalesce(v_role, '') = any (v_allowed_roles)) then
        raise exception 'Vai trò hiện tại không được phép thực hiện thao tác này';
    end if;

    if p_action = 'yeu_cau_bo_sung' and v_project.supplement_count >= 1 then
        raise exception 'Theo Điều 36 NĐ 217/2026/NĐ-CP, cơ quan thẩm định chỉ được yêu cầu bổ sung hồ sơ 01 lần';
    end if;
    if p_action = 'gia_han' and v_project.extension_count >= 1 then
        raise exception 'Hồ sơ đã được gia hạn 01 lần — không được gia hạn thêm';
    end if;
    if p_action in ('xac_nhan_hop_le', 'nhan_bo_sung', 'gia_han') and p_deadline is null then
        raise exception 'Thiếu hạn trả kết quả mới cho thao tác "%"', p_action;
    end if;
    if p_action in ('yeu_cau_bo_sung', 'tra_ho_so', 'tra_lai_chuyen_vien', 'tra_lai_truong_phong', 'gia_han') and coalesce(trim(p_note), '') = '' then
        raise exception 'Vui lòng nhập lý do / nội dung cho thao tác này';
    end if;

    if p_action = 'phan_cong' then
        select * into v_assignee from public.staff_users where id = p_assignee_staff_id and role = 'officer';
        if not found then
            raise exception 'Cán bộ được phân công không hợp lệ';
        end if;
    end if;

    update public.projects set
        workflow_state = v_to,
        received_date = case when p_action in ('xac_nhan_hop_le', 'nhan_bo_sung') then current_date else received_date end,
        deadline = coalesce(p_deadline, deadline),
        supplement_count = supplement_count + case when p_action = 'yeu_cau_bo_sung' then 1 else 0 end,
        extension_count = extension_count + case when p_action = 'gia_han' then 1 else 0 end,
        paused_at = case when p_action = 'yeu_cau_bo_sung' then current_date when p_action = 'nhan_bo_sung' then null else paused_at end,
        lead_reviewer_staff_id = case when p_action = 'phan_cong' then v_assignee.id else lead_reviewer_staff_id end,
        lead_reviewer_name = case when p_action = 'phan_cong' then v_assignee.full_name else lead_reviewer_name end,
        department = case when p_action = 'phan_cong' then v_assignee.department else department end,
        sla_status = public.derive_sla_status(v_to, coalesce(p_deadline, deadline)),
        status = public.derive_sla_status(v_to, coalesce(p_deadline, deadline))
    where id = p_project_id
    returning * into v_project;

    insert into public.workflow_transitions (project_id, action, from_state, to_state, note, actor_id)
    values (p_project_id, p_action, v_from, v_to, p_note, v_actor);

    return v_project;
end $$;

grant execute on function public.transition_dossier(text, text, text, date, text) to anon, authenticated;
grant execute on function public.refresh_sla_status() to anon, authenticated;
grant execute on function public.add_working_days(date, integer) to anon, authenticated;
grant execute on function public.working_days_between(date, date) to anon, authenticated;

select public.refresh_sla_status();
