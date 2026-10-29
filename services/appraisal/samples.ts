import data from './data/samples.json' with { type: 'json' };
import JSZip from 'jszip';
import { documentBytes, type Block } from './document-renderer.js';
import { newCase, audit } from './domain.js';
import { runtimeMode, writable, DEMO_ACTOR } from './auth.js';
import { createHash } from 'node:crypto';
import { readDocument } from './ingestion.js';
import { extractFacts, checklistCandidates } from './facts.js';
import { exportDocument } from './reporting.js';
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
  const value = newCase('Trường liên cấp Hương Xuân — hồ sơ mô phỏng', 'Hà Tĩnh', { ...DEMO_ACTOR }, '2026-09-27', {
    sample: true,
    schoolTemplate: true,
  }) as unknown as CasePayload;
  const initial = new Set(sampleSpecs('initial').map((spec) => spec.filename));
  const manifest: Array<{ path: string; sha256: string; size: number }> = [];
  const put = (path: string, bytes: Buffer) => {
    zip.file(path, bytes);
    manifest.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length });
  };
  const snapshots: Record<string, CasePayload> = {};
  for (const spec of sampleSpecs('revised')) {
    const folder = initial.has(spec.filename) ? '01-lan-dau' : '02-bo-sung';
    let original!: Buffer;
    for (const format of ['docx', 'pdf'] as const) {
      const bytes = await documentBytes(spec.title, spec.blocks, format, true);
      put(`dau-vao/${folder}/${spec.filename.replace(/\.docx$/i, '.' + format)}`, bytes);
      if (format === 'docx') original = bytes;
    }
    const read = await readDocument(spec.filename, original, { ocrLimit: 0 });
    const document = {
      id: crypto.randomUUID(),
      requirementId: spec.requirementId,
      name: spec.filename,
      role: 'submission',
      version: 1 + value.documents.filter((d) => d.requirementId === spec.requirementId).length,
      hash: createHash('sha256').update(original).digest('hex'),
      size: original.length,
      uploadedAt: new Date().toISOString(),
      ...read,
    };
    value.documents.push(document);
    value.facts.push(...extractFacts(document));
    if (spec.requirementId === 'TTR') value.checklistCandidates = checklistCandidates(document);
    const requirement = value.requirements.find((r) => r.id === spec.requirementId);
    if (requirement) requirement.status = 'submitted';
    audit(value, { ...DEMO_ACTOR }, 'Nộp tài liệu mẫu', spec.filename);
    value.revision++;
    if (value.documents.length === initial.size) {
      value.runs.push(analyze(value));
      snapshots['01-lan-dau'] = structuredClone(value);
    }
  }
  value.runs.push(analyze(value));
  snapshots['02-sau-bo-sung'] = value;
  for (const [scenario, snapshot] of Object.entries(snapshots)) {
    for (const kind of ['report', 'supplement', 'suspension', 'notice', 'decision'])
      for (const format of ['docx', 'pdf']) {
        const result = await exportDocument(snapshot, kind, format);
        put(`dau-ra/${scenario}/${kind}.${format}`, Buffer.from(result.data));
      }
    zip.file(`dau-ra/${scenario}/ket-qua-co-cau-truc.json`, JSON.stringify(snapshot, null, 2));
  }
  zip.file('manifest.json', JSON.stringify({ synthetic: true, files: manifest }, null, 2));
  zip.file(
    'HUONG_DAN.txt',
    'Bộ hồ sơ mô phỏng để kiểm thử phần mềm. Không phải văn bản chính thức và không có giá trị pháp lý.',
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
