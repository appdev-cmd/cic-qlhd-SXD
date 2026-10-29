create or replace function public.sxd_bim_import_project(p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.profiles;p public.projects;
begin
 select * into u from public.profiles where id=auth.uid() and is_active;
 if u.id is null or u.role not in ('officer','head_of_department','admin') then raise exception 'Forbidden' using errcode='42501';end if;
 select * into p from public.projects where code=p_code and province_code=u.province_id and department=u.department;
 if p.id is null then
  insert into public.projects(code,title,field,group_type,grade,investment_cost,procedure_type,location_district,province_code,department,appraisal_data,sla_status,investment_form)
   values(p_code,p_name,'Mô hình BIM nhập',null,null,null,'BIM','Chưa xác nhận từ hồ sơ',u.province_id,u.department,
    jsonb_build_object('bim_import',true,'source','qa-si-xd','metadata_status','unverified'),'tiep_nhan','khac') returning * into p;
 end if;
 return public.sxd_bim_workspace(p.id)||jsonb_build_object('targetProjectId',p.id,'name',p.title);
end $$;