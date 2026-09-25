import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let cache: Record<string, string> | null = null;

function loadDotEnv(): Record<string, string> {
  if (cache) return cache;
  cache = {};
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return cache;
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    cache[key] = value;
  }
  return cache;
}

export function getEnv(key: string): string {
  return process.env[key] || loadDotEnv()[key] || '';
}

export function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = getEnv(key);
    if (value) return value;
  }
  throw new Error(`Thiếu biến môi trường: ${keys.join(' hoặc ')} (khai báo trong .env)`);
}

export async function withDbClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    connectionString: requireEnv('DIRECT_URL', 'DATABASE_URL'),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
