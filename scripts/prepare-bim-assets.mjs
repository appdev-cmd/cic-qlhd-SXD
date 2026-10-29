import { copyFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const fragments = resolve(dirname(require.resolve('@thatopen/fragments')), '..');
const ifc = dirname(require.resolve('web-ifc'));
await mkdir(resolve(root, 'public/bim/ifc'), { recursive: true });
await copyFile(resolve(fragments, 'dist/Worker/worker.min.mjs'), resolve(root, 'public/bim/fragments-worker-3.4.8.js'));
await copyFile(resolve(ifc, 'web-ifc.wasm'), resolve(root, 'public/bim/ifc/web-ifc.wasm'));
await mkdir(resolve(root, 'public/drawing-assets/ifc'), { recursive: true });
await copyFile(resolve(ifc, 'web-ifc.wasm'), resolve(root, 'public/drawing-assets/ifc/web-ifc.wasm'));
for (const [name,dir] of [...['bimUpload','sectionBatch','clashBroadPhase','narrowPhase'].map(name=>[name,'']),...['sun','phaseSun','facade','envelope'].map(name=>[name,'sun/'])]) {
 await build({entryPoints:[resolve(root,`src/features/bim-suite/lib/${dir}${name}.worker.ts`)],outfile:resolve(root,`public/bim/workers/${name}.worker.js`),bundle:true,format:'esm',platform:'browser',minify:true});
}
console.log('Đã chuẩn bị worker Fragments và WebAssembly IFC cục bộ.');
