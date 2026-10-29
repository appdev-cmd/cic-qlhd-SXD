begin;
do $$
declare actor uuid; project uuid; view_id uuid:=gen_random_uuid();blocked boolean;
begin
 select auth.uid() into actor;
 select id into project from public.sxd_bim_projects order by created_at desc limit 1;
 if actor is null or project is null then raise exception 'No scoped BIM test workspace';end if;
 set local role authenticated;
 if not exists(select 1 from public.bim_models where project_id=project and status='ready') then raise exception 'Scoped user cannot read imported models';end if;
 insert into public.bim_saved_views(id,project_id,name,state) values(view_id,project,'RLS transaction test','{"camera":{}}');
 if not exists(select 1 from public.bim_saved_views where id=view_id) then raise exception 'Cannot read own saved view';end if;
 blocked:=false;
 begin
  insert into public.bim_models(project_id,file_name) values(project,'forbidden-direct.ifc');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Direct model registration bypasses lifecycle RPC';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
 if exists(select 1 from public.bim_models where project_id=project) then raise exception 'Foreign identity can read model';end if;
 if exists(select 1 from public.bim_elements where project_id=project) then raise exception 'Foreign identity can read elements';end if;
 if exists(select 1 from public.bim_saved_views where id=view_id) then raise exception 'Foreign identity can read saved view';end if;
 blocked:=false;
 begin
  insert into public.bim_saved_views(project_id,name,state) values(project,'Forbidden','{"camera":{}}');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Foreign identity can write saved view';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.bim_saved_views set name='RLS scoped update' where id=view_id;
 if not exists(select 1 from public.bim_saved_views where id=view_id and name='RLS scoped update') then raise exception 'Scoped update failed';end if;
 reset role;
end $$;
rollback;
select 'BIM RLS: scoped read/write, foreign isolation and controlled model lifecycle passed' as result;
