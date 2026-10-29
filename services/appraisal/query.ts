import type { SQLInputValue } from 'node:sqlite';
import type { QueryResultRow } from 'pg';
import { openDemoDatabase } from './sqlite.js';
import { runtimeMode, type Actor } from './auth.js';
import { transaction } from './database.js';

export interface Query {
  pg: boolean;
  run<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}
let demoWrites: Promise<unknown> = Promise.resolve();
export async function withQuery<T>(actor: Actor, write: boolean, operation: (query: Query) => Promise<T>): Promise<T> {
  if (runtimeMode() === 'cloud')
    return transaction(actor.id, (client) =>
      operation({
        pg: true,
        async run(sql, values = []) {
          let i = 0;
          const result = await client.query(
            sql.replace(/\?/g, () => '$' + ++i),
            values,
          );
          return { rows: result.rows, rowCount: result.rowCount || 0 };
        },
      }),
    );
  if (write) {
    const result = demoWrites.then(() => demoQuery(true, operation));
    demoWrites = result.catch(() => undefined);
    return result;
  }
  return demoQuery(false, operation);
}
async function demoQuery<T>(write: boolean, operation: (query: Query) => Promise<T>): Promise<T> {
  const db = openDemoDatabase();
  try {
    if (write) db.exec('BEGIN IMMEDIATE');
    const result = await operation({
      pg: false,
      async run(sql, values = []) {
        const statement = db.prepare(sql);
        const args = values.map((value) =>
          typeof value === 'boolean' ? Number(value) : (value ?? null),
        ) as SQLInputValue[];
        if (statement.columns().length) {
          const rows = statement.all(...args);
          return { rows: rows as never, rowCount: rows.length };
        }
        const result = statement.run(...args);
        return { rows: [], rowCount: Number(result.changes) };
      },
    });
    if (write) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (write) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}
