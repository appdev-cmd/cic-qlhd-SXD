// Phân loại lỗi job chuyển đổi theo LOẠI lỗi (mã/lớp), không dò chữ tiếng Việt trong thông điệp.
//   permanent: tệp hỏng/không phải IFC, bom zip, virus, thiếu tệp gốc → không thử lại, vào hàng đợi lỗi ngay.
//   transient: mạng, hết giờ, tiến trình con bị giết (thiếu bộ nhớ), máy chủ 5xx → thử lại có giãn cách tới N lần.

export type ErrorKind = 'permanent' | 'transient';
export type ErrorCode =
  | 'IFC_PARSE'
  | 'IFC_EMPTY'
  | 'ZIP_NO_IFC'
  | 'ZIP_LIMIT'
  | 'FILE_TOO_LARGE'
  | 'VIRUS'
  | 'SOURCE_MISSING'
  | 'TIMEOUT'
  | 'CHILD_CRASH'
  | 'NETWORK'
  | 'STORAGE'
  | 'DATABASE'
  | 'SCANNER_UNAVAILABLE'
  | 'UNKNOWN';

const PERMANENT: ReadonlySet<ErrorCode> = new Set([
  'IFC_PARSE',
  'IFC_EMPTY',
  'ZIP_NO_IFC',
  'ZIP_LIMIT',
  'FILE_TOO_LARGE',
  'VIRUS',
  'SOURCE_MISSING',
]);

export class JobError extends Error {
  readonly code: ErrorCode;
  readonly kind: ErrorKind;
  constructor(code: ErrorCode, message: string, options: { kind?: ErrorKind; cause?: unknown } = {}) {
    super(message);
    this.name = 'JobError';
    this.code = code;
    this.kind = options.kind ?? (PERMANENT.has(code) ? 'permanent' : 'transient');
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
  toJSON() {
    return { code: this.code, kind: this.kind, message: this.message };
  }
}

// Mã lỗi hệ thống / undici coi là mạng tạm thời.
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CLOSED',
]);

const codeOf = (err: unknown): string | undefined => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === 'string' ? code : undefined;
};

/** HTTP status → loại lỗi: 404/400/413/415 là vĩnh viễn; 408/429/5xx là tạm thời. */
export const fromHttpStatus = (status: number, message: string, code: ErrorCode = 'STORAGE'): JobError => {
  if (status === 404) return new JobError('SOURCE_MISSING', message);
  if (status === 413) return new JobError('FILE_TOO_LARGE', message);
  if (status === 408 || status === 429 || status >= 500) return new JobError(code, message, { kind: 'transient' });
  return new JobError(code, message, { kind: 'permanent' });
};

/** Chuẩn hóa mọi lỗi (kể cả lỗi chuyển từ tiến trình con dạng JSON) thành JobError. */
export function classifyError(err: unknown): JobError {
  if (err instanceof JobError) return err;
  const plain = err as { code?: unknown; kind?: unknown; message?: unknown } | null;
  if (
    plain &&
    typeof plain === 'object' &&
    typeof plain.code === 'string' &&
    (plain.kind === 'permanent' || plain.kind === 'transient')
  ) {
    return new JobError(plain.code as ErrorCode, String(plain.message ?? plain.code), { kind: plain.kind });
  }
  const message = err instanceof Error ? err.message : String(err);
  const code = codeOf(err);
  if (code && NETWORK_CODES.has(code)) return new JobError('NETWORK', message, { cause: err });
  if (err instanceof TypeError && /fetch failed/i.test(message))
    return new JobError('NETWORK', message, { cause: err });
  if ((err as { name?: string })?.name === 'AbortError' || code === 'ABORT_ERR')
    return new JobError('TIMEOUT', message, { cause: err });
  return new JobError('UNKNOWN', message, { kind: 'transient', cause: err });
}

/** Giãn cách thử lại: 1, 5, 15, 30 phút… (tối đa 60 phút). */
export const retryDelayMs = (attempt: number) => Math.min(60, [1, 5, 15, 30][attempt - 1] ?? 60) * 60_000;

export interface FailureDecision {
  status: 'uploaded' | 'error';
  loai_loi: 'tam_thoi' | 'vinh_vien' | 'het_lan_thu';
  error_message: string;
  thu_lai_sau: string | null;
  ngung_thu_luc: string | null;
}

/** Quyết định sau lỗi: thử lại sau (tạm thời, còn lượt) hoặc đưa vào hàng đợi lỗi kèm lý do. */
export function decideFailure(
  error: JobError,
  attempts: number,
  maxAttempts: number,
  now = new Date(),
): FailureDecision {
  const at = now.toISOString();
  if (error.kind === 'permanent') {
    return {
      status: 'error',
      loai_loi: 'vinh_vien',
      error_message: `[${error.code}] ${error.message}`,
      thu_lai_sau: null,
      ngung_thu_luc: at,
    };
  }
  if (attempts >= maxAttempts) {
    return {
      status: 'error',
      loai_loi: 'het_lan_thu',
      error_message: `Ngừng sau ${attempts} lần thử: [${error.code}] ${error.message}`,
      thu_lai_sau: null,
      ngung_thu_luc: at,
    };
  }
  return {
    status: 'uploaded',
    loai_loi: 'tam_thoi',
    error_message: `[${error.code}] ${error.message}`,
    thu_lai_sau: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(),
    ngung_thu_luc: null,
  };
}
