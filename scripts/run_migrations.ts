import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hàm đọc biến từ file .env
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

async function runMigrations() {
  const connectionString = getEnv('DIRECT_URL') || getEnv('DATABASE_URL');
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL not found in .env');
  }

  console.log('Connecting to Supabase PostgreSQL at aws-0-ap-southeast-1.pooler.supabase.com...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✓ Successfully connected to Supabase PostgreSQL Database!\n');

    // 1. Chạy Initial Schema
    const schemaPath = path.resolve(__dirname, '../supabase/migrations/20260925000001_initial_schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('Executing 20260925000001_initial_schema.sql...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(schemaSql);
      console.log('✓ Initial schema created successfully!\n');
    }

    // 2. Chạy Seed Data
    const seedPath = path.resolve(__dirname, '../supabase/seed.sql');
    if (fs.existsSync(seedPath)) {
      console.log('Executing seed.sql (32 Organizations, 40 Personnel, 26 Projects)...');
      const seedSql = fs.readFileSync(seedPath, 'utf-8');
      await client.query(seedSql);
      console.log('✓ Seed data imported successfully!\n');
    }

    // 3. Đếm kiểm tra bản ghi
    console.log('--- KIỂM TRA DỮ LIỆU ĐÃ NẠP TRÊN SUPABASE ---');
    const orgCount = await client.query('select count(*) from public.organizations;');
    console.log(`- Bảng organizations (Tổ chức tham gia): ${orgCount.rows[0].count} bản ghi`);

    const perCount = await client.query('select count(*) from public.personnel;');
    console.log(`- Bảng personnel (Cá nhân hành nghề): ${perCount.rows[0].count} bản ghi`);

    const projCount = await client.query('select count(*) from public.projects;');
    console.log(`- Bảng projects (Dự án thẩm định): ${projCount.rows[0].count} bản ghi`);

    const discCount = await client.query('select count(*) from public.appraisal_disciplines;');
    console.log(`- Bảng appraisal_disciplines (Bộ môn thẩm định): ${discCount.rows[0].count} bản ghi`);

    const alertCount = await client.query('select count(*) from public.ai_compliance_alerts;');
    console.log(`- Bảng ai_compliance_alerts (Cảnh báo AI): ${alertCount.rows[0].count} bản ghi`);

    console.log('\n✓ Toàn bộ cấu trúc và dữ liệu đã được triển khai lên Supabase hoàn tất 100%!');
  } catch (err: any) {
    console.error('Migration failed:', err.message || err);
    throw err;
  } finally {
    await client.end();
  }
}

runMigrations().catch(() => process.exit(1));
