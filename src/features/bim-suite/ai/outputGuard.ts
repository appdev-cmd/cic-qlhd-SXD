// Guards tool results before they go back to a model (port of cic-hud services/ai/toolOutputGuard). Tool results
// carry externally controlled text (IFC properties, issue descriptions...): cap each string and the total size, strip
// control characters, never mutate the input.

export interface ToolOutputGuardOptions {
  /** Độ dài tối đa của mỗi chuỗi (mặc định 2000 ký tự). */
  maxString?: number;
  /** Tổng kích thước JSON tối đa (mặc định 60000 ký tự). */
  maxTotal?: number;
}

export const TRUNCATION_MARKER = '…[cắt]';
export const TOTAL_CAP_MARKER = { __bi_cat: true } as const;

const DEFAULT_MAX_STRING = 2000;
const DEFAULT_MAX_TOTAL = 60000;
// C0 control characters except \n (0x0A) and \t (0x09); also DEL (0x7F).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function guardString(value: string, maxString: number): string {
  const cleaned = value.replace(CONTROL_CHARS, '');
  if (cleaned.length <= maxString) return cleaned;
  return cleaned.slice(0, maxString) + TRUNCATION_MARKER;
}

function cloneGuarded(value: unknown, maxString: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return guardString(value, maxString);
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return '[vòng lặp tham chiếu]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => cloneGuarded(item, maxString, seen));
    if (value instanceof Map) {
      return cloneGuarded(Object.fromEntries(value), maxString, seen);
    }
    if (value instanceof Set) return cloneGuarded([...value], maxString, seen);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const guarded = cloneGuarded(item, maxString, seen);
      if (guarded !== undefined) out[guardString(key, maxString)] = guarded;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

function serializedSize(value: unknown): number {
  try {
    const text = JSON.stringify(value);
    return text ? text.length : 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Tìm mảng dài nhất (theo số phần tử) trong cây để cắt bớt phần đuôi. */
function findLargestArray(value: unknown): unknown[] | null {
  let best: unknown[] | null = null;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      // Bỏ qua các mảng đã có marker ở cuối mà chỉ còn một phần tử thật
      const realLength = node.length && isCapMarker(node[node.length - 1]) ? node.length - 1 : node.length;
      if (realLength > 1 && (!best || realLength > best.length)) best = node;
      for (const item of node) visit(item);
    } else if (node && typeof node === 'object') {
      for (const item of Object.values(node as Record<string, unknown>)) visit(item);
    }
  };
  visit(value);
  return best;
}

function isCapMarker(value: unknown): boolean {
  return !!value && typeof value === 'object' && (value as Record<string, unknown>).__bi_cat === true;
}

function capTotal(value: unknown, maxTotal: number): unknown {
  let size = serializedSize(value);
  let guard = 0;
  while (size > maxTotal && guard < 10_000) {
    guard++;
    const arr = findLargestArray(value);
    if (!arr) break;
    const hasMarker = arr.length && isCapMarker(arr[arr.length - 1]);
    const realLength = hasMarker ? arr.length - 1 : arr.length;
    if (realLength <= 1) break;
    // Cắt một nửa phần đuôi mỗi vòng để hội tụ nhanh, luôn giữ ít nhất 1 phần tử.
    const keep = Math.max(1, Math.floor(realLength / 2));
    arr.splice(keep, arr.length - keep, { ...TOTAL_CAP_MARKER });
    size = serializedSize(value);
  }
  if (size > maxTotal) {
    // Không còn mảng để cắt: trả về gọn nhất có thể.
    if (typeof value === 'string') return value.slice(0, maxTotal) + TRUNCATION_MARKER;
    return { ...TOTAL_CAP_MARKER, ghi_chu: 'Kết quả công cụ quá lớn, đã bị cắt.' };
  }
  return value;
}

/**
 * Sao chép đệ quy kết quả công cụ, cắt chuỗi dài, loại ký tự điều khiển và giới hạn tổng kích thước.
 * Không sửa đối tượng đầu vào.
 */
export function guardToolOutput(value: unknown, opts?: ToolOutputGuardOptions): unknown {
  const maxString = Math.max(1, opts?.maxString ?? DEFAULT_MAX_STRING);
  const maxTotal = Math.max(1, opts?.maxTotal ?? DEFAULT_MAX_TOTAL);
  const cloned = cloneGuarded(value, maxString, new WeakSet());
  return capTotal(cloned, maxTotal);
}
