/**
 * Kiểm tra kết nối Supabase qua PostgREST bằng anon key (giống cách Web truy cập).
 *   pnpm db:check
 */
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './lib/env';

async function main() {
  const supabase = createClient(requireEnv('VITE_SUPABASE_URL'), requireEnv('VITE_SUPABASE_ANON_KEY'));

  for (const table of ['projects', 'organizations', 'personnel', 'staff_users', 'material_prices', 'holidays']) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    console.log(error ? `  ✗ ${table}: ${error.message}` : `  ✓ ${table}: ${count} bản ghi`);
  }

  const { data, error } = await supabase.rpc('dashboard_summary');
  console.log(error ? `  ✗ rpc dashboard_summary: ${error.message}` : '  ✓ rpc dashboard_summary:', data?.[0] ?? '');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
