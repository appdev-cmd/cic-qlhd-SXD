// Tiến trình con: giải nén có giới hạn → chuyển IFC → .frag (ghi đĩa) → ghi cấu kiện theo lô vào bảng tạm.
// Tiến trình cha chỉ nhận bản tóm tắt nhỏ qua IPC (không đọc JSON toàn bộ cấu kiện).
// Chạy: tsx convertJob.ts <input.ifc|.ifczip> <thư-mục-làm-việc> <tên-gốc> [job JSON {jobId,modelId,projectId}]
// Không có job JSON (kiểm thử cục bộ): cấu kiện ghi ra elements.ndjson trong thư mục làm việc.
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { convertIfc, prepareIfcFile } from './convert';
import { classifyError } from './errors';
import { stageElements, type StagingTarget } from './staging';

const send = (msg: unknown) => {
  if (process.send) process.send(msg);
};

export interface JobSummary {
  elementCount: number;
  schema: string | null;
  authoringApp: string | null;
  georef: Record<string, unknown> | null;
  qtoMissingRatio: number;
  qtoMissingCount: number;
  ifcBytes: number;
  fragBytes: number;
  convertMs: number;
  stageMs: number;
  /** Bộ nhớ đỉnh của tiến trình con (MB) */
  peakRssMb: number;
  staged: boolean;
  /** Số cổng / kết nối / hệ thống MEP trích được (topology.json trong thư mục làm việc) */
  topology?: { ports: number; connections: number; systems: number } | null;
}

const peakRssMb = () => Math.round(process.resourceUsage().maxRSS / 1024);

const run = async () => {
  const [input, outDir, originalName, jobJson] = process.argv.slice(2);
  const job: StagingTarget | null = jobJson ? JSON.parse(jobJson) : null;
  try {
    const ifcPath = await prepareIfcFile(input, originalName || input, outDir);
    const ifc = new Uint8Array(fs.readFileSync(ifcPath));
    if (ifcPath !== input) fs.rmSync(ifcPath, { force: true });
    const started = Date.now();
    const result = await convertIfc(ifc, (percent, message) => send({ type: 'progress', percent, message }));
    const convertMs = Date.now() - started;
    fs.writeFileSync(path.join(outDir, 'model.frag'), result.fragBuffer);
    const topo = result.topology;
    if (topo && (topo.connections.length || topo.systems.length))
      fs.writeFileSync(path.join(outDir, 'topology.json'), JSON.stringify(topo));

    const stageStarted = Date.now();
    let elementCount = result.elements.length;
    if (job) {
      const url = process.env.SUPABASE_URL || 'http://localhost:54321';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      elementCount = await stageElements(supabase, job, result.elements, (done, total) =>
        send({
          type: 'progress',
          percent: 95 + (done / Math.max(1, total)) * 4,
          message: `Đã ghi ${done}/${total} cấu kiện vào bảng tạm`,
        }),
      );
    } else {
      const out = fs.createWriteStream(path.join(outDir, 'elements.ndjson'));
      for (const el of result.elements) out.write(`${JSON.stringify(el)}\n`);
      await new Promise((r) => out.end(r));
    }
    const summary: JobSummary = {
      elementCount,
      schema: result.schema,
      authoringApp: result.authoringApp,
      georef: (result as { georef?: Record<string, unknown> | null }).georef ?? null,
      qtoMissingRatio: (result as { qtoMissingRatio?: number }).qtoMissingRatio ?? 0,
      qtoMissingCount: (result as { qtoMissingCount?: number }).qtoMissingCount ?? 0,
      ifcBytes: ifc.length,
      fragBytes: result.fragBuffer.length,
      convertMs,
      stageMs: Date.now() - stageStarted,
      peakRssMb: peakRssMb(),
      staged: !!job,
      topology: topo ? { ports: topo.ports, connections: topo.connections.length, systems: topo.systems.length } : null,
    };
    send({ type: 'done', summary });
    process.exit(0);
  } catch (err) {
    send({ type: 'error', error: classifyError(err).toJSON() });
    process.exit(1);
  }
};

run();
