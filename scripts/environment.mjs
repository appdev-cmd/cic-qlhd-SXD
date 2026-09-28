import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

export function loadEnvironment(root) {
  const inherited = new Set(Object.keys(process.env));
  for (const file of [
    '.env',
    '.env.local',
    process.env.APPRAISAL_CONFIG_FILE || resolve(homedir(), '.config/buildappraisal/runtime.env'),
  ]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
      if (match && !inherited.has(match[1])) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}
