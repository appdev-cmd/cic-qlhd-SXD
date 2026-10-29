// AI helpers of the ported BIM panels (cic-hud services/ai/bimAiExtras) and the browser side of the shared
// "Trợ lý BuildSIA" for BIM (plan section 5, AI-6). Pure functions over `fetch`: no React, no Supabase client and no
// model key, so the server tools (src/lib/assistant/tools/bim.ts) and tests import them too.
//
// Free-form questions go to /api/assistant/v3/runs (surface 'bim'). The server loop runs the data tools; viewer tool
// calls arrive as SSE `tool_call` events (execute 'client') and run here through ai/runner (undo checkpoint per view
// change, plan preview for ≥ 2 view-changing steps, drafts never written); each result is POSTed to
// /api/assistant/v3/runs/{id}/tool-results ({callId, ok, output}) while the loop waits.
import { buildPlan, needsPlanPreview, type BimToolCall, type ViewerPlan } from '../ai/plan';
import { guardToolOutput } from '../ai/outputGuard';
import { runBimToolCalls, type BimAiAction, type BimToolRuntime } from '../ai/runner';
import { BIM_DRAFT_TOOL_NAMES, BIM_TOOL_NAMES, BIM_VIEW_CHANGING_TOOLS } from '../ai/toolNames';
import { apiRequest } from '@/services/apiClient';

/**
 * Kept for the panels that import it (clash triage, cost mapping): those AI helpers are not wired to the assistant
 * yet. The viewer chat is enabled from the server policy instead (fetchBimAssistantPolicy).
 */
export const BIM_AI_ENABLED = false;

export interface ClashForAi {
  index: number;
  loaiA: string;
  tenA: string;
  loaiB: string;
  tenB: string;
  sauMm: number;
  kieu: string;
}

export interface ClashAiVerdict {
  index: number;
  verdict: 'that' | 'gia' | 'can_xem';
  reason: string;
}

export interface ClashClusterResult {
  clusterName: string;
  rootCause: string;
  suggestedAction: string;
  indices: number[];
}

const notEnabled = () => Promise.reject(new Error('Trợ lý AI cho mô hình BIM chưa được bật.'));

export const triageClashesWithAi = (_clashes: ClashForAi[]): Promise<ClashAiVerdict[]> => notEnabled();
export const clusterClashesWithAi = (_clashes: ClashForAi[]): Promise<ClashClusterResult[]> => notEnabled();

export interface EstimateLine {
  index: number;
  maHieu: string;
  ten: string;
  donVi: string;
}
export interface CostMappingSuggestion {
  index: number;
  loai_cau_kien: string | null;
  vat_lieu: string | null;
  do_tin_cay: number;
  ly_do: string;
}
export const suggestCostMapping = (
  _lines: EstimateLine[],
  _categories: { loai: string; soLuong: number; vatLieu: string[] }[],
): Promise<CostMappingSuggestion[]> => notEnabled();

// ── Policy ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const ASSISTANT_API = '/api/assistant/v3';
type Fetcher = typeof fetch;
const defaultFetch: Fetcher = (input, init) => fetch(input, init);

export interface BimAssistantPolicy {
  enabled: boolean;
  toolGroups: string[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Chat is enabled when the organization's latest policy is on and allows the 'bim' tool group. */
export async function fetchBimAssistantPolicy(
  scope: { organizationId?: string | null; projectId?: string | null },
  fetcher: Fetcher = defaultFetch,
  signal?: AbortSignal,
): Promise<BimAssistantPolicy> {
  if (fetcher === defaultFetch)
    return apiRequest<BimAssistantPolicy>(
      '/bim/assistant/policy?projectId=' + encodeURIComponent(scope.projectId || ''),
      { signal },
    );
  const query = new URLSearchParams();
  if (scope.organizationId) query.set('organizationId', scope.organizationId);
  if (scope.projectId) query.set('projectId', scope.projectId);
  try {
    const response = await fetcher(`${ASSISTANT_API}/policy?${query.toString()}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return { enabled: false, toolGroups: [] };
    const body: unknown = await response.json();
    const policy = record(body) && record(body.policy) ? body.policy : body;
    if (!record(policy)) return { enabled: false, toolGroups: [] };
    const groups = Array.isArray(policy.toolGroups)
      ? policy.toolGroups.filter((g): g is string => typeof g === 'string')
      : Array.isArray(policy.tool_groups)
        ? policy.tool_groups.filter((g): g is string => typeof g === 'string')
        : [];
    return { enabled: policy.enabled === true && groups.includes('bim'), toolGroups: groups };
  } catch {
    return { enabled: false, toolGroups: [] };
  }
}

// ── Result sets ────────────────────────────────────────────────────────────────────────────────────────────────────
// bim_search_elements returns only totals + ≤ 15 sample rows to the model, plus `ma_ket_qua` (R + 8 hex) and the
// query (`truy_van`). The model passes guids: ["R…"] to a viewer tool; the server-side parse of that viewer call
// attaches the query as `tap_ket_qua` (RESULT_SET_ARG), and the browser resolves the full GUID set itself through
// the RLS RPC, so the model never copies thousands of GUIDs. Sets seen once are kept for later questions.
export const RESULT_REF_PATTERN = /^R[0-9a-f]{8}$/;
export const RESULT_SET_LIMIT = 2000;
/** Argument the server adds to viewer calls that reference result sets (never declared to the model). */
export const RESULT_SET_ARG = 'tap_ket_qua';

export interface BimResultSetRef {
  ref: string;
  label: string;
  total: number;
  modelIds: string[];
  filters: Record<string, unknown>;
  projectId?: string;
}

/** Wire form of a result set inside a viewer call (snake case, like the tool data). */
export interface BimResultSetWire {
  ma: string;
  mo_ta?: string;
  tong_so?: number;
  model_ids: string[];
  bo_loc: Record<string, unknown>;
  project_id?: string;
}
export const resultSetToWire = (set: BimResultSetRef): BimResultSetWire => ({
  ma: set.ref,
  mo_ta: set.label,
  tong_so: set.total,
  model_ids: set.modelIds,
  bo_loc: set.filters,
  ...(set.projectId ? { project_id: set.projectId } : {}),
});
/** Result sets attached to a viewer call by the server (`tap_ket_qua`), limited to this project. */
export function harvestResultSets(args: Record<string, unknown>, projectId: string): BimResultSetRef[] {
  const list = Array.isArray(args[RESULT_SET_ARG]) ? (args[RESULT_SET_ARG] as unknown[]) : [];
  return list.flatMap((item) =>
    record(item) &&
    typeof item.ma === 'string' &&
    RESULT_REF_PATTERN.test(item.ma) &&
    record(item.bo_loc) &&
    (item.project_id === undefined || item.project_id === projectId)
      ? [
          {
            ref: item.ma,
            label: typeof item.mo_ta === 'string' ? item.mo_ta : item.ma,
            total: typeof item.tong_so === 'number' ? item.tong_so : 0,
            modelIds: Array.isArray(item.model_ids) ? item.model_ids.map(String) : [],
            filters: item.bo_loc,
            projectId,
          },
        ]
      : [],
  );
}

/** Result sets carried by a tool output (bim_search_elements), searched shallowly in common wrappers. */
export function collectResultSets(output: unknown): BimResultSetRef[] {
  const found: BimResultSetRef[] = [];
  const visit = (value: unknown, depth: number) => {
    if (!record(value) || depth > 3) return;
    const ref = value.ma_ket_qua;
    const query = value.truy_van;
    if (typeof ref === 'string' && RESULT_REF_PATTERN.test(ref) && record(query) && record(query.bo_loc)) {
      found.push({
        ref,
        label: typeof value.mo_ta === 'string' ? value.mo_ta : ref,
        total: typeof value.tong_so_khop === 'number' ? value.tong_so_khop : 0,
        modelIds: Array.isArray(query.model_ids) ? query.model_ids.map(String) : [],
        filters: query.bo_loc,
      });
      return;
    }
    for (const key of ['data', 'output', 'result']) visit(value[key], depth + 1);
  };
  visit(output, 0);
  return found;
}

export type ResultSetResolver = (set: BimResultSetRef) => Promise<{ guids: string[]; truncated?: boolean }>;

/** Replace result-set refs inside `guids` (and danh_sach[].guids) with the resolved GUIDs. */
export async function expandResultRefs(
  call: BimToolCall,
  sets: ReadonlyMap<string, BimResultSetRef>,
  resolve: ResultSetResolver | undefined,
  cache: Map<string, string[]> = new Map(),
): Promise<{ call: BimToolCall; refs: string[]; error?: string }> {
  const refs: string[] = [];
  const expand = async (list: unknown): Promise<unknown> => {
    if (!Array.isArray(list) || !list.some((g) => typeof g === 'string' && RESULT_REF_PATTERN.test(g))) return list;
    const out: string[] = [];
    for (const item of list) {
      if (typeof item !== 'string' || !RESULT_REF_PATTERN.test(item)) {
        if (typeof item === 'string') out.push(item);
        continue;
      }
      const set = sets.get(item);
      if (!set || !resolve) throw new Error(`Không tìm thấy tập kết quả ${item}. Hãy tìm lại cấu kiện.`);
      let guids = cache.get(item);
      if (!guids) {
        guids = (await resolve(set)).guids.slice(0, RESULT_SET_LIMIT);
        cache.set(item, guids);
      }
      refs.push(item);
      out.push(...guids);
    }
    return [...new Set(out)];
  };
  try {
    const args: Record<string, unknown> = { ...call.args };
    if ('guids' in args) args.guids = await expand(args.guids);
    if (Array.isArray(args.danh_sach))
      args.danh_sach = await Promise.all(
        args.danh_sach.map(async (item: unknown) =>
          record(item) && 'guids' in item ? { ...item, guids: await expand(item.guids) } : item,
        ),
      );
    return { call: { name: call.name, args }, refs };
  } catch (error) {
    return { call, refs, error: error instanceof Error ? error.message : String(error) };
  }
}

// ── Drafts ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface BimAssistantDraft {
  kind: 'draft';
  type: string;
  item_key: string;
  target: { module: string; action: string; projectId?: string };
  fields: Record<string, unknown>;
  notice?: string;
  /** Made in the browser (viewer_save_view): not an answer item of the run, so no decision is recorded. */
  local?: boolean;
}

const isDraft = (value: unknown): value is BimAssistantDraft =>
  record(value) &&
  value.kind === 'draft' &&
  typeof value.type === 'string' &&
  typeof value.item_key === 'string' &&
  record(value.target) &&
  record(value.fields);

/** Drafts inside a tool output or answer (draft_bcf_issue, draft_saved_view, viewer_save_view). */
export function collectDrafts(value: unknown): BimAssistantDraft[] {
  const found: BimAssistantDraft[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 4) return;
    if (isDraft(node)) {
      found.push(node);
      return;
    }
    if (Array.isArray(node)) for (const item of node.slice(0, 50)) visit(item, depth + 1);
    else if (record(node))
      for (const key of ['data', 'output', 'result', 'items', 'drafts']) visit(node[key], depth + 1);
  };
  visit(value, 0);
  return found;
}

/** Stable, synchronous 64-bit FNV-1a hex (item keys of browser-made drafts). */
function fnv64(text: string) {
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** viewer_save_view runs as a draft: the current view is saved only after the user accepts it. */
export function savedViewDraft(args: Record<string, unknown>, projectId: string): BimAssistantDraft {
  const fields = {
    project_id: projectId,
    name: String(args.ten ?? '')
      .trim()
      .slice(0, 200),
    description: typeof args.mo_ta === 'string' && args.mo_ta.trim() ? args.mo_ta.trim().slice(0, 4000) : null,
    state: null,
  };
  return {
    kind: 'draft',
    type: 'saved_view',
    item_key: `saved_view:${fnv64(JSON.stringify(['saved_view', fields]))}`,
    target: { module: 'bim', action: 'create_saved_view', projectId },
    fields,
    notice: 'Bản nháp: lưu góc nhìn hiện tại của trình xem khi bạn duyệt. Chưa ghi vào hệ thống.',
    local: true,
  };
}

// ── Browser execution of viewer tool calls ─────────────────────────────────────────────────────────────────────────
export const isBimBrowserTool = (name: string) => BIM_TOOL_NAMES.has(name);

export interface BrowserToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}
export interface BrowserToolResult {
  id: string;
  name: string;
  output: unknown;
}

export interface BrowserToolOptions {
  runtime: BimToolRuntime;
  projectId: string;
  resultSets: ReadonlyMap<string, BimResultSetRef>;
  resolveResultSet?: ResultSetResolver;
  /** Plan preview: called when ≥ 2 view-changing calls arrive together; false cancels all of them. */
  approvePlan?: (plan: ViewerPlan) => Promise<boolean>;
  onAction?: (action: BimAiAction) => void;
  onDraft?: (draft: BimAssistantDraft) => void;
  signal?: AbortSignal;
}

const compactOutput = (value: unknown) => guardToolOutput(value, { maxString: 1000, maxTotal: 20000 });
const CANCELLED = 'Người dùng đã hủy kế hoạch thao tác khung nhìn; khung nhìn giữ nguyên.';

/**
 * Runs viewer calls in order (same rules as the quick commands: checkpoint before each view change, stop after a
 * failed call). Every call gets exactly one result, in the original order. Result sets attached by the server
 * (`tap_ket_qua`) are remembered in `resultSets` when it is a Map.
 */
export async function runBrowserToolCalls(
  calls: BrowserToolCall[],
  options: BrowserToolOptions,
): Promise<{ results: BrowserToolResult[]; actions: BimAiAction[]; approved: boolean }> {
  const results = new Map<string, unknown>();
  const sets = options.resultSets instanceof Map ? options.resultSets : new Map(options.resultSets);
  const unknown = calls.filter((call) => !isBimBrowserTool(call.name));
  for (const call of unknown) results.set(call.id, { error: `Công cụ không chạy trong trình duyệt: ${call.name}` });
  const known = calls
    .filter((call) => isBimBrowserTool(call.name))
    .map((call) => {
      for (const set of harvestResultSets(call.args, options.projectId)) sets.set(set.ref, set);
      const { [RESULT_SET_ARG]: _attached, ...args } = call.args;
      return { ...call, args };
    });
  const finish = (approved: boolean, actions: BimAiAction[]) => ({
    results: calls.map((call) => ({
      id: call.id,
      name: call.name,
      output: results.get(call.id) ?? { error: 'Không chạy.' },
    })),
    actions,
    approved,
  });

  if (needsPlanPreview(known) && options.approvePlan) {
    const approved = await options.approvePlan(buildPlan(known));
    if (!approved) {
      for (const call of known) results.set(call.id, { error: CANCELLED, da_huy: true });
      return finish(false, []);
    }
  }

  const actions: BimAiAction[] = [];
  const cache = new Map<string, string[]>();
  let stopped: string | null = null;
  for (const call of known) {
    options.signal?.throwIfAborted();
    if (stopped) {
      results.set(call.id, { error: `Bỏ qua vì bước trước lỗi: ${stopped}` });
      continue;
    }
    if (BIM_DRAFT_TOOL_NAMES.has(call.name)) {
      const name = String(call.args.ten ?? '').trim();
      if (!name) {
        results.set(call.id, { error: 'Cần tên góc nhìn (ten).' });
        continue;
      }
      const draft = savedViewDraft(call.args, options.projectId);
      options.onDraft?.(draft);
      results.set(call.id, { ...draft, ghi_chu: 'Đã chuẩn bị bản nháp; chỉ lưu khi người dùng duyệt.' });
      continue;
    }
    const expanded = await expandResultRefs(call, sets, options.resolveResultSet, cache);
    if (expanded.error) {
      results.set(call.id, { found: 0, error: expanded.error });
      if (BIM_VIEW_CHANGING_TOOLS.has(call.name)) stopped = expanded.error;
      continue;
    }
    const [action] = await runBimToolCalls([expanded.call], options.runtime, {
      signal: options.signal,
      onAction: options.onAction,
    });
    if (!action) continue;
    actions.push(action);
    results.set(call.id, {
      ...(compactOutput(action.result) as Record<string, unknown>),
      ...(expanded.refs.length ? { ma_ket_qua: expanded.refs } : {}),
    });
    if (action.status === 'loi') stopped = action.error ?? action.summary;
  }
  return finish(true, actions);
}

// ── SSE client ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Events of src/lib/assistant/loop.ts (AssistantEvent): run, text {step, delta}, tool_call {id, name, kind, args,
// execute: 'server'|'client', step}, tool_result {id, name, ok, evidence: cite[]} (no data), evidence {items},
// answer {answer: {text, items, citations, verified, label}}, error {code, message}, done {runId, status}.
export interface EvidenceItem {
  kind: string;
  ref: Record<string, string | number>;
  label: string;
  href?: string;
  verified?: boolean;
  reason?: string;
}
/** Answer item of kind 'viewer': a viewer action the loop could not run (no browser answer), to run on click. */
export interface BimViewerRequest {
  key: string;
  name: string;
  args: Record<string, unknown>;
  notice?: string;
}
export type BimRunEvent =
  | { type: 'run'; runId: string; mode?: string }
  | { type: 'text'; delta: string }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      args: Record<string, unknown>;
      kind?: string;
      execute?: 'server' | 'client';
      step?: number;
    }
  | { type: 'tool_result'; id?: string; name?: string; ok?: boolean; output: unknown }
  | { type: 'evidence'; items: EvidenceItem[] }
  | {
      type: 'answer';
      text: string;
      verified?: boolean;
      label?: string;
      items: unknown[];
      evidence: EvidenceItem[];
    }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done'; status?: string };

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const evidenceList = (value: unknown): EvidenceItem[] =>
  (Array.isArray(value) ? value : record(value) ? [value] : []).filter(
    (item): item is EvidenceItem =>
      record(item) && typeof item.kind === 'string' && record(item.ref) && typeof item.label === 'string',
  );

/** Maps one SSE payload onto BimRunEvent; tolerant of flat or nested (`call`, `run`, `answer`) shapes. */
export function normalizeRunEvent(raw: unknown, eventName?: string): BimRunEvent | null {
  if (!record(raw)) return null;
  const type = str(raw.type) ?? eventName;
  switch (type) {
    case 'run': {
      const run = record(raw.run) ? raw.run : raw;
      const runId = str(raw.runId) ?? str(run.id) ?? str(run.runId);
      return runId ? { type: 'run', runId, mode: str(raw.mode) ?? str(run.mode) } : null;
    }
    case 'text': {
      const delta = str(raw.delta) ?? str(raw.text);
      return delta ? { type: 'text', delta } : null;
    }
    case 'tool_call': {
      const call = record(raw.call) ? raw.call : raw;
      const name = str(call.name);
      const id = str(call.id) ?? str(call.callId) ?? str(raw.id);
      if (!name || !id) return null;
      const execute = call.execute ?? raw.execute;
      const step = call.step ?? raw.step;
      return {
        type: 'tool_call',
        id,
        name,
        args: record(call.args) ? call.args : record(call.arguments) ? call.arguments : {},
        kind: str(call.kind) ?? str(raw.kind),
        ...(execute === 'server' || execute === 'client' ? { execute } : {}),
        ...(typeof step === 'number' ? { step } : {}),
      };
    }
    case 'tool_result': {
      const nested = record(raw.result) ? raw.result : null;
      return {
        type: 'tool_result',
        id: str(raw.id) ?? str(raw.callId),
        name: str(raw.name),
        ok: typeof raw.ok === 'boolean' ? raw.ok : undefined,
        output: raw.output ?? raw.data ?? nested?.data ?? nested ?? undefined,
      };
    }
    case 'evidence':
      return { type: 'evidence', items: evidenceList(raw.items ?? raw.evidence ?? raw) };
    case 'answer': {
      const answer = record(raw.answer) ? raw.answer : raw;
      return {
        type: 'answer',
        text: str(answer.text) ?? '',
        verified:
          typeof answer.verified === 'boolean'
            ? answer.verified
            : typeof raw.verified === 'boolean'
              ? raw.verified
              : undefined,
        label: str(answer.label),
        items: Array.isArray(answer.items) ? answer.items : [],
        evidence: evidenceList(answer.citations ?? answer.evidence ?? raw.evidence),
      };
    }
    case 'error':
      return {
        type: 'error',
        message: str(raw.message) ?? str(raw.error) ?? 'Trợ lý gặp lỗi.',
        code: str(raw.code),
      };
    case 'done':
      return { type: 'done', status: str(raw.status) };
    default:
      return null;
  }
}

/** Answer items (loop AnswerItem {key, kind: 'draft'|'viewer', type, fields, target, notice}) → drafts / requests. */
export function answerItems(items: unknown[]): { drafts: BimAssistantDraft[]; viewer: BimViewerRequest[] } {
  const drafts: BimAssistantDraft[] = [];
  const viewer: BimViewerRequest[] = [];
  for (const item of items.slice(0, 50)) {
    if (!record(item)) continue;
    if (isDraft(item)) {
      drafts.push(item);
      continue;
    }
    const key = str(item.key);
    if (!key || !record(item.fields)) continue;
    if (item.kind === 'draft' && typeof item.type === 'string' && record(item.target))
      drafts.push({
        kind: 'draft',
        type: item.type,
        item_key: key,
        target: item.target as BimAssistantDraft['target'],
        fields: item.fields,
        notice: str(item.notice),
      });
    else if (item.kind === 'viewer' && typeof item.fields.name === 'string' && isBimBrowserTool(item.fields.name))
      viewer.push({
        key,
        name: item.fields.name,
        args: record(item.fields.args) ? item.fields.args : {},
        notice: str(item.notice),
      });
  }
  return { drafts, viewer };
}

/** Parses a text/event-stream body (data lines joined, comments ignored). */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<BimRunEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = function* (block: string): Generator<BimRunEvent> {
    let eventName: string | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') eventName = value;
      else if (field === 'data') data.push(value);
    }
    if (!data.length) return;
    try {
      const event = normalizeRunEvent(JSON.parse(data.join('\n')), eventName);
      if (event) yield event;
    } catch {
      // Not JSON: ignore the block.
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        yield* flush(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield* flush(buffer);
  } finally {
    reader.releaseLock();
  }
}

// ── Runs ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface BimAssistantRequest {
  projectId: string;
  organizationId?: string | null;
  question: string;
  /** Models loaded in the viewer (scope of the answer). */
  modelIds: string[];
  /** Selected elements in the viewer. */
  selection?: { modelId: string; expressId?: number; guid?: string; name?: string; category?: string }[];
  /** Earlier turns of this panel (text only). */
  history?: { role: 'user' | 'model'; text: string }[];
}

export interface BimAssistantAnswer {
  runId: string | null;
  mode: 'chat' | 'queued';
  text: string;
  verified?: boolean;
  /** "chưa kiểm chứng" etc. from the server. */
  label?: string;
  evidence: EvidenceItem[];
  drafts: BimAssistantDraft[];
  viewerRequests: BimViewerRequest[];
  actions: BimAiAction[];
  error?: string;
}

export interface BimRunHandlers {
  onRun?: (runId: string) => void;
  onText?: (delta: string, full: string) => void;
  onProgress?: (message: string) => void;
  onAction?: (action: BimAiAction) => void;
  onEvidence?: (items: EvidenceItem[]) => void;
  onDraft?: (draft: BimAssistantDraft) => void;
  /** Plan preview: ≥ 2 view-changing calls in one model step; false cancels the rest of that step. */
  approvePlan?: (plan: ViewerPlan) => Promise<boolean>;
}

export interface BimRunDeps {
  fetcher?: Fetcher;
  runtime?: BimToolRuntime | null;
  resultSets?: Map<string, BimResultSetRef>;
  resolveResultSet?: ResultSetResolver;
  signal?: AbortSignal;
  /** Idle time after the last client tool_call before the calls run (a loop that sends a whole step at once). */
  idleMs?: number;
}

async function errorMessage(response: Response) {
  try {
    const body: unknown = await response.json();
    if (record(body)) return str(body.message) ?? str(body.error) ?? `Lỗi ${response.status}`;
  } catch {
    // fall through
  }
  return response.status === 403 ? 'Bạn không có quyền dùng Trợ lý BuildSIA ở dự án này.' : `Lỗi ${response.status}`;
}

/** POST /runs/{id}/tool-results: one viewer call result ({callId, ok, output | error}). */
export async function postToolResult(
  runId: string,
  result: BrowserToolResult,
  fetcher: Fetcher = defaultFetch,
  signal?: AbortSignal,
) {
  const output = result.output;
  const cancelled = record(output) && output.da_huy === true;
  const response = await fetcher(`${ASSISTANT_API}/runs/${encodeURIComponent(runId)}/tool-results`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      cancelled
        ? { callId: result.id, ok: false, error: String(output.error).slice(0, 300) }
        : { callId: result.id, ok: true, output },
    ),
    signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function postAssistantDecision(
  runId: string,
  decision: { itemKey: string; decision: 'accepted' | 'rejected'; note?: string; edits?: Record<string, unknown> },
  fetcher: Fetcher = defaultFetch,
) {
  const response = await fetcher(`${ASSISTANT_API}/runs/${encodeURIComponent(runId)}/decisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(decision),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

const progressLabel = (name: string) =>
  name.startsWith('bim_') || name.startsWith('draft_')
    ? 'Đang tra cứu dữ liệu mô hình…'
    : name.startsWith('viewer_')
      ? 'Đang điều khiển khung nhìn…'
      : 'Đang tra cứu…';

const QUESTION_LIMIT = 4000;
/**
 * The run route reads only the question and history, so the viewer context (loaded models, selection) travels as a
 * short bracketed note after the question (also sent as `context` for a runtime that reads it).
 */
export function questionWithContext(request: BimAssistantRequest): string {
  const parts: string[] = [];
  if (request.modelIds.length) parts.push(`mô hình đang nạp (model_ids): ${request.modelIds.slice(0, 20).join(', ')}`);
  const selected = (request.selection ?? [])
    .slice(0, 10)
    .map((s) =>
      s.guid
        ? `${s.guid}${s.category || s.name ? ` (${[s.category, s.name].filter(Boolean).join(' ').slice(0, 80)})` : ''}`
        : `express ${s.expressId ?? '?'} của ${s.modelId}`,
    );
  if (selected.length) parts.push(`cấu kiện đang chọn: ${selected.join('; ')}`);
  const question = request.question.trim();
  if (!parts.length) return question.slice(0, QUESTION_LIMIT);
  const note = `\n\n[Ngữ cảnh trình xem BIM — ${parts.join(' · ')}]`;
  return question.length + note.length <= QUESTION_LIMIT ? question + note : question.slice(0, QUESTION_LIMIT);
}

/**
 * Streams one assistant run: text, evidence and drafts go to the handlers; viewer tool calls (execute 'client') run in
 * the browser and each result is POSTed back while the loop waits. The plan preview opens before the first view
 * change when a step's calls arrive together, otherwise at the second view-changing call of a step.
 */
export async function streamBimAssistant(
  request: BimAssistantRequest,
  handlers: BimRunHandlers = {},
  deps: BimRunDeps = {},
): Promise<BimAssistantAnswer> {
  if (!deps.fetcher) {
    handlers.onProgress?.('Đang tổng hợp dữ liệu BIM và đối chiếu ngữ cảnh…');
    const answer = await apiRequest<BimAssistantAnswer>('/bim/assistant', {
      method: 'POST',
      body: JSON.stringify(request),
      signal: deps.signal,
    });
    if (answer.runId) handlers.onRun?.(answer.runId);
    handlers.onText?.(answer.text, answer.text);
    handlers.onEvidence?.(answer.evidence);
    if (deps.runtime && answer.viewerRequests.length) {
      const result = await runBrowserToolCalls(
        answer.viewerRequests.map((r) => ({ id: r.key, name: r.name, args: r.args })),
        {
          runtime: deps.runtime,
          projectId: request.projectId,
          resultSets: deps.resultSets || new Map(),
          approvePlan: handlers.approvePlan,
          onAction: handlers.onAction,
          onDraft: handlers.onDraft,
          signal: deps.signal,
        },
      );
      answer.actions = result.actions;
      answer.viewerRequests = [];
    }
    return answer;
  }
  const fetcher = deps.fetcher ?? defaultFetch;
  const resultSets = deps.resultSets ?? new Map<string, BimResultSetRef>();
  const answer: BimAssistantAnswer = {
    runId: null,
    mode: 'chat',
    text: '',
    evidence: [],
    drafts: [],
    viewerRequests: [],
    actions: [],
  };
  const draftKeys = new Set<string>();
  const addDraft = (draft: BimAssistantDraft) => {
    if (draftKeys.has(draft.item_key)) return;
    draftKeys.add(draft.item_key);
    answer.drafts.push(draft);
    handlers.onDraft?.(draft);
  };
  const addEvidence = (items: EvidenceItem[]) => {
    const index = new Map(answer.evidence.map((e, i) => [`${e.kind}:${JSON.stringify(e.ref)}`, i]));
    const fresh: EvidenceItem[] = [];
    for (const item of items) {
      const key = `${item.kind}:${JSON.stringify(item.ref)}`;
      const at = index.get(key);
      // A later event (answer citations) carries the verification result: it wins.
      if (at !== undefined) answer.evidence[at] = { ...answer.evidence[at], ...item };
      else {
        index.set(key, answer.evidence.length);
        answer.evidence.push(item);
        fresh.push(item);
      }
    }
    if (fresh.length) handlers.onEvidence?.(fresh);
  };

  const response = await fetcher(`${ASSISTANT_API}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      surface: 'bim',
      organizationId: request.organizationId ?? undefined,
      projectId: request.projectId,
      question: questionWithContext(request),
      context: {
        modelIds: request.modelIds,
        selection: (request.selection ?? []).slice(0, 20),
        resultSets: [...resultSets.values()].slice(-5).map(({ ref, label, total }) => ({ ref, label, total })),
      },
      ...(request.history?.length
        ? { history: request.history.slice(-8).map((t) => ({ role: t.role, text: t.text.slice(0, 2000) })) }
        : {}),
    }),
    signal: deps.signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/event-stream') || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    const run = record(body) && record(body.run) ? body.run : body;
    answer.runId = record(run) ? (str(run.runId) ?? str(run.id) ?? null) : null;
    answer.mode = record(body) && body.mode === 'queued' ? 'queued' : 'chat';
    if (answer.runId) handlers.onRun?.(answer.runId);
    answer.text =
      answer.mode === 'queued'
        ? 'Câu hỏi đã được xếp hàng; trợ lý sẽ trả lời khi dịch vụ AI sẵn sàng (xem lịch sử Trợ lý BuildSIA).'
        : record(body) && typeof body.text === 'string'
          ? body.text
          : '';
    return answer;
  }

  const iterator = parseSse(response.body)[Symbol.asyncIterator]();
  const pending: (BrowserToolCall & { step?: number })[] = [];
  const steps = new Map<number, { ran: BimToolCall[]; approved: boolean | null }>();
  const idleMs = deps.idleMs ?? 120;
  const flush = async () => {
    const calls = pending.splice(0);
    if (!calls.length) return;
    if (!answer.runId) throw new Error('Thiếu mã lượt hỏi để gửi kết quả khung nhìn.');
    let results: BrowserToolResult[];
    if (!deps.runtime) {
      results = calls.map((call) => ({
        id: call.id,
        name: call.name,
        output: { error: 'Khung nhìn 3D chưa sẵn sàng.' },
      }));
    } else {
      const state = steps.get(calls[0].step ?? -1) ?? { ran: [], approved: null };
      steps.set(calls[0].step ?? -1, state);
      const changes = calls.filter((call) => BIM_VIEW_CHANGING_TOOLS.has(call.name));
      let approved = state.approved;
      // One call at a time (the loop waits for each result): ask at the second view change of the step.
      if (approved === null && changes.length && state.ran.length && handlers.approvePlan)
        approved = state.approved = await handlers.approvePlan(buildPlan([...state.ran, ...calls]));
      if (approved === false && changes.length) {
        results = calls.map((call) => ({
          id: call.id,
          name: call.name,
          output: BIM_VIEW_CHANGING_TOOLS.has(call.name)
            ? { error: CANCELLED, da_huy: true }
            : { error: 'Không chạy.' },
        }));
      } else {
        handlers.onProgress?.('Đang điều khiển khung nhìn…');
        const run = await runBrowserToolCalls(calls, {
          runtime: deps.runtime,
          projectId: request.projectId,
          resultSets,
          resolveResultSet: deps.resolveResultSet,
          // A whole step at once: preview before anything changes.
          approvePlan: approved === null ? handlers.approvePlan : undefined,
          onAction: (action) => {
            answer.actions.push(action);
            handlers.onAction?.(action);
          },
          onDraft: addDraft,
          signal: deps.signal,
        });
        if (approved === null && changes.length >= 2 && handlers.approvePlan) state.approved = run.approved;
        state.ran.push(...changes.map((call) => ({ name: call.name, args: call.args })));
        results = run.results;
      }
    }
    for (const result of results) await postToolResult(answer.runId, result, fetcher, deps.signal);
  };

  let next = iterator.next();
  for (;;) {
    let step: IteratorResult<BimRunEvent> | 'idle';
    if (pending.length) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      step = await Promise.race([
        next,
        new Promise<'idle'>((resolve) => (timer = setTimeout(() => resolve('idle'), idleMs))),
      ]);
      clearTimeout(timer);
      if (step === 'idle') {
        await flush();
        continue;
      }
    } else step = await next;
    if (step.done) break;
    next = iterator.next();
    const event = step.value;
    if (event.type !== 'tool_call' && pending.length) await flush();
    switch (event.type) {
      case 'run':
        answer.runId = event.runId;
        if (event.mode === 'queued') answer.mode = 'queued';
        handlers.onRun?.(event.runId);
        break;
      case 'text':
        answer.text += event.delta;
        handlers.onText?.(event.delta, answer.text);
        break;
      case 'tool_call': {
        const client = event.execute ? event.execute === 'client' : isBimBrowserTool(event.name);
        if (client) {
          if (pending.length && pending[0].step !== event.step) await flush();
          pending.push({ id: event.id, name: event.name, args: event.args, step: event.step });
        } else handlers.onProgress?.(progressLabel(event.name));
        break;
      }
      case 'tool_result':
        for (const set of collectResultSets(event.output)) resultSets.set(set.ref, set);
        for (const draft of collectDrafts(event.output)) addDraft(draft);
        break;
      case 'evidence':
        addEvidence(event.items);
        break;
      case 'answer': {
        answer.text = event.text || answer.text;
        answer.verified = event.verified;
        answer.label = event.label;
        addEvidence(event.evidence);
        const items = answerItems(event.items);
        for (const draft of items.drafts) addDraft(draft);
        answer.viewerRequests.push(...items.viewer);
        break;
      }
      case 'error':
        answer.error = event.message;
        break;
      case 'done':
        break;
    }
    if (event.type === 'done') break;
  }
  if (pending.length) await flush();
  return answer;
}

// ── Compatibility wrapper ──────────────────────────────────────────────────────────────────────────────────────────
export interface BimAssistantReply {
  text: string;
  /** Viewer tool calls the assistant ran, or asks the user to run (answer items of kind 'viewer'). */
  toolCalls: { name: string; args: Record<string, unknown> }[];
  /** Evidence the answer relies on (documents, elements), checked server-side. */
  sources?: { label: string; url?: string }[];
  answer?: BimAssistantAnswer;
}

/** One question to the shared assistant (v3 route); viewer calls run when `deps.runtime` is given. */
export async function askBimAssistant(
  request: BimAssistantRequest,
  deps: BimRunDeps & { handlers?: BimRunHandlers } = {},
): Promise<BimAssistantReply> {
  const answer = await streamBimAssistant(request, deps.handlers, deps);
  if (answer.error && !answer.text) throw new Error(answer.error);
  return {
    text: answer.text,
    toolCalls: answer.viewerRequests.map((r) => ({ name: r.name, args: r.args })),
    sources: answer.evidence.map((e) => ({ label: e.label, url: e.href })),
    answer,
  };
}
