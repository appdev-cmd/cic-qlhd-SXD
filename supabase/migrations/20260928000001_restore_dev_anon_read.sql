-- ====================================================================
-- KHÔI PHỤC QUYỀN ĐỌC CHO ROLE ANON TRONG MÔI TRƯỜNG DEV / DEMO
-- Giải quyết lỗi "permission denied for table projects" khi chạy client Web
-- qua anon key mà chưa đăng nhập Supabase Auth.
-- ====================================================================

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Tạo policy SELECT cho anon trên toàn bộ bảng trong schema public
do $$
declare
    t text;
begin
    for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('drop policy if exists "anon_dev_read" on public.%I', t);
        execute format('create policy "anon_dev_read" on public.%I for select to anon using (true)', t);
    end loop;
end $$;
