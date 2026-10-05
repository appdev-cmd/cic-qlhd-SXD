// Package the Vite build for Vercel's Build Output API (.vercel/output), so Vercel deploys the static web app
// as-is instead of auto-detecting the repository's Python/Express services.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/index.html')) throw new Error('dist/index.html not found: run "pnpm build" first.');
rmSync('.vercel/output', { recursive: true, force: true });
mkdirSync('.vercel/output', { recursive: true });
cpSync('dist', '.vercel/output/static', { recursive: true });
writeFileSync(
  '.vercel/output/config.json',
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
console.log('Vercel build output written to .vercel/output (static).');
