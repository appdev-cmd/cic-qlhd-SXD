import { formatNumber, formatDateTime } from '@/lib/utils';
// Strict Uniclass commands without a model (port of cic-hud services/ai/bimQuickUniclass): count / isolate / colour
// by a Pr or Ss code, or by a code title read from the IFC file, optionally on one floor ("tầng N", "hầm N") and with a
// colour. Unknown qualifiers make the plan null (never discarded); cic-hud's generic aliases ("cột" → the one Pr code of
// all columns) need its per-element dictionary and are left to the assistant.
import { normalizeVi } from '../lib/vietnameseBimMap';
import type { BimToolCall } from './plan';
import { COLOR_WORDS, takeStorey } from './quickCommands';
import { runBimToolCalls, type BimAiAction, type BimToolRuntime } from './runner';
import type { UniclassCodeRow } from './uniclass';

export interface QuickUniclassPlan {
  pr?: string;
  ss?: string;
  /** Code title from the IFC file, when the command named it. */
  label?: string;
  count: boolean;
  isolate: boolean;
  color?: string;
  storey?: string;
}

const pad = (text: string) => ` ${text} `;

export function quickUniclassPlan(question: string, codes: UniclassCodeRow[]): QuickUniclassPlan | null {
  let rest = normalizeVi(question)
    .replace(/[?.,!;:"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const storey = takeStorey(rest);
  if (storey === 'many') return null;
  if (storey) rest = storey.rest;
  const count = /bao nhieu|(^|\s)dem\s|so luong/.test(pad(rest));
  const isolate = /chi hien|co lap/.test(rest);
  const highlight = /to mau/.test(rest);
  if (!count && !isolate && !highlight) return null;
  const prCodes = [...rest.matchAll(/\bpr(?:_\d{2}){1,5}\b/g)];
  const ssCodes = [...rest.matchAll(/\bss(?:_\d{2}){1,5}\b/g)];
  if (prCodes.length > 1 || ssCodes.length > 1) return null;
  let pr = prCodes[0]?.[0].replace(/^pr/, 'Pr');
  const ss = ssCodes[0]?.[0].replace(/^ss/, 'Ss');
  for (const code of [...prCodes, ...ssCodes]) rest = rest.replace(code[0], ' ');
  // A code title of the loaded models (longest first), e.g. "Concrete columns" or a Vietnamese title in the IFC.
  const named = codes
    .filter((row) => row.bang === 'pr' && row.ten && normalizeVi(row.ten).length > 2)
    .sort((a, b) => (b.ten ?? '').length - (a.ten ?? '').length)
    .find((row) => pad(rest).includes(pad(normalizeVi(row.ten!))));
  let label: string | undefined;
  if (named) {
    if (pr && named.ma.toLowerCase() !== pr.toLowerCase()) return null;
    pr ??= named.ma;
    label = named.ten ?? undefined;
    rest = rest.replace(normalizeVi(named.ten!), ' ');
  } else if (pr) {
    label = codes.find((row) => row.ma.toLowerCase() === pr!.toLowerCase())?.ten ?? undefined;
  }
  if (!pr && !ss) return null;
  let color: string | undefined;
  if (highlight) {
    const hex = rest.match(/#[0-9a-f]{6}\b/i)?.[0];
    const namedColor = COLOR_WORDS.find(([word]) => pad(rest).includes(pad(word)));
    color = hex ?? namedColor?.[1];
    if (!color) return null;
    rest = rest.replace(hex ?? namedColor![0], ' ');
  }
  rest = rest
    .replace(
      /\b(co bao nhieu|bao nhieu|so luong|dem|chi hien|co lap|to mau|mau|trong toa nha|trong mo hinh|tren mo hinh|cua du an|toa nha|cong trinh|neu nguon du lieu|neu nguon|du lieu|nguon|theo uniclass|uniclass|theo|ma|tat ca|toan bo|cac|nhung|cau kien|co|va|and|giup toi|nhe|di)\b/g,
      ' ',
    )
    .trim();
  if (rest) return null;
  return { pr, ss, label, count, isolate, color, storey: storey ? storey.storey : undefined };
}

/** The tool calls of a plan: read (count) first, then the viewer actions. */
export function quickUniclassCalls(plan: QuickUniclassPlan): BimToolCall[] {
  const base = { pr: plan.pr, ss: plan.ss, ...(plan.storey ? { tang: plan.storey } : {}) };
  const calls: BimToolCall[] = [{ name: 'get_bim_uniclass', args: base }];
  if (plan.isolate) calls.push({ name: 'viewer_filter_uniclass', args: { ...base, action: 'isolate' } });
  if (plan.color)
    calls.push({ name: 'viewer_filter_uniclass', args: { ...base, action: 'highlight', color: plan.color } });
  return calls;
}

export interface QuickUniclassAnswer {
  text: string;
  toolsUsed: string[];
  actions: BimAiAction[];
}

export async function runQuickUniclass(
  question: string,
  codes: UniclassCodeRow[],
  runtime: BimToolRuntime,
  signal?: AbortSignal,
): Promise<QuickUniclassAnswer | null> {
  const plan = quickUniclassPlan(question, codes);
  if (!plan || !runtime.uniclass || ((plan.isolate || plan.color) && !runtime.controller)) return null;
  const actions = await runBimToolCalls(quickUniclassCalls(plan), runtime, { signal });
  const read = actions[0]?.result;
  if (!read || read.error || typeof read.so_cau_kien !== 'number') return null;
  const what = plan.label ?? [plan.pr, plan.ss].filter(Boolean).join(' + ');
  const floor = plan.storey ? ` · tầng ${plan.storey}` : '';
  const lines = [`**${formatNumber(read.so_cau_kien, 2)} ${what}** · ${runtime.uniclass.label}${floor}.`];
  for (const action of actions.slice(1)) {
    if (action.status === 'loi') {
      lines.push(`Không hoàn tất: ${action.error}`);
      break;
    }
    const isolate = action.result.action === 'isolate';
    lines.push(
      `${isolate ? 'Đã cô lập' : `Đã tô màu ${String(action.result.action === 'highlight' ? plan.color : '')}`}: ${action.found ?? 0} cấu kiện trên BIM.`,
    );
  }
  lines.push('Nguồn: IfcClassificationReference trong tệp IFC (Uniclass 2015).');
  lines.push('_Tra cứu nhanh từ dữ liệu mô hình; lệnh này không gọi mô hình AI._');
  return { text: lines.join('\n\n'), toolsUsed: actions.map((action) => action.tool), actions };
}
