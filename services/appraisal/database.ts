import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import pg, { type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import { databaseError, HttpError } from './errors.js';

// PostgreSQL DATE is a calendar day, never a local-midnight JavaScript timestamp.
pg.types.setTypeParser(1082, (value) => value);

const pools = new Map<string, pg.Pool>();
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function actorId(value: string): string {
  if (!UUID.test(value)) throw new HttpError(403, 'Danh tính tài khoản không hợp lệ.');
  return value.toLowerCase();
}

export function poolConfiguration(env = process.env): PoolConfig {
  if (!env.APPRAISAL_DATABASE_URL) {
    throw new HttpError(503, 'Chưa cấu hình kết nối database cho backend.');
  }
  const url = new URL(env.APPRAISAL_DATABASE_URL);
  // pg parses sslmode from the URL after options; remove it to prevent overriding verified TLS.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const ca =
    env.APPRAISAL_DATABASE_CA_PEM ||
    (env.APPRAISAL_DATABASE_CA ? readFileSync(env.APPRAISAL_DATABASE_CA, 'utf8') : undefined);
  if (ca) {
    if (ca.includes('PRIVATE KEY')) throw new Error('Database CA must contain public certificates only.');
    new X509Certificate(ca);
  }
  const max = Number(env.APPRAISAL_DB_POOL_MAX || (env.VERCEL ? 2 : 8));
  if (!Number.isInteger(max) || max < 1 || max > 32) throw new Error('Invalid database pool size.');
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 300_000,
    application_name: 'appraisal-node',
    allowExitOnIdle: true,
  };
}

function pool(): pg.Pool {
  const config = poolConfiguration();
  const key = config.connectionString!;
  let value = pools.get(key);
  if (!value) {
    value = new pg.Pool(config);
    // Idle socket failures are handled by pg; never log a URL or raw database error.
    value.on('error', () => console.error('Appraisal database idle connection closed.'));
    pools.set(key, value);
  }
  return value;
}

export type Transaction = Pick<PoolClient, 'query'>;

/** Identity is local to this transaction and is cleared before returning a pooled socket. */
export async function transaction<T>(
  actor: string | null,
  operation: (client: Transaction) => Promise<T>,
  source: Pick<pg.Pool, 'connect'> = pool(),
): Promise<T> {
  const id = actor === null ? null : actorId(actor);
  let client: PoolClient | undefined;
  let discard = false;
  try {
    client = await source.connect();
    await client.query('BEGIN');
    await client.query(
      "select set_config('statement_timeout','15000',true), set_config('request.jwt.claim.sub',$1,true)",
      [id || ''],
    );
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
    }
    throw databaseError(error);
  } finally {
    client?.release(discard);
  }
}

export async function read<T extends QueryResultRow>(actor: string, sql: string, values: unknown[] = []): Promise<T[]> {
  return transaction(actor, async (client) => (await client.query<T>(sql, values)).rows);
}

export async function closePools(): Promise<void> {
  await Promise.all([...pools.values()].map((value) => value.end()));
  pools.clear();
}
