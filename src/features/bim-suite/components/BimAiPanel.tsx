import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
('use client');
// "Trợ lý mô hình": viewer-sidebar panel with two modes.
// * Lệnh nhanh (default, always available): Vietnamese commands run on the 3D model WITHOUT a language model
//   (ai/quickCommands + ai/quickUniclass through ai/runner), suggestion chips, undo and a short action log.
// * Hỏi đáp (when the organization's assistant policy is on and allows the 'bim' tool group): questions go to the
//   shared "Trợ lý BuildSIA" (/api/assistant/v3/runs, surface 'bim'); viewer tool calls run here through ai/runner
//   (plan preview for ≥ 2 view changes, undo), answers show evidence (BIM elements fly the camera) and drafts
//   (BCF issue, saved view) wait as proposals the user accepts through the normal BIM services.
//   Sentences the quick commands fully understand still run locally, without the model.
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Check,
  CornerDownLeft,
  Crosshair,
  ExternalLink,
  Info,
  Loader2,
  MessageSquare,
  Save,
  Square,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import type { BimIssue, BimModel, BimViewpoint } from '@/features/bim-suite/types/bim.types';
import type { BimViewerRef } from '../viewer/types';
import {
  fetchBimAssistantPolicy,
  postAssistantDecision,
  RESULT_SET_LIMIT,
  runBrowserToolCalls,
  streamBimAssistant,
  type BimAssistantDraft,
  type BimAssistantRequest,
  type BimResultSetRef,
  type EvidenceItem,
  type ResultSetResolver,
} from '../adapters/ai';
import { useBimAccess } from '../adapters/context';
import { useToast } from '../adapters/toast';
import { buildPlan, describeToolCall, needsPlanPreview, type BimToolCall, type ViewerPlan } from '../ai/plan';
import { parseQuickCommand, type QuickCommandContext } from '../ai/quickCommands';
import { quickUniclassPlan, runQuickUniclass } from '../ai/quickUniclass';
import { runBimToolCalls, type BimAiAction } from '../ai/runner';
import { legacyDb } from '../lib/bimDb';
import { BimService } from '../services/BimService';
import { BimUniclassService } from '../services/BimUniclassService';
import { readViewerCommandContext, useAiViewerController, type AiViewerHost } from '../hooks/useAiViewerController';
import { BimAiActionList, BimAiPlanPreview } from './BimAiActions';

/** Suggestions (cic-hud VIEWER_SUGGESTIONS adapted to the commands that run without a model). */
const SUGGESTIONS = [
  'Chỉ hiện cột',
  'Tô màu cột đỏ, dầm xanh',
  'X-Ray dầm',
  'Chỉ hiện kết cấu',
  'Nhìn từ trên',
  'Cắt ở giữa',
  'Tắt mặt cắt',
  'Hiện tất cả',
];
const CHAT_SUGGESTIONS = [
  'Có bao nhiêu cột ở tầng 3? Tô đỏ chúng',
  'Cửa chống cháy nào chưa nghiệm thu?',
  'Thống kê thể tích bê tông theo tầng',
  'Các vướng mắc đang mở',
];
const LOG_LIMIT = 12;

export interface BimAiPanelProps {
  projectId: string;
  viewerRef: RefObject<BimViewerRef | null>;
  /** Project models shown by the viewer page (disciplines, file names). */
  models: BimModel[];
  /** Models loaded in the viewer; commands act on these. */
  loadedIds: string[];
  /** Project writer: may confirm drafts such as "lưu góc nhìn …". */
  canEdit: boolean;
  className?: string;
  /** Callbacks into the viewer page so its section / visibility state follows the assistant (recommended). */
  host?: AiViewerHost;
  /** Name stored as created_by of saved views. */
  userName?: string | null;
  onClose?: () => void;
}

interface Reply {
  kind: 'ok' | 'info' | 'error';
  text: string;
}
interface ChatTurn {
  id: number;
  role: 'user' | 'model';
  text: string;
  status?: 'streaming' | 'done' | 'error' | 'queued';
  evidence?: EvidenceItem[];
  verified?: boolean;
  label?: string;
  quick?: boolean;
}
interface Proposal {
  draft: BimAssistantDraft;
  runId: string | null;
  status: 'pending' | 'saving' | 'accepted' | 'rejected';
  error?: string;
}

/** Policy of the project's organization: chat only when enabled and the 'bim' tool group is allowed. */
function useBimAssistantPolicy(organizationId: string | null, projectId: string) {
  return useQuery({
    queryKey: ['assistant-policy', organizationId, projectId],
    queryFn: ({ signal }) => fetchBimAssistantPolicy({ organizationId, projectId }, undefined, signal),
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

const draftTitle = (draft: BimAssistantDraft) =>
  draft.type === 'bcf_issue'
    ? `Vướng mắc: ${String(draft.fields.title ?? '')}`
    : draft.type === 'saved_view'
      ? `Lưu góc nhìn “${String(draft.fields.name ?? '')}”`
      : draft.type === 'viewer_action'
        ? `Khung nhìn: ${describeToolCall(String(draft.fields.name ?? ''), (draft.fields.args ?? {}) as Record<string, unknown>)}`
        : `Đề xuất ${draft.type}`;
const str = (value: unknown) => (typeof value === 'string' && value ? value : null);

let turnSeq = 0;

export function BimAiPanel({
  projectId,
  viewerRef,
  models,
  loadedIds,
  canEdit,
  className = '',
  host,
  userName,
  onClose,
}: BimAiPanelProps) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const access = useBimAccess();
  const { controller, uniclass } = useAiViewerController({ viewerRef, projectId, models, loadedIds, userName, host });
  const policy = useBimAssistantPolicy(access.organizationId ?? null, projectId);
  const chatEnabled = policy.data?.enabled === true;
  const [mode, setMode] = useState<'lenh' | 'hoi' | null>(null);
  const chatMode = chatEnabled && (mode ?? 'hoi') === 'hoi';
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [log, setLog] = useState<BimAiAction[]>([]);
  const [plan, setPlan] = useState<ViewerPlan | null>(null);
  const [draft, setDraft] = useState<{ name: string } | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);
  const [lastQuestion, setLastQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [runPlan, setRunPlan] = useState<{ plan: ViewerPlan; resolve: (ok: boolean) => void } | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultSets = useRef(new Map<string, BimResultSetRef>());
  // Categories and storeys of the loaded models, read once per composition (event handlers only).
  const contextCache = useRef<{ key: string; value: QuickCommandContext } | null>(null);
  const loadedKey = [...loadedIds].sort().join(',');

  useEffect(() => () => abortRef.current?.abort(), []);

  const codes = useQuery({
    queryKey: ['bim-uniclass', [...loadedIds].sort()],
    queryFn: () => BimUniclassService.summary(loadedIds),
    enabled: loadedIds.length > 0,
    staleTime: 60_000,
  });

  const commandContext = async (): Promise<QuickCommandContext> => {
    if (contextCache.current?.key === loadedKey) return contextCache.current.value;
    const value = await readViewerCommandContext(viewerRef.current, loadedIds);
    contextCache.current = { key: loadedKey, value };
    return value;
  };

  const record = (actions: BimAiAction[]) => {
    setLog((prev) => [...actions, ...prev].slice(0, LOG_LIMIT));
    setUndoDepth(controller.undoDepth?.() ?? 0);
  };

  const summarize = (actions: BimAiAction[]): Reply => {
    const failed = actions.find((a) => a.status === 'loi' || a.status === 'khong_tim_thay');
    if (failed)
      return { kind: failed.status === 'loi' ? 'error' : 'info', text: failed.error ?? failed.note ?? failed.summary };
    const last = actions[actions.length - 1];
    if (last?.tool === 'viewer_list_saved_views') {
      const views = (last.result.goc_nhin as { name: string }[] | undefined) ?? [];
      return {
        kind: 'ok',
        text: views.length
          ? `Góc nhìn đã lưu: ${views.map((v) => v.name).join(', ')}.`
          : 'Dự án chưa có góc nhìn đã lưu.',
      };
    }
    if (last?.tool === 'viewer_measure_distance') {
      const r = last.result as { khoang_cach_tam_m?: number; khoang_ho_m?: number };
      return {
        kind: 'ok',
        text: `Khoảng cách tâm ${r.khoang_cach_tam_m} m · khoảng hở ${r.khoang_ho_m} m (theo khung bao).`,
      };
    }
    return { kind: 'ok', text: actions.map((a) => a.note ?? a.summary).join(' · ') };
  };

  const pushTurn = (turn: Omit<ChatTurn, 'id'>) => {
    const id = ++turnSeq;
    setTurns((prev) => [...prev, { ...turn, id }].slice(-30));
    return id;
  };
  const patchTurn = (id: number, patch: Partial<ChatTurn>) =>
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const execute = async (calls: BimToolCall[]) => {
    setBusy(true);
    try {
      const drafts = calls.filter((call) => call.name === 'viewer_save_view');
      const actions = await runBimToolCalls(calls, { controller, uniclass });
      record(actions);
      let result: Reply;
      if (drafts.length) {
        setDraft({ name: String(drafts[0].args.ten ?? '') });
        result = {
          kind: 'info',
          text: `Bản nháp: lưu góc nhìn hiện tại với tên “${String(drafts[0].args.ten ?? '')}”.`,
        };
      } else result = summarize(actions);
      setReply(result);
      return result;
    } catch (e) {
      const result: Reply = { kind: 'error', text: e instanceof Error ? e.message : String(e) };
      setReply(result);
      return result;
    } finally {
      setBusy(false);
    }
  };

  /** LLM-free path. 'handled' when the sentence ran (or waits for plan approval); otherwise the parser's message. */
  const runQuick = async (
    question: string,
  ): Promise<{ handled: true; reply?: Reply } | { handled: false; message: string }> => {
    if (codes.data?.length && quickUniclassPlan(question, codes.data)) {
      setBusy(true);
      try {
        const answer = await runQuickUniclass(question, codes.data, { controller, uniclass });
        if (answer) {
          record(answer.actions);
          const result: Reply = { kind: 'ok', text: answer.text.replace(/\*\*|_/g, '') };
          setReply(result);
          return { handled: true, reply: result };
        }
      } catch (e) {
        const result: Reply = { kind: 'error', text: e instanceof Error ? e.message : String(e) };
        setReply(result);
        return { handled: true, reply: result };
      } finally {
        setBusy(false);
      }
    }
    let context: QuickCommandContext = {};
    try {
      context = await commandContext();
    } catch {
      // The command still parses; only the category / storey checks are skipped.
    }
    const parsed = parseQuickCommand(question, context);
    if (!parsed.calls) return { handled: false, message: parsed.message };
    if (needsPlanPreview(parsed.calls)) {
      setPlan(buildPlan(parsed.calls));
      return { handled: true };
    }
    return { handled: true, reply: await execute(parsed.calls) };
  };

  /** Selected elements with their GUIDs (≤ 20), as context of the question. */
  const readSelection = async (): Promise<NonNullable<BimAssistantRequest['selection']>> => {
    const selected = (viewerRef.current?.getSelection() ?? []).slice(0, 20);
    if (!selected.length) return [];
    const byModel = new Map<string, number[]>();
    for (const s of selected) byModel.set(s.modelId, [...(byModel.get(s.modelId) ?? []), s.expressId]);
    const rows = new Map<string, { guid?: string; name?: string; category?: string }>();
    try {
      await Promise.all(
        [...byModel].map(async ([modelId, ids]) => {
          const { data } = await legacyDb
            .from('bim_elements')
            .select('model_id,express_id,global_id,ten_cau_kien,loai_cau_kien')
            .eq('model_id', modelId)
            .in('express_id', ids);
          for (const row of (data ?? []) as Record<string, unknown>[])
            rows.set(`${String(row.model_id)}:${String(row.express_id)}`, {
              guid: str(row.global_id) ?? undefined,
              name: str(row.ten_cau_kien) ?? undefined,
              category: str(row.loai_cau_kien) ?? undefined,
            });
        }),
      );
    } catch {
      // Selection without GUIDs is still useful context.
    }
    return selected.map((s) => ({
      modelId: s.modelId,
      expressId: s.expressId,
      ...rows.get(`${s.modelId}:${s.expressId}`),
    }));
  };

  /** Full GUID set of a search result (RLS RPC in the browser), for viewer calls with guids: ["R…"]. */
  const resolveResultSet: ResultSetResolver = async (set) => {
    const { data, error } = await legacyDb.rpc('bim_ai_search_elements', {
      p_project: projectId,
      p_model_ids: set.modelIds.length ? set.modelIds : null,
      p_filters: set.filters,
      p_limit: RESULT_SET_LIMIT,
      p_offset: 0,
    });
    if (error) throw new Error(`Không đọc được tập kết quả ${set.ref}: ${error.message}`);
    const rows = Array.isArray((data as { ket_qua?: unknown } | null)?.ket_qua)
      ? ((data as { ket_qua: { global_id?: string }[] }).ket_qua ?? [])
      : [];
    return {
      guids: rows.map((r) => String(r.global_id ?? '')).filter(Boolean),
      truncated: Boolean((data as { bi_gioi_han?: boolean } | null)?.bi_gioi_han),
    };
  };

  const askAssistant = async (question: string) => {
    if (!chatEnabled) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const history = turns
      .filter((t) => t.text && t.status !== 'error')
      .slice(-8)
      .map((t) => ({ role: t.role, text: t.text }));
    pushTurn({ role: 'user', text: question });
    const answerId = pushTurn({ role: 'model', text: '', status: 'streaming' });
    setBusy(true);
    setRunning(true);
    setProgress('Đang phân tích câu hỏi…');
    let runId: string | null = null;
    try {
      const selection = await readSelection();
      const answer = await streamBimAssistant(
        { projectId, organizationId: access.organizationId, question, modelIds: loadedIds, selection, history },
        {
          onRun: (id) => (runId = id),
          onText: (_delta, full) => patchTurn(answerId, { text: full }),
          onProgress: setProgress,
          onAction: (action) => record([action]),
          onDraft: (d) =>
            setProposals((prev) =>
              prev.some((p) => p.draft.item_key === d.item_key && p.runId === runId)
                ? prev
                : [...prev, { draft: d, runId, status: 'pending' }],
            ),
          approvePlan: (next) =>
            new Promise<boolean>((resolve) => {
              const onAbort = () => resolve(false);
              abort.signal.addEventListener('abort', onAbort, { once: true });
              setRunPlan({
                plan: next,
                resolve: (ok) => {
                  abort.signal.removeEventListener('abort', onAbort);
                  setRunPlan(null);
                  resolve(ok);
                },
              });
            }),
        },
        { runtime: { controller, uniclass }, resultSets: resultSets.current, resolveResultSet, signal: abort.signal },
      );
      patchTurn(answerId, {
        text: answer.text || answer.error || 'Trợ lý không trả lời.',
        status: answer.mode === 'queued' ? 'queued' : answer.error && !answer.text ? 'error' : 'done',
        evidence: answer.evidence,
        verified: answer.verified,
        label: answer.label,
      });
      // Viewer actions the loop could not run (no browser answer in time): offered as one-click proposals.
      if (answer.viewerRequests.length)
        setProposals((prev) => [
          ...prev,
          ...answer.viewerRequests.map(
            (r): Proposal => ({
              draft: {
                kind: 'draft',
                type: 'viewer_action',
                item_key: r.key,
                target: { module: 'bim', action: r.name },
                fields: { name: r.name, args: r.args },
                notice: r.notice,
              },
              runId: answer.runId,
              status: 'pending',
            }),
          ),
        ]);
    } catch (e) {
      const aborted = abort.signal.aborted;
      patchTurn(answerId, {
        text: aborted ? 'Đã dừng câu hỏi.' : e instanceof Error ? e.message : String(e),
        status: 'error',
      });
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setRunPlan(null);
      setProgress(null);
      setRunning(false);
      setBusy(false);
    }
  };

  const submit = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    if (!loadedIds.length && !chatMode) {
      setReply({ kind: 'info', text: 'Hãy nạp ít nhất một mô hình trước khi ra lệnh.' });
      return;
    }
    setPlan(null);
    setDraft(null);
    setLastQuestion(question);
    setInput('');
    if (chatMode) {
      setReply(null);
      if (loadedIds.length) {
        const quick = await runQuick(question);
        if (quick.handled) {
          pushTurn({ role: 'user', text: question });
          pushTurn({
            role: 'model',
            text: quick.reply?.text ?? 'Lệnh nhiều bước — duyệt kế hoạch bên dưới.',
            status: quick.reply?.kind === 'error' ? 'error' : 'done',
            quick: true,
          });
          return;
        }
      }
      await askAssistant(question);
      return;
    }
    const quick = await runQuick(question);
    if (!quick.handled) {
      setInput(question);
      setReply({ kind: 'info', text: quick.message });
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(input);
  };

  const undo = async () => {
    setBusy(true);
    try {
      const actions = await runBimToolCalls([{ name: 'viewer_undo', args: {} }], { controller, uniclass });
      record(actions);
      setReply(summarize(actions));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!draft || !controller.saveView) return;
    setBusy(true);
    try {
      const saved = await controller.saveView(draft.name);
      addToast({ type: 'success', message: `Đã lưu góc nhìn “${saved.name}”.` });
      setReply({ kind: 'ok', text: `Đã lưu góc nhìn “${saved.name}”.` });
      setDraft(null);
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  /** Turns an accepted draft into a record through the normal BIM services (RLS), then nothing else. */
  const applyDraft = async (d: BimAssistantDraft): Promise<string> => {
    const f = d.fields;
    if (f.project_id && f.project_id !== projectId) throw new Error('Đề xuất thuộc dự án khác.');
    const current = viewerRef.current?.getViewpoint() ?? null;
    if (d.type === 'saved_view') {
      const name = str(f.name);
      if (!name) throw new Error('Đề xuất thiếu tên góc nhìn.');
      if (!f.state) {
        if (!controller.saveView) throw new Error('Trình xem chưa sẵn sàng.');
        return (await controller.saveView(name, str(f.description) ?? undefined)).name;
      }
      const draftState = f.state as Partial<BimViewpoint>;
      const camera = draftState.camera ?? current?.camera;
      if (!camera) throw new Error('Trình xem chưa sẵn sàng để lấy camera hiện tại.');
      const saved = await BimService.saveView({
        project_id: projectId,
        model_id: str(f.model_id),
        name,
        description: str(f.description),
        state: { ...(current ?? {}), ...draftState, camera } as BimViewpoint,
        thumbnail_url: null,
        created_by: userName ?? null,
        tags: Array.isArray(f.tags) ? (f.tags as string[]) : [],
      });
      void queryClient.invalidateQueries({ queryKey: ['bim-saved-views', projectId] });
      return saved.name;
    }
    if (d.type === 'bcf_issue') {
      const title = str(f.title);
      if (!title) throw new Error('Đề xuất thiếu tiêu đề vướng mắc.');
      const issue: Omit<BimIssue, 'id' | 'created_at' | 'updated_at'> = {
        project_id: projectId,
        model_id: str(f.model_id),
        title,
        description: str(f.description),
        status: 'open',
        priority: (str(f.priority) ?? 'normal') as BimIssue['priority'],
        issue_type: (str(f.issue_type) ?? 'thiet_ke') as BimIssue['issue_type'],
        loai_ho_so: (str(f.loai_ho_so) ?? 'vuong_mac') as BimIssue['loai_ho_so'],
        don_vi_xu_ly: str(f.don_vi_xu_ly) as BimIssue['don_vi_xu_ly'],
        due_date: str(f.due_date),
        target_element_guid: str(f.target_element_guid),
        target_express_id: typeof f.target_express_id === 'number' ? f.target_express_id : null,
        viewpoint: current,
        created_by: userName ?? null,
        created_by_name: userName ?? null,
      };
      const created = await BimService.createIssue(issue);
      void queryClient.invalidateQueries({ queryKey: ['bim-issues', projectId] });
      return created.so_hieu ? `${created.so_hieu} · ${created.title}` : created.title;
    }
    if (d.type === 'viewer_action') {
      const name = String(f.name ?? '');
      const { results, actions } = await runBrowserToolCalls(
        [{ id: d.item_key, name, args: (f.args ?? {}) as Record<string, unknown> }],
        { runtime: { controller, uniclass }, projectId, resultSets: resultSets.current, resolveResultSet },
      );
      record(actions);
      const output = results[0]?.output as { error?: string } | undefined;
      if (output?.error) throw new Error(output.error);
      return describeToolCall(name, (f.args ?? {}) as Record<string, unknown>);
    }
    throw new Error('Loại đề xuất này chưa duyệt được từ trình xem.');
  };

  const decide = async (index: number, decision: 'accepted' | 'rejected') => {
    const proposal = proposals[index];
    if (!proposal || proposal.status !== 'pending') return;
    const set = (patch: Partial<Proposal>) =>
      setProposals((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    set({ status: 'saving', error: undefined });
    try {
      if (decision === 'accepted') {
        const name = await applyDraft(proposal.draft);
        addToast({
          type: 'success',
          message: proposal.draft.type === 'viewer_action' ? `Đã thực hiện: ${name}.` : `Đã tạo: ${name}.`,
        });
      }
      set({ status: decision });
      if (proposal.runId && !proposal.draft.local)
        await postAssistantDecision(proposal.runId, { itemKey: proposal.draft.item_key, decision }).catch(() =>
          addToast({
            type: 'warning',
            message: 'Đã xử lý đề xuất nhưng chưa ghi nhận được quyết định vào lịch sử trợ lý.',
          }),
        );
    } catch (e) {
      set({ status: 'pending', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const focusEvidence = async (item: EvidenceItem) => {
    const guid = typeof item.ref.guid === 'string' ? item.ref.guid : null;
    if (!guid) return;
    const ok = await controller.flyTo(guid).catch(() => false);
    if (!ok) addToast({ type: 'info', message: 'Cấu kiện không có trong các mô hình đang nạp.' });
  };

  const stop = () => {
    abortRef.current?.abort();
    runPlan?.resolve(false);
  };

  const replyClass =
    reply?.kind === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
      : reply?.kind === 'info'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
        : 'border-border bg-bg-subtle text-txt-primary dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
  const suggestions = chatMode ? CHAT_SUGGESTIONS : SUGGESTIONS;
  const pending = proposals.filter((p) => p.status === 'pending' || p.status === 'saving');

  return (
    <section aria-labelledby="bim-ai-title" className={`flex flex-col gap-3 overflow-y-auto p-3 text-xs ${className}`}>
      <div className="flex items-center gap-2">
        <Bot size={15} className="text-primary-700" aria-hidden />
        <h3 id="bim-ai-title" className="flex-1 font-semibold text-txt-primary">
          Trợ lý mô hình
        </h3>
        <button
          type="button"
          className="doc-button py-1"
          onClick={() => void undo()}
          disabled={busy || undoDepth === 0}
          data-tooltip="Hoàn tác thao tác gần nhất của trợ lý"
        >
          <Undo2 size={13} aria-hidden />
          Hoàn tác{undoDepth ? ` (${undoDepth})` : ''}
        </button>
        {onClose ? (
          <button type="button" className="doc-icon size-7" aria-label="Đóng trợ lý mô hình" onClick={onClose}>
            <X size={14} />
          </button>
        ) : null}
      </div>

      {chatEnabled ? (
        <div
          role="tablist"
          aria-label="Chế độ trợ lý"
          className="flex gap-1 rounded-xl border border-border p-0.5 dark:border-slate-600"
        >
          {(
            [
              ['hoi', 'Hỏi đáp', MessageSquare],
              ['lenh', 'Lệnh nhanh', Wand2],
            ] as const
          ).map(([value, label, Icon]) => {
            const active = (mode ?? 'hoi') === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(value)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 ${
                  active
                    ? 'bg-primary-50 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-100'
                    : 'text-txt-secondary dark:text-slate-300'
                }`}
              >
                <Icon size={12} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {chatMode && turns.length ? (
        <ol aria-label="Hội thoại với Trợ lý BuildSIA" aria-live="polite" className="space-y-2">
          {turns.map((turn) => (
            <li
              key={turn.id}
              className={
                turn.role === 'user'
                  ? 'ml-6 rounded-xl bg-primary-50 px-2.5 py-1.5 text-primary-900 dark:bg-primary-950 dark:text-primary-100'
                  : `mr-2 rounded-xl border px-2.5 py-2 ${
                      turn.status === 'error'
                        ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
                        : 'border-border bg-bg-subtle text-txt-primary dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
                    }`
              }
            >
              <span className="whitespace-pre-line">
                {turn.text || (turn.status === 'streaming' ? (progress ?? 'Đang trả lời…') : '')}
              </span>
              {turn.role === 'model' && turn.quick ? (
                <span className="mt-1 block text-2xs text-txt-muted">Chạy trực tiếp trên mô hình, không gọi AI.</span>
              ) : null}
              {turn.role === 'model' && turn.status === 'done' && !turn.quick && turn.verified === false ? (
                <span className="mt-1 block text-2xs font-semibold text-amber-700 dark:text-amber-300">
                  {turn.label || 'Có dẫn chứng chưa kiểm chứng'}
                </span>
              ) : null}
              {turn.evidence?.length ? (
                <EvidenceChips items={turn.evidence} onFocus={(e) => void focusEvidence(e)} />
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {busy && chatMode && progress ? (
        <p className="flex items-center gap-1.5 text-2xs text-txt-muted">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          {progress}
        </p>
      ) : null}

      {runPlan ? (
        <BimAiPlanPreview
          plan={runPlan.plan}
          onApprove={() => runPlan.resolve(true)}
          onReject={() => runPlan.resolve(false)}
        />
      ) : null}

      <form onSubmit={onSubmit} className="flex items-center gap-1.5">
        <label htmlFor="bim-ai-input" className="sr-only">
          {chatMode ? 'Câu hỏi cho Trợ lý BuildSIA' : 'Lệnh cho mô hình'}
        </label>
        <BimInput
          id="bim-ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={chatMode ? 'VD: cửa chống cháy tầng 3 nào chưa nghiệm thu?' : 'VD: cô lập dầm tầng 3'}
          maxLength={chatMode ? 2000 : 300}
          autoComplete="off"
          disabled={busy}
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
        {running ? (
          <button type="button" className="doc-button py-1.5" onClick={stop} data-tooltip="Dừng câu hỏi">
            <Square size={13} aria-hidden />
            Dừng
          </button>
        ) : (
          <button type="submit" className="doc-button doc-primary py-1.5" disabled={busy || !input.trim()}>
            {busy ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <CornerDownLeft size={13} aria-hidden />
            )}
            {chatMode ? 'Hỏi' : 'Chạy'}
          </button>
        )}
      </form>

      <div className="flex flex-wrap gap-1" aria-label={chatMode ? 'Gợi ý câu hỏi' : 'Gợi ý lệnh'}>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={busy}
            onClick={() => void submit(suggestion)}
            className="rounded-full border border-border px-2.5 py-1 text-txt-secondary hover:border-primary-300 hover:text-primary-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {plan ? (
        <BimAiPlanPreview
          plan={plan}
          onApprove={() => {
            const steps = plan.steps.map((step) => ({ name: step.tool, args: step.args }));
            setPlan(null);
            void execute(steps);
          }}
          onReject={() => {
            setPlan(null);
            setReply({ kind: 'info', text: 'Đã hủy, khung nhìn giữ nguyên.' });
          }}
        />
      ) : null}

      {reply && !chatMode ? (
        <div role="status" className={`whitespace-pre-line rounded-xl border px-2.5 py-2 ${replyClass}`}>
          {reply.text}
          {reply.kind === 'info' && chatEnabled && lastQuestion ? (
            <button
              type="button"
              className="doc-button mt-2 py-1"
              disabled={busy}
              onClick={() => {
                setMode('hoi');
                setReply(null);
                setInput('');
                void askAssistant(lastQuestion);
              }}
            >
              <Bot size={13} aria-hidden />
              Hỏi Trợ lý BuildSIA
            </button>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-800 dark:bg-amber-950">
          <span className="min-w-0 flex-1 text-amber-900 dark:text-amber-100">Lưu góc nhìn “{draft.name}”?</span>
          {canEdit ? (
            <button
              type="button"
              className="doc-button doc-primary py-1"
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              <Save size={13} aria-hidden />
              Lưu
            </button>
          ) : (
            <span className="text-txt-muted">Bạn chỉ có quyền xem.</span>
          )}
          <button type="button" className="doc-button py-1" onClick={() => setDraft(null)}>
            Bỏ
          </button>
        </div>
      ) : null}

      {pending.length ? (
        <section
          aria-label="Đề xuất chờ duyệt"
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950"
        >
          <b className="text-amber-900 dark:text-amber-100">Đề xuất chờ duyệt ({pending.length})</b>
          {proposals.map((p, index) =>
            p.status === 'pending' || p.status === 'saving' ? (
              <div key={`${p.runId}-${p.draft.item_key}`} className="space-y-1">
                <p className="font-semibold text-txt-primary dark:text-slate-100">{draftTitle(p.draft)}</p>
                {p.draft.type === 'bcf_issue' && str(p.draft.fields.description) ? (
                  <p className="line-clamp-3 text-txt-secondary dark:text-slate-300">
                    {String(p.draft.fields.description)}
                  </p>
                ) : null}
                {p.draft.notice ? <p className="text-2xs text-txt-muted">{p.draft.notice}</p> : null}
                {p.error ? <p className="text-rose-700 dark:text-rose-300">{p.error}</p> : null}
                <div className="flex gap-2">
                  {canEdit || p.draft.type === 'viewer_action' ? (
                    <button
                      type="button"
                      className="doc-button doc-primary py-1"
                      disabled={p.status === 'saving'}
                      onClick={() => void decide(index, 'accepted')}
                    >
                      {p.status === 'saving' ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden />
                      ) : (
                        <Check size={13} aria-hidden />
                      )}
                      {p.draft.type === 'viewer_action' ? 'Thực hiện' : 'Duyệt'}
                    </button>
                  ) : (
                    <span className="text-txt-muted">Bạn chỉ có quyền xem.</span>
                  )}
                  <button
                    type="button"
                    className="doc-button py-1"
                    disabled={p.status === 'saving'}
                    onClick={() => void decide(index, 'rejected')}
                  >
                    Bỏ
                  </button>
                </div>
              </div>
            ) : null,
          )}
        </section>
      ) : null}

      <BimAiActionList actions={log} />

      {!chatEnabled ? (
        <p className="flex items-start gap-1.5 text-2xs text-txt-muted">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          Lệnh chạy trực tiếp trên mô hình, không gọi AI. Hỏi đáp tự do có khi đơn vị bật Trợ lý BuildSIA cho nhóm BIM.
        </p>
      ) : chatMode ? (
        <p className="flex items-start gap-1.5 text-2xs text-txt-muted">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          Số liệu lấy từ cơ sở dữ liệu mô hình; trợ lý chỉ đề xuất — vướng mắc, góc nhìn chỉ được tạo khi bạn duyệt.
        </p>
      ) : null}
    </section>
  );
}

/** Evidence of an answer: BIM elements fly the camera to the element; other kinds open their page. */
function EvidenceChips({ items, onFocus }: { items: EvidenceItem[]; onFocus: (item: EvidenceItem) => void }) {
  return (
    <ul aria-label="Dẫn chứng" className="mt-2 flex flex-wrap gap-1">
      {items.slice(0, 20).map((item, i) => {
        const unverified = item.verified === false;
        const cls = `inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs ${
          unverified
            ? 'border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200'
            : 'border-border text-txt-secondary dark:border-slate-600 dark:text-slate-300'
        }`;
        const title = unverified ? `Chưa kiểm chứng${item.reason ? `: ${item.reason}` : ''}` : item.label;
        return (
          <li key={`${item.kind}-${i}`} className="max-w-full">
            {item.kind === 'bim_element' && typeof item.ref.guid === 'string' ? (
              <button type="button" className={cls} data-tooltip={title} onClick={() => onFocus(item)}>
                <Crosshair size={11} aria-hidden />
                <span className="truncate">{item.label}</span>
              </button>
            ) : item.href ? (
              <a className={cls} data-tooltip={title} href={item.href} target="_blank" rel="noreferrer">
                <ExternalLink size={11} aria-hidden />
                <span className="truncate">{item.label}</span>
              </a>
            ) : (
              <span className={cls} data-tooltip={title}>
                <span className="truncate">{item.label}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
