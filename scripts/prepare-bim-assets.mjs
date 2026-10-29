import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Copies the IFC/Fragments runtime files and bundles the BIM web workers into public/bim.
// The BIM workspace sources (src/features/bim-suite) may not be in the repository yet: in that case
// the worker step is skipped so `pnpm build` / Vercel builds still succeed (it previously failed with
// "Could not resolve src/features/bim-suite/lib/bimUpload.worker.ts").
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

const resolvePackage = (name) => {
  try {
    return require.resolve(name);
  } catch {
    return null;
  }
};

const fragmentsEntry = resolvePackage('@thatopen/fragments');
const ifcEntry = resolvePackage('web-ifc');
if (fragmentsEntry && ifcEntry) {
  const fragments = resolve(dirname(fragmentsEntry), '..');
  const ifc = dirname(ifcEntry);
  const ifcVersion = JSON.parse(await readFile(resolve(ifc, 'package.json'), 'utf8')).version;
  await mkdir(resolve(root, 'public/bim/ifc'), { recursive: true });
  await copyFile(
    resolve(fragments, 'dist/Worker/worker.min.mjs'),
    resolve(root, 'public/bim/fragments-worker-3.4.8.js'),
  );
  await copyFile(resolve(ifc, 'web-ifc.wasm'), resolve(root, 'public/bim/ifc/web-ifc.wasm'));
  await mkdir(resolve(root, `public/bim/ifc/${ifcVersion}`), { recursive: true });
  await copyFile(resolve(ifc, 'web-ifc.wasm'), resolve(root, `public/bim/ifc/${ifcVersion}/web-ifc.wasm`));
  await mkdir(resolve(root, 'public/drawing-assets/ifc'), { recursive: true });
  await copyFile(resolve(ifc, 'web-ifc.wasm'), resolve(root, 'public/drawing-assets/ifc/web-ifc.wasm'));
} else {
  console.warn('Bỏ qua tài nguyên IFC/Fragments: chưa cài @thatopen/fragments hoặc web-ifc.');
}

const workers = [
  ...['bimUpload', 'ifcConvert', 'sectionBatch', 'clashBroadPhase', 'narrowPhase'].map((name) => [name, '']),
  ...['sun', 'phaseSun', 'facade', 'envelope'].map((name) => [name, 'sun/']),
];
let built = 0;
for (const [name, dir] of workers) {
  const entry = resolve(root, `src/features/bim-suite/lib/${dir}${name}.worker.ts`);
  if (!existsSync(entry)) continue;
  await build({
    entryPoints: [entry],
    outfile: resolve(root, `public/bim/workers/${name}.worker.js`),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
  });
  built++;
}
console.log(
  built
    ? `Đã chuẩn bị worker Fragments, WebAssembly IFC và ${built} worker BIM.`
    : 'Đã chuẩn bị tài nguyên IFC; chưa có mã nguồn worker BIM trong repo nên bỏ qua bước đóng gói worker.',
);
