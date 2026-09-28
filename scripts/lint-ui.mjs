import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

// Static checks for the UI rules in CLAUDE.md. Each allowlist entry is a reviewed exception.
const ALLOW = {
  overlay: ['src/components/appraisal/ReviewModal.tsx', 'src/components/SlidePanelStack.tsx'],
  table: ['src/components/appraisal/DossierGrid.tsx', 'src/components/MasterTable.tsx'],
  navigation: ['src/layouts/AppLayout.tsx', 'src/App.tsx'],
  // Glassmorphism tooltip prescribed by the Universal Tooltip rule.
  translucent: ['src/components/ui/Tooltip.tsx'],
};
const files = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
const normalize = (file) => file.split(sep).join('/');
let errors = 0;

for (const file of files('src')) {
  const path = normalize(file);
  const allowed = (rule) => ALLOW[rule].includes(path);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const report = (node, message) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    console.error(`${path}:${line}: ${message}`);
    errors++;
  };
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/^[a-z]/.test(tag))
        for (const attribute of node.attributes.properties)
          if (ts.isJsxAttribute(attribute)) {
            const name = attribute.name.getText(source),
              value = attribute.initializer?.getText(source);
            if (name === 'title') report(attribute, 'Dùng Tooltip hoặc AutoTableTooltip thay HTML title.');
            if (tag === 'input' && name === 'type' && value === '"date"') report(attribute, 'Dùng DateInput.');
            if (tag === 'input' && name === 'type' && value === '"number"') report(attribute, 'Dùng NumberInput.');
            if (tag === 'a' && name === 'href' && /^["'`{]?["'`]?\//.test(value || ''))
              report(attribute, 'Điều hướng nội bộ dùng EntityLink/useEntityPanel, không dùng thẻ <a>.');
          }
      if (tag === 'select') report(node, 'Dùng SearchableSelect (enum ngắn cần allowlist được review).');
      if (tag === 'table' && !allowed('table')) report(node, 'Dùng DossierGrid/MasterTable để có resize và sort cột.');
      if (['Link', 'NavLink'].includes(tag) && !allowed('navigation'))
        report(node, 'Tên thực thể dùng EntityLink; không dùng Link/NavLink.');
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useNavigate' && !allowed('navigation'))
      report(node, 'Không dùng useNavigate mở toàn trang; dùng useEntityPanel().');
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'toLocaleDateString')
      report(node, 'Dùng formatDate/formatDateTime.');
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      const translucent = text.match(/\bdark:(?:bg|border)-[a-z]+-\d{2,3}\/(\d{1,2})\b/);
      if (translucent && Number(translucent[1]) < 90 && !allowed('translucent'))
        report(node, `Nền/viền dark mode cần độ đậm đủ (${translucent[0]}).`);
      if (/(^|\s)fixed inset-0(\s|$)/.test(text) && !allowed('overlay'))
        report(node, 'Overlay/modal dùng ReviewModal để có Child Form Guard.');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
console.log(`UI scan: ${errors} vi phạm.`);
process.exitCode = errors ? 1 : 0;
