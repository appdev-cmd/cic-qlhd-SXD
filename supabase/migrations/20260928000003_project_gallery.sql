begin;
alter table public.projects add column if not exists images_revision integer not null default 1;
create or replace function public.save_project_images(project_id text, expected integer, new_images jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; result public.projects;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active;
 if actor.id is null or actor.role not in ('admin','head_of_department','officer') then
  raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(new_images)<>'array' or jsonb_array_length(new_images)>200 then
  raise exception 'Invalid gallery' using errcode='22023'; end if;
 update public.projects p set images=new_images,images_revision=images_revision+1
 where p.id=project_id and p.images_revision=expected and public.app_has_scope(p.province_code,p.department)
 returning * into result;
 if result.id is null then raise exception 'Gallery changed or forbidden' using errcode='40001'; end if;
 return jsonb_build_object('images',result.images,'revision',result.images_revision);
end; $$;
revoke all on function public.save_project_images(text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_project_images(text,integer,jsonb) to appraisal_backend;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('appraisal-project-images','appraisal-project-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create or replace function public.project_image_access(project_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p where p.id=project_id and public.app_has_scope(p.province_code,p.department));
$$;
revoke all on function public.project_image_access(text) from public,anon;
grant execute on function public.project_image_access(text) to authenticated;
create policy project_image_read on storage.objects for select to authenticated
 using(bucket_id='appraisal-project-images' and public.project_image_access((storage.foldername(name))[1]));
create policy project_image_insert on storage.objects for insert to authenticated
 with check(bucket_id='appraisal-project-images' and public.project_image_access((storage.foldername(name))[1])
 and exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('officer','head_of_department','admin')));
create policy project_image_cleanup on storage.objects for delete to authenticated
 using(bucket_id='appraisal-project-images' and owner_id=auth.uid()::text and public.project_image_access((storage.foldername(name))[1]));
commit;
