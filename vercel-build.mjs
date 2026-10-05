// Package the Vite build for Vercel's Build Output API (.vercel/output), so Vercel deploys the static web app
// as-is instead of auto-detecting the repository's Python/Express services.
// Run through "pnpm run build:vercel": pnpm runs scripts from the package root, while INIT_CWD is the directory
// Vercel invoked the build from — the output must land there.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const output = resolve(process.env.INIT_CWD || '.', '.vercel/output');
if (!existsSync(resolve(dist, 'index.html'))) throw new Error('dist/index.html not found: run "pnpm build" first.');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(dist, resolve(output, 'static'), { recursive: true });
writeFileSync(
  resolve(output, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        // Single-page app: every other path renders index.html (React Router).
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log('Vercel build output written to ' + output);
