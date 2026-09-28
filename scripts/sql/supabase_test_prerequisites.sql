-- Only for isolated PostgreSQL baseline tests.
-- These Auth/Storage prerequisite stubs do not replace a Supabase installation.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,name text,bucket_id text references storage.buckets(id),owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1];
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)];
$$;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
