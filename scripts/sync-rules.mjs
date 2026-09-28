// CLAUDE.md is the single source of the agent rules; AGENTS.md, GEMINI.md and RULES.md are copies.
// Usage: node scripts/sync-rules.mjs          (rewrite copies)
//        node scripts/sync-rules.mjs --check  (exit 1 when a copy drifted; used in CI)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const normalize = (text) => text.replace(/\r\n/g, '\n');
const source = normalize(readFileSync(resolve(root, 'CLAUDE.md'), 'utf8'));
const check = process.argv.includes('--check');
const drifted = [];
for (const name of ['AGENTS.md', 'GEMINI.md', 'RULES.md']) {
  const path = resolve(root, name);
  const current = existsSync(path) ? normalize(readFileSync(path, 'utf8')) : '';
  if (current === source) continue;
  drifted.push(name);
  if (!check) writeFileSync(path, source);
}
if (check && drifted.length) {
  console.error(`Quy tắc agent lệch với CLAUDE.md: ${drifted.join(', ')}. Chạy: node scripts/sync-rules.mjs`);
  process.exitCode = 1;
} else {
  console.log(drifted.length ? `Đã đồng bộ: ${drifted.join(', ')}` : 'Quy tắc agent đã đồng bộ.');
}
