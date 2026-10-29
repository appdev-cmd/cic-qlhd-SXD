import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

// Static checks for the UI rules in CLAUDE.md and docs/UI_DESIGN_SYSTEM.md.
// Each allowlist entry is a reviewed exception. Errors fail CI; warnings are counted
// so they can be burned down. Warnings are errors by default; --lenient reports them only as counts.
const ALLOW = {
  overlay: ['src/components/ui/Modal.tsx', 'src/components/SlidePanelStack.tsx'],
  table: [
    // Port adapter preserves source cells and implements persisted resize/sort via useColumnResize/useFilterState.
    'src/features/bim-suite/adapters/controls.tsx',
    'src/components/ui/DataTable.tsx',
    'src/components/appraisal/DossierGrid.tsx',
    'src/components/MasterTable.tsx',
  ],
  // App frame: menu, topbar, quick search and deadline bell navigate between pages.
  navigation: [
    'src/layouts/AppLayout.tsx',
    'src/App.tsx',
    'src/components/layout/Sidebar.tsx',
    'src/components/layout/CommandPalette.tsx',
    'src/components/layout/DeadlineBell.tsx',
    // Help button opens the in-app user guide page.
    'src/components/layout/Topbar.tsx',
    // First-run quick start buttons open the lists and guide sections they describe.
    'src/components/dashboard/QuickStart.tsx',
    // Dashboard drill-down opens the list filtered by scope/SLA.
    'src/components/dashboard/RoleOverview.tsx',
  ],
  // Glassmorphism tooltip prescribed by the Universal Tooltip rule.
  translucent: ['src/components/ui/Tooltip.tsx'],
  // Formatting helpers own the locale call.
  locale: ['src/lib/utils.ts', 'src/components/ui/NumberInput.tsx'],
};
const STRICT = !process.argv.includes('--lenient');
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
const normalize = (file) => file.split(sep).join('/');
const unquote = (value) => (value || '').replace(/^\{?\s*['"`]?|['"`]?\s*\}?$/g, '');
let errors = 0;
let warnings = 0;
const warningsByFile = new Map();

for (const file of files('src')) {
  const path = normalize(file);
  if (path.endsWith('.gen.ts')) continue;
  const allowed = (rule) => ALLOW[rule].includes(path);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const where = (node) => `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const report = (node, message) => {
    console.error(`${where(node)}: ${message}`);
    errors++;
  };
  const warn = (node, message) => {
    if (STRICT) return report(node, message);
    warnings++;
    warningsByFile.set(path, (warningsByFile.get(path) || 0) + 1);
    if (process.argv.includes('--verbose')) console.warn(`${where(node)}: [cảnh báo] ${message}`);
  };
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/^[a-z]/.test(tag))
        for (const attribute of node.attributes.properties)
          if (ts.isJsxAttribute(attribute)) {
            const name = attribute.name.getText(source),
              raw = attribute.initializer?.getText(source),
              value = unquote(raw);
            if (name === 'title') report(attribute, 'Dùng Tooltip hoặc AutoTableTooltip thay HTML title.');
            if (tag === 'input' && name === 'type' && value === 'date') report(attribute, 'Dùng DateInput.');
            if (tag === 'input' && name === 'type' && value === 'number') report(attribute, 'Dùng NumberInput.');
            if (tag === 'a' && name === 'href' && /^["'`{]?["'`]?\//.test(raw || ''))
              report(attribute, 'Điều hướng nội bộ dùng EntityLink/useEntityPanel, không dùng thẻ <a>.');
          }
      if (tag === 'select') report(node, 'Dùng SearchableSelect (enum ngắn cần allowlist được review).');
      if (tag === 'table' && !allowed('table')) report(node, 'Dùng DataTable để có resize và sort cột.');
      if (['Link', 'NavLink'].includes(tag) && !allowed('navigation'))
        report(node, 'Tên thực thể dùng EntityLink; không dùng Link/NavLink.');
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useNavigate' && !allowed('navigation'))
      report(node, 'Không dùng useNavigate mở toàn trang; dùng useEntityPanel().');
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'toLocaleDateString')
      report(node, 'Dùng formatDate/formatDateTime.');
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'toLocaleString' && !allowed('locale'))
      report(node, 'Dùng formatNumber/formatCurrency/formatDateTime thay toLocaleString.');
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'minHeight' &&
      /mm['"`]/.test(node.initializer.getText(source))
    )
      report(node, 'Khung trang A4 khóa cứng height/maxHeight 297mm, không dùng minHeight.');
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      const translucent = text.match(/\bdark:(?:bg|border)-[a-z]+-\d{2,3}\/(\d{1,2})\b/);
      if (translucent && Number(translucent[1]) < 90 && !allowed('translucent'))
        report(node, `Nền/viền dark mode cần độ đậm đủ (${translucent[0]}).`);
      if (/(^|\s)fixed inset-0(\s|$)/.test(text) && !allowed('overlay'))
        report(node, 'Overlay/modal dùng components/ui/Modal để có Child Form Guard.');
      const size = text.match(/(^|\s)(?:[a-z]+:)*text-\[\d+(?:\.\d+)?(?:px|rem)\]/);
      if (size) report(node, `Dùng thang chữ (text-2xs…text-2xl) thay ${size[0].trim()}.`);
      // Palette background without a dark: counterpart in the same class string.
      const bg = text.match(new RegExp(`(^|\\s)bg-(?:${PALETTE})-\\d{2,3}\\b`));
      if (bg && !/(^|\s)dark:bg-/.test(text)) warn(node, `Thiếu dark:bg- cho ${bg[0].trim()}.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (warnings) {
  const top = [...warningsByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.warn(
    `Cảnh báo: ${warnings} chỗ màu nền chưa có dark: (chạy --verbose để xem chi tiết). Nhiều nhất: ` +
      top.map(([f, n]) => `${f.replace('src/', '')} (${n})`).join(', '),
  );
}
console.log(`UI scan: ${errors} vi phạm.`);
process.exitCode = errors ? 1 : 0;
