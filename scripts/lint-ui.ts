/**
 * Quét tĩnh vi phạm quy chuẩn UI của dự án (RULES.md / CLAUDE.md).
 *   pnpm lint:ui
 * Thoát với mã 1 nếu có vi phạm. Bỏ qua một dòng bằng chú thích: // lint-ui-ignore
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './lib/env';

interface Rule {
  id: string;
  pattern: RegExp;
  message: string;
  /** Bỏ qua các file khớp (đường dẫn tương đối, dấu /) */
  exclude?: RegExp;
}

const RULES: Rule[] = [
  {
    id: 'native-title',
    // thuộc tính title trên thẻ HTML thường (chữ thường), không áp dụng cho prop của component (chữ hoa)
    pattern: /<[a-z][a-z0-9]*\b[^>]*\stitle=\{?["'`]/,
    message: 'Không dùng thuộc tính HTML title="..." — dùng <Tooltip content="...">.',
  },
  {
    id: 'native-title-expr',
    pattern: /<[a-z][a-z0-9]*\b[^>]*\stitle=\{/,
    message: 'Không dùng thuộc tính HTML title={...} — dùng <Tooltip>.',
  },
  { id: 'native-select', pattern: /<select[\s>]/, message: 'Không dùng <select> native — dùng <SearchableSelect>.' },
  { id: 'date-input', pattern: /type=["']date["']/, message: 'Không dùng <input type="date"> — dùng <DateInput>.' },
  { id: 'number-input', pattern: /type=["']number["']/, message: 'Không dùng <input type="number"> — dùng <NumberInput>.' },
  { id: 'locale-date', pattern: /\.toLocaleDateString\(/, message: 'Không gọi toLocaleDateString() — dùng formatDate().' },
  {
    id: 'router-link',
    pattern: /<Link\s+to=|useNavigate\(\)\s*\(\s*[`'"]\/(projects|dossiers|organizations|personnel)\//,
    message: 'Mở chi tiết thực thể bằng <EntityLink> / useEntityPanel(), không điều hướng toàn trang.',
  },
  {
    id: 'dark-low-opacity',
    pattern: /dark:bg-[a-z]+-(800|900|950)\/(10|20|30|40|50)\b/,
    message: 'Nền dark mode phải full opacity (dark:bg-slate-800/900), không dùng /10–/50.',
  },
  {
    id: 'mock-import',
    pattern: /from ['"](\.\.\/)+data\/mock/,
    message: 'Trang / component không được đọc thẳng dữ liệu mock — dùng hook trong hooks/useData.',
    exclude: /^src\/(data|data-access)\//,
  },
  {
    id: 'select-star-unfiltered',
    pattern: /\.select\(['"]\*['"]\)\s*;/,
    message: "Không select('*') không lọc — thêm điều kiện .eq()/.range().",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(path.join(ROOT_DIR, 'src'));
let violations = 0;

for (const file of files) {
  const rel = path.relative(ROOT_DIR, file).split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes('lint-ui-ignore') || lines[i - 1]?.includes('lint-ui-ignore-next-line')) return;
    for (const rule of RULES) {
      if (rule.exclude?.test(rel)) continue;
      if (rule.pattern.test(line)) {
        violations += 1;
        console.log(`${rel}:${i + 1}  [${rule.id}] ${rule.message}`);
      }
    }
  });
}

if (violations > 0) {
  console.log(`\n✗ ${violations} vi phạm quy chuẩn UI.`);
  process.exit(1);
}
console.log(`✓ Không có vi phạm quy chuẩn UI (${files.length} file).`);
