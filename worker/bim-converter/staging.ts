// Tiến trình con ghi cấu kiện theo lô vào bảng tạm bim_elements_staging (khóa job_id).
// Cấu kiện chỉ thay vào bim_elements trong MỘT giao dịch ở bim_swap_model_elements → người đọc không
// thấy dữ liệu dở; job hỏng giữa chừng chỉ để lại dòng tạm (được dọn ở lần nhận việc sau).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtractedElement } from './extractElements';
import { JobError, classifyError } from './errors';

export interface StagingTarget {
  jobId: string;
  modelId: string;
  projectId: string;
}

export const STAGING_BATCH = parseInt(process.env.BIM_STAGING_BATCH || '500', 10);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ghi một lô, thử lại lỗi tạm thời (mạng/5xx) tối đa 3 lần. */
async function insertBatch(supabase: SupabaseClient, rows: Record<string, unknown>[], attempts = 3) {
  for (let i = 1; ; i++) {
    const { error } = await supabase.from('bim_elements_staging').insert(rows);
    if (!error) return;
    const status = Number((error as { status?: number; code?: string }).status) || 0;
    const transient =
      !status || status >= 500 || status === 408 || status === 429 || /fetch failed|ECONN|timeout/i.test(error.message);
    if (!transient || i >= attempts) {
      throw new JobError('DATABASE', `Lỗi ghi bảng tạm cấu kiện: ${error.message}`, {
        kind: transient ? 'transient' : 'permanent',
      });
    }
    await sleep(500 * 2 ** i);
  }
}

export async function stageElements(
  supabase: SupabaseClient,
  target: StagingTarget,
  elements: ExtractedElement[],
  onProgress?: (done: number, total: number) => void,
  batch = STAGING_BATCH,
): Promise<number> {
  try {
    // Dọn dòng tạm cũ của mô hình (job trước bị ngắt) trước khi ghi job này.
    const { error } = await supabase
      .from('bim_elements_staging')
      .delete()
      .eq('model_id', target.modelId)
      .neq('job_id', target.jobId);
    if (error) throw new JobError('DATABASE', `Lỗi dọn bảng tạm: ${error.message}`, { kind: 'transient' });
    let done = 0;
    for (let i = 0; i < elements.length; i += batch) {
      const rows = elements.slice(i, i + batch).map((el) => ({
        ...el,
        job_id: target.jobId,
        model_id: target.modelId,
        project_id: target.projectId,
        thuoc_tinh: el.thuoc_tinh ?? {},
      }));
      await insertBatch(supabase, rows);
      done += rows.length;
      onProgress?.(done, elements.length);
    }
    return done;
  } catch (err) {
    throw classifyError(err);
  }
}
