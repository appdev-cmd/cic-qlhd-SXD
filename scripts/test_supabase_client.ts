import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnv(key: string): string {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [k, ...v] = trimmed.split('=');
      if (k.trim() === key) {
        return v.join('=').trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return process.env[key] || '';
}

async function testClient() {
  const url = getEnv('VITE_SUPABASE_URL');
  const key = getEnv('VITE_SUPABASE_ANON_KEY');

  console.log(`Connecting via Supabase JS Client: ${url}...`);
  const supabase = createClient(url, key);

  const { data: orgs, error: orgError } = await supabase.from('organizations').select('id, name, type').limit(3);
  if (orgError) {
    console.error('Org Error:', orgError);
  } else {
    console.log(`✓ Fetched ${orgs.length} sample organizations via PostgREST:`, orgs);
  }

  const { data: per, error: perError } = await supabase.from('personnel').select('id, full_name, cert_number').limit(3);
  if (perError) {
    console.error('Personnel Error:', perError);
  } else {
    console.log(`✓ Fetched ${per.length} sample personnel via PostgREST:`, per);
  }

  const { data: proj, error: projError } = await supabase.from('projects').select('id, code, title, investment_cost').limit(3);
  if (projError) {
    console.error('Project Error:', projError);
  } else {
    console.log(`✓ Fetched ${proj.length} sample projects via PostgREST:`, proj);
  }
}

testClient().catch(console.error);
