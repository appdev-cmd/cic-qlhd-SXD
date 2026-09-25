/**
 * Nạp lại toàn bộ dữ liệu demo từ supabase/seed.sql (XÓA dữ liệu cũ các bảng nghiệp vụ).
 * Sinh lại seed.sql trước bằng: pnpm db:seed:generate
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, withDbClient } from './lib/env';

async function main() {
  const seedSql = fs.readFileSync(path.join(ROOT_DIR, 'supabase', 'seed.sql'), 'utf-8');

  await withDbClient(async (client) => {
    console.log('Đang nạp seed.sql...');
    await client.query('begin');
    try {
      await client.query(seedSql);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }

    const { rows } = await client.query(`
      select
        (select count(*) from public.staff_users) as staff,
        (select count(*) from public.organizations) as organizations,
        (select count(*) from public.personnel) as personnel,
        (select count(*) from public.projects) as projects,
        (select count(*) from public.appraisal_disciplines) as disciplines,
        (select count(*) from public.material_prices) as material_prices,
        (select count(*) from public.holidays) as holidays,
        (select count(*) from public.ai_compliance_alerts) as alerts`);
    console.table(rows[0]);

    const groups = await client.query(
      'select group_type, grade, count(*)::int as n from public.projects group by 1, 2 order by 1, 2'
    );
    console.log('Phân bố Nhóm / Cấp công trình:');
    console.table(groups.rows);
  });
}

main().catch((err) => {
  console.error('Seed thất bại:', err.message || err);
  process.exit(1);
});
