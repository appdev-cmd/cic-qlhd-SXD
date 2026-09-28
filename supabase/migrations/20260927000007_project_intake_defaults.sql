begin;
-- Unknown intake fields must not imply a compliance result or an agreed deadline.
alter table public.projects alter column deadline drop not null;
alter table public.projects alter column planning_compliance drop not null;
alter table public.projects alter column planning_compliance drop default;
alter table public.projects alter column standard_compliance drop not null;
alter table public.projects alter column standard_compliance drop default;
alter table public.projects alter column fire_safety_status drop not null;
alter table public.projects alter column fire_safety_status drop default;
alter table public.projects alter column estimated_savings drop not null;
alter table public.projects alter column estimated_savings drop default;

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
   values(TG_TABLE_NAME,coalesce(after_data,before_data)->>'id',lower(TG_OP),before_data,after_data,fields,coalesce(actor,'migration'));
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end;
$$;
revoke all on function public.tg_audit_log() from public,anon,authenticated;
commit;
