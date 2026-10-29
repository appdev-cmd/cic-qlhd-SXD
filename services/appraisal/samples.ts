import data from './data/samples.json' with { type: 'json' };
import JSZip from 'jszip';
import { documentBytes, type Block } from './document-renderer.js';
import { newCase, audit } from './domain.js';
import { runtimeMode, writable } from './auth.js';
import { attach, save } from './deps.js';
import { analyze } from './rules.js';
import { Store, type CasePayload } from './store.js';
import { HttpError } from './errors.js';
export interface SampleSpec {
  requirementId: string;
  filename: string;
  title: string;
  blocks: Block[];
}
export function sampleSpecs(scenario = 'initial'): SampleSpec[] {
  if (!['initial', 'revised'].includes(scenario)) throw new HttpError(422, 'Kịch bản mẫu không hợp lệ.');
  return structuredClone((data as Record<string, SampleSpec[]>)[scenario]);
}
export async function sampleDocuments(scenario = 'initial') {
  const documents = [];
  for (const spec of sampleSpecs(scenario))
    documents.push({ spec, data: await documentBytes(spec.title, spec.blocks, 'docx', true) });
  return documents;
}
export async function importSample(store: Store, scenario: string) {
  writable(store.actor);
  if (runtimeMode() !== 'demo') throw new HttpError(422, 'Chỉ nạp bộ mẫu tự động trong môi trường cục bộ.');
  const value = newCase('Trường liên cấp Hương Xuân — hồ sơ mô phỏng', 'Hà Tĩnh', store.actor, '2026-09-27', {
    sample: true,
    schoolTemplate: true,
  }) as unknown as CasePayload;
  audit(
    value,
    store.actor,
    'Tạo bộ hồ sơ mẫu',
    'Dữ liệu mô phỏng; không phải hồ sơ thật hoặc văn bản có giá trị pháp lý.',
  );
  await store.save(value);
  for (const { spec, data } of await sampleDocuments(scenario))
    await attach(store, value, spec.requirementId, spec.filename, data);
  value.runs.push(analyze(value));
  return save(
    store,
    value,
    1,
    'Nạp bộ mẫu',
    `Kịch bản ${scenario}; đọc và kiểm tra lại tài liệu bằng cùng quy trình upload.`,
  );
}
export async function buildSamplesZip() {
  const zip = new JSZip();
  for (const scenario of ['initial', 'revised'])
    for (const { spec, data } of await sampleDocuments(scenario)) zip.file(`${scenario}/${spec.filename}`, data);
  zip.file(
    'HUONG_DAN.txt',
    'Bộ hồ sơ mô phỏng để kiểm thử phần mềm. Không phải văn bản chính thức và không có giá trị pháp lý.',
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
