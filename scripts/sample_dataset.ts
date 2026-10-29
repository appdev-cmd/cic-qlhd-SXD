/** Deterministic fictitious fixtures; never publishes to cloud or replaces edited data. */
import { openDemoDatabase } from '../services/appraisal/sqlite.js';
import data from '../services/appraisal/data/demo-dossiers.json' with { type: 'json' };
if (process.env.VERCEL || ['cloud', 'supabase'].includes(process.env.APPRAISAL_MODE || ''))
  throw new Error('Chỉ nạp dữ liệu mô phỏng vào kho demo cục bộ.');
const db = openDemoDatabase();
let created = 0,
  kept = 0,
  files = 0;
try {
  db.exec('BEGIN IMMEDIATE');
  const insert = db.prepare('insert or ignore into cases(id,revision,payload) values(?,?,?)');
  const put = db.prepare('insert or ignore into files(case_id,id,data) values(?,?,?)');
  for (const value of data.cases) {
    if (!value.sample || value.seedVersion !== data.version) throw new Error('Không phải dữ liệu mô phỏng.');
    const result = insert.run(value.id, value.revision, JSON.stringify(value));
    if (!result.changes) {
      kept++;
      continue;
    }
    created++;
    for (const file of data.files.filter((file) => file.case_id === value.id)) {
      put.run(file.case_id, file.id, Buffer.from(file.data, 'base64'));
      files++;
    }
  }
  db.exec('COMMIT');
  console.log(JSON.stringify({ seed: data.version, created, kept, files }));
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
