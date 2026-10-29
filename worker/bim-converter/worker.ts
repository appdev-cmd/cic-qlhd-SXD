// Worker nền: quét bim_models trạng thái 'uploaded' → chuyển IFC sang .frag, trích xuất cấu kiện vào bim_elements.
// Độ bền: tải IFC theo luồng ra đĩa; tiến trình con (giới hạn thời gian) chuyển đổi và ghi cấu kiện theo lô vào
// bảng tạm; hoán đổi vào bim_elements trong một giao dịch; heartbeat định kỳ; lỗi phân loại vĩnh viễn/tạm thời,
// thử lại có giãn cách và hàng đợi lỗi sau N lần; số liệu job lưu ở bim_models.chi_so_xu_ly.
// Chuyển từ cic-hud (scripts/bim-converter-worker). BuildSIA: bỏ gửi thông báo SMTP/Zalo, bỏ ghi mạng MEP và chấm
// điểm IFC (bảng của các giai đoạn sau), không nhận mô hình đã xóa, thêm /healthz khi đặt PORT.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { runConvertJob } from './runJob';
import { classifyError, decideFailure, JobError } from './errors';
import { downloadObjectToFile, uploadFileToObject } from './download';
import { scanBeforeConvert, scanMode } from './scan';
import { canClaim, isBigFile } from './scheduling';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const pollingInterval = parseInt(process.env.POLLING_INTERVAL || '5000', 10);
const concurrency = Math.max(1, parseInt(process.env.BIM_WORKER_CONCURRENCY || '2', 10));
// Tệp từ ngưỡng này trở lên chạy một mình (bước tính hình học ngốn vài GB RAM)
const BIG_FILE_BYTES = parseInt(process.env.BIM_BIG_FILE_MB || '150', 10) * 1024 * 1024;
const MAX_ATTEMPTS = parseInt(process.env.BIM_MAX_ATTEMPTS || '3', 10);
const STALE_MINUTES = parseInt(process.env.BIM_STALE_MINUTES || '10', 10);
const HEARTBEAT_MS = 30_000;
// Giới hạn tệp nguồn tải về (byte) — chặn tệp quá lớn trước khi tốn đĩa/RAM.
const MAX_SOURCE_BYTES = parseInt(process.env.BIM_MAX_SOURCE_MB || '2048', 10) * 1024 * 1024;
const WORKER_NAME = process.env.BIM_WORKER_NAME || os.hostname();
/** Số lần thử (integer trong CSDL; đọc phòng thủ thành số). */
const attemptsOf = (value: unknown) => {
  const n = parseInt(String(value ?? '0'), 10);
  return Number.isFinite(n) ? n : 0;
};
const peakRssMb = () => Math.round(process.resourceUsage().maxRSS / 1024);

if (!supabaseServiceKey) {
  console.error('[BIM-WORKER] LỖI: Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let running = 0;
let bigRunning = 0;

/** Mô hình 'processing' nhưng heartbeat quá hạn (worker chết/restart) → trả về hàng đợi hoặc báo lỗi */
const recoverStaleJobs = async () => {
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: stale, error } = await supabase
    .from('bim_models')
    .select('id, file_name, so_lan_thu, heartbeat_at, updated_at')
    .eq('status', 'processing')
    .is('deleted_at', null)
    .or(`heartbeat_at.lt.${staleBefore},and(heartbeat_at.is.null,updated_at.lt.${staleBefore})`);
  if (error) {
    console.warn('[RECOVER] Không kiểm tra được mô hình treo:', error.message);
    return;
  }
  for (const m of stale || []) {
    const attempts = attemptsOf(m.so_lan_thu);
    const decision = decideFailure(
      new JobError('CHILD_CRASH', 'Worker dừng giữa chừng hoặc thiếu bộ nhớ (heartbeat quá hạn)'),
      attempts,
      MAX_ATTEMPTS,
    );
    console.warn(
      `[RECOVER] Mô hình treo: ${m.file_name} (lần thử ${attempts}) → ${decision.status === 'error' ? 'hàng đợi lỗi' : 'thử lại sau'}`,
    );
    await supabase
      .from('bim_models')
      .update({ ...decision, ma_job: null, updated_at: new Date().toISOString() })
      .eq('id', m.id)
      .eq('status', 'processing');
  }
};

/** Nhận việc nguyên tử: chỉ một worker chuyển được bản ghi từ 'uploaded' sang 'processing'. */
const claimNextModel = async () => {
  const { data: candidates, error } = await supabase
    .from('bim_models')
    .select('id, so_lan_thu, file_size')
    .eq('status', 'uploaded')
    .is('deleted_at', null)
    .or(`thu_lai_sau.is.null,thu_lai_sau.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[DATABASE] Lỗi truy vấn bim_models:', error.message);
    return null;
  }
  if (!candidates || candidates.length === 0) return null;
  // Giữ thứ tự hàng đợi: tệp lớn ở đầu hàng thì đợi các việc đang chạy xong rồi chạy một mình
  if (!canClaim({ running, bigRunning: bigRunning > 0 }, candidates[0].file_size, concurrency, BIG_FILE_BYTES))
    return null;

  const now = new Date().toISOString();
  const { data: claimed } = await supabase
    .from('bim_models')
    .update({
      status: 'processing',
      tien_do: 0,
      error_message: null,
      heartbeat_at: now,
      so_lan_thu: attemptsOf(candidates[0].so_lan_thu) + 1,
      ma_job: randomUUID(),
      thu_lai_sau: null,
      updated_at: now,
    })
    .eq('id', candidates[0].id)
    .eq('status', 'uploaded')
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();

  return claimed;
};

const processModel = async (modelRecord: any) => {
  const { id: modelId, project_id: projectId, ifc_path: ifcPath, file_name: fileName } = modelRecord;
  console.log(`\n============================================================`);
  console.log(`[START] ${fileName} (ID: ${modelId}) · Dự án: ${projectId} · lần thử ${modelRecord.so_lan_thu}`);

  let progress = 0;
  let lastSaved = -1;
  const heartbeat = setInterval(() => {
    const update: Record<string, unknown> = { heartbeat_at: new Date().toISOString() };
    if (Math.round(progress) !== lastSaved) {
      update.tien_do = Math.min(99, Math.round(progress));
      lastSaved = Math.round(progress);
    }
    supabase
      .from('bim_models')
      .update(update)
      .eq('id', modelId)
      .then(({ error }) => error && console.warn('[HEARTBEAT] Không ghi được:', error.message));
  }, HEARTBEAT_MS);

  const metrics: Record<string, unknown> = {
    worker: WORKER_NAME,
    attempt: attemptsOf(modelRecord.so_lan_thu),
    job_id: modelRecord.ma_job,
  };
  const started = Date.now();
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-src-'));
  let cleanupJob: (() => void) | null = null;
  try {
    if (!ifcPath) throw new JobError('SOURCE_MISSING', 'Mô hình không có đường dẫn ifc_path');
    if (!modelRecord.ma_job)
      throw new JobError('DATABASE', 'Mô hình chưa có mã job (ma_job) — cần migration 20261027090000_bim_core', {
        kind: 'permanent',
      });

    // 1. Tải IFC thẳng xuống đĩa theo luồng (không giữ tệp trong heap tiến trình cha).
    const name = path.basename(ifcPath);
    const source = path.join(sourceDir, /\.(ifczip|zip)$/i.test(name) ? 'input.ifczip' : 'input.ifc');
    console.log(`[STORAGE] Đang tải ${ifcPath} xuống đĩa...`);
    const download = await downloadObjectToFile(supabase, 'bim-models', ifcPath, source, {
      maxBytes: MAX_SOURCE_BYTES,
      onProgress: (bytes, total) => {
        if (total) progress = Math.min(4, (bytes / total) * 4);
      },
    });
    metrics.download_ms = download.ms;
    metrics.source_bytes = download.bytes;
    console.log(`[STORAGE] Tải xong (${(download.bytes / 1048576).toFixed(2)} MB, ${download.ms} ms)`);

    // 2. Điểm móc quét virus (clamd) trước khi chuyển đổi.
    metrics.scan = await scanBeforeConvert(source, scanMode());

    // 3. Tiến trình con: giải nén có giới hạn, chuyển đổi, ghi cấu kiện theo lô vào bảng tạm.
    const job = await runConvertJob(
      source,
      name,
      (p, msg) => {
        progress = p;
        if (msg) console.log(`[PROGRESS] ${Math.round(p)}% ${msg}`);
      },
      { job: { jobId: modelRecord.ma_job, modelId, projectId } },
    );
    cleanupJob = job.cleanup;
    Object.assign(metrics, {
      convert_ms: job.summary.convertMs,
      stage_ms: job.summary.stageMs,
      element_count: job.summary.elementCount,
      ifc_bytes: job.summary.ifcBytes,
      frag_bytes: job.summary.fragBytes,
      child_peak_rss_mb: job.summary.peakRssMb,
    });

    // 4. Tải .frag từ đĩa lên kho theo luồng.
    const fragStoragePath = `frags/${projectId}/${modelId}.frag`;
    const uploadStarted = Date.now();
    await uploadFileToObject(supabase, 'bim-models', fragStoragePath, job.fragPath);
    metrics.upload_ms = Date.now() - uploadStarted;

    // 5. Hoán đổi cấu kiện + đặt ready + lưu số liệu job trong MỘT giao dịch (bim_swap_model_elements).
    metrics.duration_ms = Date.now() - started;
    metrics.parent_peak_rss_mb = peakRssMb();
    metrics.finished_at = new Date().toISOString();
    const { error: swapError } = await supabase.rpc('bim_swap_model_elements', {
      p_model: modelId,
      p_job: modelRecord.ma_job,
      p_patch: {
        element_count: job.summary.elementCount,
        frag_path: fragStoragePath,
        ifc_schema: job.summary.schema,
        phan_mem_tao: job.summary.authoringApp,
        georef: job.summary.georef,
        canh_bao: { thieu_qto_ty_le: job.summary.qtoMissingRatio, so_cau_kien_thieu_qto: job.summary.qtoMissingCount },
        chi_so_xu_ly: metrics,
      },
    });
    if (swapError) throw new JobError('DATABASE', `Lỗi hoán đổi cấu kiện: ${swapError.message}`, { kind: 'transient' });
    // Mạng kết nối MEP (bim_ket_noi_ghi): ghi sau khi có cấu kiện; lỗi chỉ cảnh báo, không làm hỏng job.
    if (job.topologyPath) {
      try {
        const topo = JSON.parse(fs.readFileSync(job.topologyPath, 'utf8'));
        const { error: topoError } = await supabase.rpc('bim_ket_noi_ghi', {
          p_model: modelId,
          p_he_thong: topo.systems,
          p_ket_noi: topo.connections,
          p_la_demo: false,
        });
        if (topoError) console.warn(`[WARN] Chưa ghi được mạng kết nối MEP cho ${modelId}: ${topoError.message}`);
      } catch (e) {
        console.warn(
          `[WARN] Không đọc được topology.json của ${modelId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    // Chấm điểm xác minh IFC ngay sau chuyển đổi (cổng WIP → Chia sẻ của CDE đọc lần chấm gần nhất). Lỗi chấm điểm
    // không làm hỏng job: người dùng chấm lại được trong "Kiểm tra mô hình".
    const { error: scoreError } = await supabase.rpc('bim_ifc_cham_diem', { p_model: modelId });
    if (scoreError) console.warn(`[WARN] Chưa chấm được điểm IFC cho ${modelId}: ${scoreError.message}`);
    console.log(
      `[SUCCESS] ${fileName}: ${job.summary.elementCount} cấu kiện · ${Math.round((Date.now() - started) / 1000)} giây · RAM con ${job.summary.peakRssMb} MB, cha ${metrics.parent_peak_rss_mb} MB`,
    );
  } catch (err: unknown) {
    const error = classifyError(err);
    const attempts = attemptsOf(modelRecord.so_lan_thu) || 1;
    const decision = decideFailure(error, attempts, MAX_ATTEMPTS);
    metrics.duration_ms = Date.now() - started;
    metrics.parent_peak_rss_mb = peakRssMb();
    metrics.last_error = error.toJSON();
    console.error(
      `[ERROR] ${fileName}: [${error.code}/${error.kind}] ${error.message} → ${decision.status === 'error' ? `hàng đợi lỗi (${decision.loai_loi})` : `thử lại sau ${decision.thu_lai_sau}`}`,
    );
    await supabase
      .from('bim_models')
      .update({ ...decision, chi_so_xu_ly: metrics, ma_job: null, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .eq('ma_job', modelRecord.ma_job);
  } finally {
    clearInterval(heartbeat);
    cleanupJob?.();
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
};

// Thời điểm vòng quét gần nhất chạy xong (dùng cho /healthz).
let lastTick = Date.now();
let ticking = false;
const tick = async () => {
  // Tránh 2 lượt quét chồng nhau cùng nhận việc vượt giới hạn song song
  if (ticking) return;
  ticking = true;
  try {
    await recoverStaleJobs();
    while (running < concurrency) {
      const model = await claimNextModel();
      if (!model) break;
      const big = isBigFile(model.file_size, BIG_FILE_BYTES);
      running++;
      if (big) bigRunning++;
      processModel(model).finally(() => {
        running--;
        if (big) bigRunning--;
      });
    }
  } catch (err: any) {
    console.error('[GLOBAL ERROR]:', err.message);
  } finally {
    ticking = false;
    lastTick = Date.now();
  }
};

// /healthz: sống khi vòng quét gần nhất chạy trong 3 chu kỳ (không phụ thuộc thời lượng job, xem đánh giá 21/10 W1).
if (process.env.PORT) {
  http
    .createServer((req, res) => {
      const healthy = Date.now() - lastTick < pollingInterval * 3 + 60_000;
      res.writeHead(req.url === '/healthz' ? (healthy ? 200 : 503) : 404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ healthy, running, bigRunning, worker: WORKER_NAME }));
    })
    .listen(Number(process.env.PORT));
}

console.log(
  `[BIM-WORKER] Khởi động ${WORKER_NAME} (poll ${pollingInterval}ms, song song ${concurrency}, tệp ≥${Math.round(BIG_FILE_BYTES / 1048576)}MB chạy riêng, tối đa ${MAX_ATTEMPTS} lần thử, quét virus: ${scanMode()})`,
);
setInterval(tick, pollingInterval);
void tick();
