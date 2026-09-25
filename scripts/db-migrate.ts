/**
 * Áp dụng các migration trong supabase/migrations theo thứ tự tên file.
 * Theo dõi migration đã chạy trong bảng public.schema_migrations (mỗi file chạy 1 lần, trong transaction).
 *
 *   pnpm db:migrate            # chạy migration mới
 *   pnpm db:migrate --status   # chỉ liệt kê trạng thái
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, withDbClient } from './lib/env';

const MIGRATIONS_DIR = path.join(ROOT_DIR, 'supabase', 'migrations');
const statusOnly = process.argv.includes('--status');

async function main() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await withDbClient(async (client) => {
    await client.query(`
      create table if not exists public.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )`);

    const { rows } = await client.query<{ version: string }>('select version from public.schema_migrations');
    const applied = new Set(rows.map((r) => r.version));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file}`);
        continue;
      }
      if (statusOnly) {
        console.log(`  … ${file} (chưa áp dụng)`);
        continue;
      }

      console.log(`  → Đang áp dụng ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into public.schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        console.log(`  ✓ ${file}`);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} thất bại: ${(err as Error).message}`);
      }
    }
  });

  console.log(statusOnly ? '\nĐã liệt kê trạng thái migration.' : '\nHoàn tất migration.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
