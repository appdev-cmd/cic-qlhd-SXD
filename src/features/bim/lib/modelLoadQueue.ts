/** Reconcile the latest selection without overlapping load/dispose calls for the same model. */
export interface LoadableModel {
  id: string;
  frag_path?: string | null;
  status: string;
  updated_at?: string | null;
}

export const modelRevision = (model: LoadableModel) => JSON.stringify([model.id, model.frag_path, model.updated_at]);
export const modelSelectionKey = (models: LoadableModel[]) =>
  JSON.stringify(
    models
      .filter((m) => m.frag_path && m.status === 'ready')
      .map(modelRevision)
      .sort(),
  );

export interface ModelLoadTimeoutOptions {
  /** Lỗi khi không có tiến triển (byte mới, bước mới) trong khoảng này */
  idleMs: number;
  /** Trần tuyệt đối cho một mô hình */
  maxMs: number;
}

export const DEFAULT_LOAD_TIMEOUT: ModelLoadTimeoutOptions = { idleMs: 45_000, maxMs: 15 * 60_000 };

export class ModelLoadTimeoutError extends Error {
  constructor(
    message: string,
    readonly kind: 'idle' | 'max',
  ) {
    super(message);
    this.name = 'ModelLoadTimeoutError';
  }
}

const durationText = (ms: number) =>
  ms >= 60_000 ? `${Math.round(ms / 60_000)} phút` : `${Math.round(ms / 1000)} giây`;

/**
 * A failed worker or network request must produce a recoverable error, not an endless spinner.
 * Mạng chậm nhưng vẫn nhận dữ liệu thì không bị ngắt: gọi `touch()` mỗi khi có byte mới hoặc sang bước mới
 * (có thể nới khoảng chờ cho bước dựng hình học, vốn không báo tiến độ). Trần tuyệt đối vẫn giữ.
 * Truyền một số = khoảng chờ không tiến triển và trần bằng nhau (tương thích cách gọi cũ).
 */
export async function withModelLoadTimeout<T>(
  task: (signal: AbortSignal, touch: (nextIdleMs?: number) => void) => Promise<T>,
  abortWorker: () => void,
  options: number | Partial<ModelLoadTimeoutOptions> = {},
): Promise<T> {
  const { idleMs, maxMs } =
    typeof options === 'number' ? { idleMs: options, maxMs: options } : { ...DEFAULT_LOAD_TIMEOUT, ...options };
  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let reject: (error: Error) => void = () => undefined;
  const failed = new Promise<never>((_, no) => {
    reject = no;
  });
  const fail = (error: Error) => {
    if (controller.signal.aborted) return;
    controller.abort(error);
    reject(error);
    try {
      abortWorker();
    } catch {
      /* The worker may already be closed. */
    }
  };
  let currentIdle = idleMs;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () =>
        fail(
          new ModelLoadTimeoutError(
            `Không nhận thêm dữ liệu mô hình trong ${durationText(currentIdle)}. Bấm "Thử lại" để nạp lại mô hình này.`,
            'idle',
          ),
        ),
      currentIdle,
    );
  };
  const touch = (nextIdleMs?: number) => {
    if (controller.signal.aborted) return;
    if (nextIdleMs !== undefined) currentIdle = nextIdleMs;
    armIdle();
  };
  try {
    armIdle();
    maxTimer = setTimeout(
      () =>
        fail(
          new ModelLoadTimeoutError(
            `Quá thời gian tải mô hình (${durationText(maxMs)}). Bấm "Thử lại" để nạp lại.`,
            'max',
          ),
        ),
      maxMs,
    );
    return await Promise.race([task(controller.signal, touch), failed]);
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
  }
}

interface QueueOptions<M, R> {
  load: (model: M) => Promise<R>;
  attach: (model: M, result: R) => void;
  remove: (model: M, result: R) => Promise<void>;
  changed: (loaded: M[], pending: M[]) => void;
  error: (model: M, error: unknown) => void;
  /** Sắp thứ tự các mô hình còn chờ (VD mô hình nằm trong khung nhìn trước); mặc định giữ thứ tự danh sách */
  prioritize?: (waiting: M[]) => M[];
}

export class ModelLoadQueue<M extends LoadableModel, R> {
  private wanted = new Map<string, M>();
  private loaded = new Map<string, { model: M; result: R }>();
  private failed = new Set<string>();
  private running = false;
  private stopped = false;
  private idle: Promise<void> = Promise.resolve();

  constructor(private options: QueueOptions<M, R>) {}

  setModels(models: M[]) {
    if (this.stopped) return;
    this.wanted = new Map(models.filter((m) => m.frag_path && m.status === 'ready').map((m) => [m.id, m]));
    this.publish();
    if (!this.running) {
      this.running = true;
      this.idle = this.reconcile().finally(() => {
        this.running = false;
        // A selection can change from a completion callback before this finally runs.
        const needsWork =
          [...this.loaded.values()].some(({ model }) => !this.isWanted(model)) ||
          [...this.wanted.values()].some((m) => !this.loaded.has(m.id) && !this.failed.has(modelRevision(m)));
        if (!this.stopped && needsWork) this.setModels([...this.wanted.values()]);
      });
    }
  }

  isWanted(model: M) {
    const current = this.wanted.get(model.id);
    return !this.stopped && !!current && modelRevision(current) === modelRevision(model);
  }

  /** Mô hình đang muốn hiển thị nhưng nạp lỗi */
  failedModels(): M[] {
    return [...this.wanted.values()].filter((m) => this.failed.has(modelRevision(m)));
  }

  /** Thử nạp lại một mô hình đã lỗi mà không phải tải lại cả trang */
  retry(modelId: string) {
    if (this.stopped) return false;
    const model = this.wanted.get(modelId);
    if (!model || !this.failed.delete(modelRevision(model))) return false;
    this.setModels([...this.wanted.values()]);
    return true;
  }

  async whenIdle() {
    while (this.running) await this.idle;
  }

  /** The owner disposes the worker and scene. Late completions must never attach to a new viewer. */
  stop() {
    this.stopped = true;
    this.wanted.clear();
  }

  private publish() {
    if (this.stopped) return;
    const loaded = [...this.loaded.values()].filter(({ model }) => this.isWanted(model)).map(({ model }) => model);
    const pending = [...this.wanted.values()].filter(
      (model) =>
        !loaded.some((m) => modelRevision(m) === modelRevision(model)) && !this.failed.has(modelRevision(model)),
    );
    this.options.changed(loaded, pending);
  }

  private nextModel(): M | undefined {
    const waiting = [...this.wanted.values()].filter(
      (m) => !this.loaded.has(m.id) && !this.failed.has(modelRevision(m)),
    );
    if (waiting.length < 2 || !this.options.prioritize) return waiting[0];
    try {
      return this.options.prioritize(waiting).find((m) => waiting.includes(m)) ?? waiting[0];
    } catch {
      return waiting[0];
    }
  }

  private async reconcile() {
    while (!this.stopped) {
      // Always finish disposal before allowing the same worker ID to be loaded again.
      for (const [id, entry] of this.loaded) {
        if (this.isWanted(entry.model)) continue;
        this.loaded.delete(id);
        try {
          await this.options.remove(entry.model, entry.result);
        } catch (error) {
          if (!this.stopped) this.options.error(entry.model, error);
        }
        this.publish();
        if (this.stopped) return;
      }
      const model = this.nextModel();
      if (!model) {
        this.publish();
        return;
      }
      try {
        const result = await this.options.load(model);
        if (this.stopped) return;
        if (this.isWanted(model)) {
          this.options.attach(model, result);
          this.loaded.set(model.id, { model, result });
        } else {
          await this.options.remove(model, result);
        }
      } catch (error) {
        if (this.stopped) return;
        this.failed.add(modelRevision(model));
        if (this.isWanted(model)) this.options.error(model, error);
      }
      this.publish();
    }
  }
}
