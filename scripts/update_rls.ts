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

async function updateRls() {
  const token = getEnv('SUPABASE_ACCESS_TOKEN');
  const projectId = 'cekaigfnriatarytvymb';

  const query = `
    drop policy if exists "Authenticated users can read organizations" on public.organizations;
    create policy "Allow read organizations" on public.organizations for select using (true);

    drop policy if exists "Authenticated users can read personnel" on public.personnel;
    create policy "Allow read personnel" on public.personnel for select using (true);

    drop policy if exists "Authenticated users can read projects" on public.projects;
    create policy "Allow read projects" on public.projects for select using (true);

    drop policy if exists "Authenticated users can read disciplines" on public.appraisal_disciplines;
    create policy "Allow read disciplines" on public.appraisal_disciplines for select using (true);

    drop policy if exists "Authenticated users can read checklists" on public.appraisal_checklists;
    create policy "Allow read checklists" on public.appraisal_checklists for select using (true);

    drop policy if exists "Authenticated users can read alerts" on public.ai_compliance_alerts;
    create policy "Allow read alerts" on public.ai_compliance_alerts for select using (true);
  `;

  console.log('Updating RLS policies...');
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Result:', data);
}

updateRls().catch(console.error);
