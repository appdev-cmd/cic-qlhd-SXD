/**
 * UI Rules Linter for CIC ERP
 * Quét tĩnh tự động để phát hiện các vi phạm quy chuẩn UI/UX cốt lõi:
 * 1. Thuộc tính native `title="..."` trên thẻ HTML JSX (như <button>, <div>, <span>, <a>) -> BẮT BUỘC dùng `<Tooltip content="..." />`
 * 2. `<input type="date">` -> BẮT BUỘC dùng `<DateInput />`
 * 3. `.toLocaleDateString()` -> BẮT BUỘC dùng `formatDate()`
 */

const fs = require('fs');
const path = require('path');

const SCAN_DIRS = [
  path.join('apps', 'web', 'src', 'components'),
  path.join('apps', 'web', 'src', 'app'),
  path.join('apps', 'web', 'src', 'panels'),
  'components',
  'pages',
  'panels'
];
const IGNORE_FILES = [
  'Tooltip.tsx',
  'SearchableSelect.tsx',
  'DateInput.tsx',
  'NumberInput.tsx',
  'CurrencyInput.tsx'
];

let totalFiles = 0;
let violations = [];

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx'))) {
      if (IGNORE_FILES.includes(entry.name)) continue;
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath) {
  totalFiles++;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Bỏ qua dòng comment
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

    // 1. Kiểm tra title="..." trên thẻ HTML native (bắt đầu bằng chữ thường <tag)
    // Loại trừ <title> tag của SVG/HTML, document.title, hoặc Component viết hoa <Modal title=...>
    const hasNativeHtmlTagWithTitle =
      /<([a-z][a-z0-9-]*)\b[^>]*\stitle=(?:["'{`][^"'{`]+["'}`])/.test(line) &&
      !/<title[\s>]/i.test(line) &&
      !/document\.title/i.test(line);

    // Kiểm tra trường hợp thuộc tính title nằm ở dòng sau trong thẻ mở native tag đa dòng
    // (tìm ngược lại dòng mở thẻ gần nhất xem có phải thẻ chữ thường không)
    let isNativeTagChild = false;
    if (/^\s*title=(?:["'{`][^"'{`]+["'}`])/.test(line)) {
      for (let prevIdx = index - 1; prevIdx >= Math.max(0, index - 8); prevIdx--) {
        const prevLine = lines[prevIdx].trim();
        const tagMatch = prevLine.match(/<([A-Za-z0-9-]+)/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          // Nếu thẻ bắt đầu bằng chữ thường thì là HTML native tag
          if (/^[a-z]/.test(tagName) && tagName !== 'title') {
            isNativeTagChild = true;
          }
          break;
        }
      }
    }

    if (hasNativeHtmlTagWithTitle || isNativeTagChild) {
      // Bỏ qua nếu là SVG title tag
      if (!line.includes('<title>') && !line.includes('</title>')) {
        violations.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
          type: 'TOOLTIP_TITLE_VIOLATION',
          message: '❌ Dùng thuộc tính native `title="..."` trên thẻ HTML -> BẮT BUỘC đổi sang `<Tooltip content="..." placement="...">` từ components/ui/Tooltip.tsx'
        });
      }
    }

    // 2. Kiểm tra input type="date"
    if (/<input[^>]*type=["'](?:date|datetime-local)["']/i.test(line)) {
      // Cho phép nếu là hidden picker trong DateInput / Datetime picker tùy biến
      if (!line.includes('sr-only') && !line.includes('opacity-0') && !line.includes('hidden')) {
        violations.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
          type: 'DATE_INPUT_VIOLATION',
          message: '❌ Dùng `<input type="date">` native -> BẮT BUỘC đổi sang `<DateInput>` từ components/ui/DateInput.tsx'
        });
      }
    }

    // 3. Kiểm tra toLocaleDateString()
    if (/\.toLocaleDateString\(/i.test(line)) {
      violations.push({
        file: filePath,
        line: lineNum,
        code: trimmed,
        type: 'DATE_FORMAT_VIOLATION',
        message: '❌ Dùng `toLocaleDateString()` trực tiếp -> BẮT BUỘC đổi sang `formatDate()` từ utils/formatters.ts'
      });
    }
  });
}

console.log('===========================================================');
console.log('🔍 BẮT ĐẦU QUÉT TĨNH QUY CHUẨN UI (UI RULES LINTER)');
console.log('===========================================================');

const projectRoot = path.resolve(__dirname, '..');
for (const dir of SCAN_DIRS) {
  walkDir(path.join(projectRoot, dir));
}

console.log(`📁 Đã quét ${totalFiles} files React trong [${SCAN_DIRS.join(', ')}]\n`);

if (violations.length === 0) {
  console.log('✅ XUẤT SẮC! Toàn bộ codebase 100% tuân thủ các quy chuẩn UI:');
  console.log('   - 100% Tooltip dùng component <Tooltip>');
  console.log('   - 100% Date Picker dùng <DateInput>');
  console.log('   - 100% Format ngày dùng utils/formatters.ts\n');
  process.exit(0);
} else {
  console.log(`⚠️ Phát hiện ${violations.length} điểm cần lưu ý về quy chuẩn UI:\n`);

  const grouped = {};
  for (const v of violations) {
    const rel = path.relative(projectRoot, v.file);
    if (!grouped[rel]) grouped[rel] = [];
    grouped[rel].push(v);
  }

  for (const [relFile, items] of Object.entries(grouped)) {
    console.log(`📄 [${relFile}]:`);
    for (const item of items) {
      console.log(`   Dòng ${item.line}: ${item.message}`);
      console.log(`   > ${item.code}\n`);
    }
  }

  console.log('===========================================================');
  console.log('💡 Hướng dẫn khắc phục nhanh:');
  console.log('   1. Tooltip: Thay `title="X"` bằng `<Tooltip content="X">...</Tooltip>`');
  console.log('   2. Date Picker: Thay `<input type="date" />` bằng `<DateInput />`');
  console.log('   3. Date Format: Thay `.toLocaleDateString()` bằng `formatDate()`');
  console.log('===========================================================\n');

  if (process.argv.includes('--strict')) {
    process.exit(1);
  }
  process.exit(0);
}
