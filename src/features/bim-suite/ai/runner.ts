// Runs tool calls (from quick commands now, from the server assistant at AI-6) against the viewer controller and the
// Uniclass context: undo checkpoint before each view-changing call, drafts never written, every call logged.
import { describeToolCall, type BimToolCall } from './plan';
import { BIM_DRAFT_TOOL_NAMES, BIM_UNICLASS_TOOL_LIST, BIM_VIEW_CHANGING_TOOLS } from './toolNames';
import { executeUniclassTool, type UniclassToolContext } from './uniclassActions';
import { executeBimViewerTool, type BimViewerController } from './viewerController';

export type BimAiActionStatus = 'thanh_cong' | 'khong_tim_thay' | 'loi' | 'ban_nhap';

/** One executed tool call, for the action log. */
export interface BimAiAction {
  id: string;
  tool: string;
  summary: string;
  status: BimAiActionStatus;
  found?: number;
  /** Short result note (ghi_chu / ket_qua of the tool). */
  note?: string;
  error?: string;
  durationMs: number;
  result: Record<string, unknown>;
}

export interface BimToolRuntime {
  controller: BimViewerController | null;
  uniclass?: UniclassToolContext | null;
}

const UNICLASS_TOOLS = new Set<string>(BIM_UNICLASS_TOOL_LIST);

export async function executeBimTool(call: BimToolCall, runtime: BimToolRuntime): Promise<Record<string, unknown>> {
  if (UNICLASS_TOOLS.has(call.name)) {
    if (!runtime.uniclass) return { error: 'Chưa có dữ liệu phân loại Uniclass của mô hình đang nạp.' };
    return executeUniclassTool(call.name, call.args, runtime.uniclass, runtime.controller);
  }
  if (!runtime.controller) return { error: 'Khung nhìn BIM chưa sẵn sàng.' };
  return executeBimViewerTool(call.name, call.args, runtime.controller);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let seq = 0;

export function actionStatus(result: Record<string, unknown>): BimAiActionStatus {
  if (!result.error) return Number(result.found) === 0 && 'message' in result ? 'khong_tim_thay' : 'thanh_cong';
  return result.found === 0 ? 'khong_tim_thay' : 'loi';
}

/** Run calls in order. Stops after a failed call ('loi') so later steps never act on an unexpected view. */
export async function runBimToolCalls(
  calls: BimToolCall[],
  runtime: BimToolRuntime,
  options: { signal?: AbortSignal; onAction?: (action: BimAiAction) => void } = {},
): Promise<BimAiAction[]> {
  const actions: BimAiAction[] = [];
  for (const call of calls) {
    options.signal?.throwIfAborted();
    const summary = describeToolCall(call.name, call.args);
    const started = now();
    seq += 1;
    const id = `bim-ai-${seq}`;
    let result: Record<string, unknown>;
    if (BIM_DRAFT_TOOL_NAMES.has(call.name)) {
      result = { ban_nhap: true, ghi_chu: 'Cần người dùng xác nhận trước khi ghi.' };
    } else {
      try {
        if (BIM_VIEW_CHANGING_TOOLS.has(call.name) && runtime.controller?.checkpoint)
          await runtime.controller.checkpoint(summary).catch(() => undefined);
        result = await executeBimTool(call, runtime);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    const status: BimAiActionStatus = BIM_DRAFT_TOOL_NAMES.has(call.name) ? 'ban_nhap' : actionStatus(result);
    const note = [result.ghi_chu, result.ket_qua, result.message].find((v) => typeof v === 'string') as
      string | undefined;
    const action: BimAiAction = {
      id,
      tool: call.name,
      summary,
      status,
      found: typeof result.found === 'number' ? result.found : undefined,
      note,
      error: typeof result.error === 'string' ? result.error : undefined,
      durationMs: Math.round(now() - started),
      result,
    };
    actions.push(action);
    options.onAction?.(action);
    if (status === 'loi') break;
  }
  return actions;
}
