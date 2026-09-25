-- ====================================================================
-- CHẾ ĐỘ PHÁT TRIỂN: MỞ QUYỀN TRUY CẬP (ANON + AUTHENTICATED)
-- Giai đoạn phát triển dùng 100% dữ liệu demo, chưa có đăng nhập.
-- ⚠️ BẮT BUỘC thay bằng RLS theo vai trò / phòng ban / tỉnh trước khi
--    nhập dữ liệu hồ sơ thật (xem implementation_plan.md — GĐ 6).
-- Thay thế script scripts/update_rls.ts (đã xóa) bằng migration tái lập được.
-- ====================================================================

do $$
declare
    t text;
begin
    foreach t in array array[
        'organizations', 'personnel', 'projects', 'appraisal_disciplines', 'appraisal_checklists',
        'ai_compliance_alerts', 'project_documents', 'staff_users', 'material_prices', 'holidays',
        'audit_logs', 'ai_logs'
    ] loop
        -- Dọn các policy cũ do script update_rls.ts / migration khởi tạo tạo ra
        execute format('drop policy if exists "Allow read %1$s" on public.%1$I', t);
        execute format('drop policy if exists "dev_open_access" on public.%1$I', t);
        execute format(
            'create policy "dev_open_access" on public.%1$I for all to anon, authenticated using (true) with check (true)', t);
    end loop;
end $$;

-- Tên policy cũ do update_rls.ts tạo không theo mẫu trên
drop policy if exists "Allow read disciplines" on public.appraisal_disciplines;
drop policy if exists "Allow read checklists" on public.appraisal_checklists;
drop policy if exists "Allow read alerts" on public.ai_compliance_alerts;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
