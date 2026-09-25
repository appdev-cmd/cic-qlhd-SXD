import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnv(key: string): string {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [k, ...v] = trimmed.split('=');
      if (k.trim() === key) {
        return v.join('=').trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return process.env[key] || '';
}

const token = getEnv('SUPABASE_ACCESS_TOKEN');
const projectId = 'cekaigfnriatarytvymb';

async function executeSql(query: string, label: string) {
  console.log(`Executing ${label}...`);
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Execution error for ${label} (HTTP ${response.status}): ${text}`);
  }

  const result = await response.json();
  console.log(`✓ ${label} executed successfully!`);
  return result;
}

async function main() {
  console.log('====================================================');
  console.log(`TRIỂN KHAI DATABASE LÊN SUPABASE: ${projectId}`);
  console.log('====================================================\n');

  // 1. Áp dụng initial schema
  const schemaPath = path.resolve(__dirname, '../supabase/migrations/20260925000001_initial_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  await executeSql(schemaSql, '1. Initial Schema DDL (10 Bảng quan hệ)');

  // Drop check constraint nếu bảng đã tồn tại từ lần chạy trước
  await executeSql('alter table public.projects drop constraint if exists projects_sla_status_check;', 'Drop old sla_status constraint');

  // 2. Áp dụng seed data
  const seedPath = path.resolve(__dirname, '../supabase/seed.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf-8');
  await executeSql(seedSql, '2. Seed Data (32 Tổ chức, 40 Nhân sự, 26 Dự án)');

  // 3. Kiểm tra dữ liệu nạp
  console.log('\n--- KẾT QUẢ XÁC MINH CƠ SỞ DỮ LIỆU ---');
  const counts = await executeSql(
    `select 
      (select count(*) from public.organizations) as org_count,
      (select count(*) from public.personnel) as personnel_count,
      (select count(*) from public.projects) as project_count,
      (select count(*) from public.appraisal_disciplines) as disc_count,
      (select count(*) from public.ai_compliance_alerts) as alert_count;`,
    '3. Kiểm tra bản ghi'
  );

  console.log(counts);
  console.log('\n🎉 TOÀN BỘ CƠ SỞ DỮ LIỆU SUPABASE ĐÃ ĐƯỢC TẠO VÀ NẠP DỮ LIỆU THÀNH CÔNG 100%!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
