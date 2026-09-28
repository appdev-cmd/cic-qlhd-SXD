begin;
create function public.read_appraisal_job(job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status',j.state,'attempts',j.attempts,'errorCode',j.error_code)
 from public.appraisal_jobs j join public.appraisal_cases c on c.id=j.case_id
 where j.id=job_id and public.appraisal_has_scope(c.province_id,c.department);
$$;
revoke all on function public.read_appraisal_job(uuid) from public,anon,authenticated;
grant execute on function public.read_appraisal_job(uuid) to appraisal_backend;

create or replace function public.tg_audit_log()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_data jsonb; after_data jsonb; actor text; fields text[];
begin
 select s.id into actor from public.staff_users s where s.auth_user_id=auth.uid() and s.is_active;
 if auth.uid() is not null and actor is null then raise exception 'Unknown audit actor' using errcode='42501'; end if;
 before_data:=case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
 after_data:=case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
 select array_agg(key) into fields from jsonb_each(coalesce(after_data,before_data))
   where before_data->key is distinct from after_data->key;
 insert into public.audit_logs(table_name,record_id,action,old_data,new_data,changed_fields,actor_id)
   values(TG_TABLE_NAME,coalesce(after_data,before_data)->>'id',TG_OP,before_data,after_data,fields,coalesce(actor,'migration'));
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end;
$$;
revoke all on function public.tg_audit_log() from public,anon,authenticated;

create function public.create_appraisal_project(input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; investor public.organizations; result public.projects;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active is true;
 if actor.id is null or actor.role not in ('admin','head_of_department','officer')
   or coalesce(actor.province_id,'')='' or coalesce(actor.department,'')='' then
   raise exception 'Forbidden' using errcode='42501'; end if;
 if length(coalesce(input->>'title','')) not between 3 and 500
   or length(coalesce(input->>'code','')) not between 3 and 100
   or coalesce(input->>'group_type','') not in ('A','B','C','QG')
   or coalesce(input->>'grade','') not in ('I','II','III','IV','DB')
   or (input->>'investment_cost')::numeric<0 or input->>'investment_cost' is null then
   raise exception 'Invalid project' using errcode='22023'; end if;
 if nullif(input->>'investor_id','') is not null then
   select * into investor from public.organizations where id=input->>'investor_id' and province_code=actor.province_id;
   if investor.id is null then raise exception 'Invalid investor' using errcode='42501'; end if;
 end if;
 insert into public.projects(code,title,field,group_type,grade,investment_cost,investor_id,investor_name,
   location_district,province_code,department,stage,procedure_type,status,sla_status,workflow_state)
 values(input->>'code',input->>'title',input->>'field',input->>'group_type',input->>'grade',
   (input->>'investment_cost')::numeric,investor.id,investor.name,input->>'location',actor.province_id,
   actor.department,'bcnckt','BCNCKT','tiep_nhan','tiep_nhan','tiep_nhan') returning * into result;
 return to_jsonb(result);
end;
$$;
revoke all on function public.create_appraisal_project(jsonb) from public,anon,authenticated;
grant execute on function public.create_appraisal_project(jsonb) to appraisal_backend;
commit;
