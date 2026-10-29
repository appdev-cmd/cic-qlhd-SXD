create function public.sxd_bim_ai_log(p_project uuid,p_question text,p_answer text,p_model text) returns text
language plpgsql security definer set search_path='' as $$
declare target text; run text:=gen_random_uuid()::text;
begin
 if not sxd_bim_document_private.project_access(p_project) then raise exception 'Forbidden' using errcode='42501';end if;
 select target_project_id into target from public.sxd_bim_projects where id=p_project;
 insert into public.ai_logs(project_id,feature,input_text,output_text,model,prompt_version,actor_id)
 values(target,'bim_assistant',left(p_question,4000),left(p_answer,20000),p_model,'sxd-bim-v1',auth.uid()::text);
 insert into public.audit_logs(table_name,record_id,action,new_data,changed_fields,actor_id)
 values('projects',target,'update',jsonb_build_object('name','Trợ lý BIM','bim_action','assistant','actor',
  (select full_name from public.profiles where id=auth.uid())),array['bim','ai'],auth.uid()::text);
 return run;
end $$;
revoke all on function public.sxd_bim_ai_log(uuid,text,text,text) from public,anon;
grant execute on function public.sxd_bim_ai_log(uuid,text,text,text) to authenticated;
