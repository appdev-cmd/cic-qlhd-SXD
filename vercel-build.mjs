// Keep Vite's static output and native api/index.py Functions in the same Vercel deployment.
import { existsSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const root = resolve('.');
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'index.html'))) throw new Error('Run the frontend build first.');
if (process.env.VERCEL) {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'APPRAISAL_DATABASE_URL',
    'APPRAISAL_INTERNAL_TOKEN',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length || process.env.VITE_APPRAISAL_RUNTIME !== 'cloud')
    throw new Error(
      'Cloud backend configuration is incomplete: ' +
        [...missing, ...(process.env.VITE_APPRAISAL_RUNTIME !== 'cloud' ? ['VITE_APPRAISAL_RUNTIME=cloud'] : [])].join(
          ', ',
        ),
    );
  if (process.env.VITE_SUPABASE_URL !== process.env.SUPABASE_URL)
    throw new Error('Frontend and backend must use the same Supabase project.');
}
// A cloud deployment must not serve the public, read-only demonstration snapshot.
if (process.env.VITE_APPRAISAL_RUNTIME === 'cloud') rmSync(resolve(dist, 'bim/demo'), { recursive: true, force: true });
const legacyOutput = resolve(root, '.vercel/output');
if (!legacyOutput.startsWith(resolve(root, '.vercel') + sep)) throw new Error('Invalid legacy output path.');
rmSync(legacyOutput, { recursive: true, force: true });
console.log('Vercel frontend ready; /api/appraisal uses the authenticated Python Function.');
