-- BIM imports are model workspaces, not verified appraisal metadata.
alter table public.projects alter column group_type drop not null;
alter table public.projects alter column grade drop not null;
alter table public.projects alter column investment_cost drop not null;
create function public.sxd_bim_import_project(p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.profiles;p public.projects;
begin
 select * into u from public.profiles where id=auth.uid() and is_active;
 if u.id is null or u.role not in ('officer','head_of_department','admin') then raise exception 'Forbidden' using errcode='42501';end if;
 select * into p from public.projects where code=p_code and province_code=u.province_id and department=u.department;
 if p.id is null then
  insert into public.projects(code,title,field,group_type,grade,investment_cost,procedure_type,location_district,province_code,department,appraisal_data)
   values(p_code,p_name,'Mô hình BIM nhập',null,null,null,'BIM','Chưa xác nhận từ hồ sơ',u.province_id,u.department,
    jsonb_build_object('bim_import',true,'source','qa-si-xd','metadata_status','unverified')) returning * into p;
 end if;
 return public.sxd_bim_workspace(p.id)||jsonb_build_object('targetProjectId',p.id,'name',p.title);
end $$;
revoke all on function public.sxd_bim_import_project(text,text) from public,anon;
grant execute on function public.sxd_bim_import_project(text,text) to authenticated;
create function public.sxd_bim_catalog() returns table(target_project_id text,name text,model_count bigint)
language sql stable security invoker set search_path='' as $$
 select p.target_project_id,p.name,count(m.id) from public.sxd_bim_projects p
 join public.bim_models m on m.project_id=p.id and m.deleted_at is null and m.status='ready'
 group by p.target_project_id,p.name order by count(m.id) desc,p.name
$$;
revoke all on function public.sxd_bim_catalog() from public,anon;
grant execute on function public.sxd_bim_catalog() to authenticated;
create function bim_private.sxd_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 project uuid;target text;label text;
begin
 if auth.uid() is null then return coalesce(new,old);end if;
 begin project:=coalesce(data->>'project_id',data->>'ma_du_an')::uuid;exception when invalid_text_representation then return coalesce(new,old);end;
 if project is null and data->>'model_id' is not null then select m.project_id into project from public.bim_models m where m.id=(data->>'model_id')::uuid;end if;
 if project is null then return coalesce(new,old);end if;
 if not sxd_bim_document_private.project_access(project) then raise exception 'Forbidden' using errcode='42501';end if;
 select b.target_project_id into target from public.sxd_bim_projects b where b.id=project;
 label:=coalesce(data->>'file_name',data->>'title',data->>'name',data->>'ten','Dữ liệu BIM');
 insert into public.audit_logs(table_name,record_id,action,new_data,changed_fields,actor_id)
 values('projects',target,lower(tg_op),jsonb_build_object('name',label,'bim_action',tg_table_name,'actor',
  (select u.full_name from public.profiles u where u.id=auth.uid())),array['bim'],auth.uid()::text);
 return coalesce(new,old);
end $$;
revoke all on function bim_private.sxd_audit() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['bim_models','bim_issues','bim_saved_views','bim_tien_do_cong_viec','bim_don_gia','facility_assets','facility_work_orders'] loop
  if to_regclass('public.'||t) is not null then execute format('create trigger sxd_bim_audit after insert or update or delete on public.%I for each row execute function bim_private.sxd_audit()',t);end if;
 end loop;
end $$;
