import { mkdir, writeFile } from 'node:fs/promises';
import { buildSamplesZip } from '../services/appraisal/samples.js';
await mkdir('output/appraisal', { recursive: true });
await writeFile('output/appraisal/bo-ho-so-mau-bcnckt.zip', await buildSamplesZip());
console.log('Đã tạo output/appraisal/bo-ho-so-mau-bcnckt.zip');
