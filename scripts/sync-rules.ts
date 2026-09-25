/**
 * RULES.md là nguồn quy tắc duy nhất cho các AI Assistant. Script sao chép nội dung sang
 * CLAUDE.md, AGENTS.md, GEMINI.md (mỗi công cụ đọc một tên file khác nhau).
 *   pnpm rules:sync           # ghi đè các bản sao
 *   pnpm rules:sync --check   # chỉ kiểm tra (dùng trong CI), lỗi nếu lệch
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './lib/env';

const SOURCE = 'RULES.md';
const TARGETS = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];
const checkOnly = process.argv.includes('--check');

const source = fs.readFileSync(path.join(ROOT_DIR, SOURCE), 'utf-8').replace(/\r\n/g, '\n');
let drift = 0;

for (const target of TARGETS) {
  const file = path.join(ROOT_DIR, target);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n') : '';
  if (current === source) {
    console.log(`  ✓ ${target}`);
    continue;
  }
  if (checkOnly) {
    drift += 1;
    console.log(`  ✗ ${target} lệch với ${SOURCE}`);
  } else {
    fs.writeFileSync(file, source, 'utf-8');
    console.log(`  → Đã đồng bộ ${target}`);
  }
}

if (drift > 0) {
  console.error(`\n${drift} file quy tắc lệch với ${SOURCE}. Sửa ${SOURCE} rồi chạy: pnpm rules:sync`);
  process.exit(1);
}
