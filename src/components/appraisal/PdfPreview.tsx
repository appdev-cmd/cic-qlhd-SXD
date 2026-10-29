import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MoveHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { Skeleton, SkeletonText } from '../ui/Skeleton';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Tooltip } from '../ui/Tooltip';

GlobalWorkerOptions.workerSrc = workerUrl;

// A4 at CSS 96 dpi: 210 x 297 mm.
const PAGE_W_PX = (210 * 96) / 25.4;
const PAGE_H_PX = (297 * 96) / 25.4;
// Locked A4 frame (CLAUDE.md "A4 Paper Standard"). Zoom scales this frame as a whole via transform.
const A4_FRAME: CSSProperties = {
  width: '210mm',
  height: '297mm',
  maxHeight: '297mm',
  overflow: 'hidden',
  boxSizing: 'border-box',
};
// Official document margins (top, right, bottom, left) used for the loading placeholder.
const A4_MARGINS = '22mm 20mm 20mm 30mm';
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
// Viewport padding (p-3) and gap between pages (gap-3), in px; used to keep the scroll anchor on zoom.
const PAD = 12;
const GAP = 12;
// Upper bound on canvas width so one page never allocates more than ~2900 x 4100 px.
const MAX_CANVAS_W = 2900;
const THUMB_W = 88;
const RAIL_KEY = 'pdf-preview-rail';
const VISIBILITY_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const nextZoom = (scale: number) => ZOOM_STEPS.find((z) => z > scale + 0.001) ?? MAX_ZOOM;
const prevZoom = (scale: number) => [...ZOOM_STEPS].reverse().find((z) => z < scale - 0.001) ?? MIN_ZOOM;
const devicePixelRatio = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
const readRail = () => {
  try {
    return localStorage.getItem(RAIL_KEY) !== '0';
  } catch {
    return true;
  }
};

/**
 * Renders one PDF page into `host` while `active`, fitted ("contain") into an A4-shaped box `targetWidth` px wide.
 * The canvas is rendered off-DOM and swapped in when done (no flash on zoom); it is released when inactive.
 */
function usePageCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  active: boolean,
  targetWidth: number,
  onSize?: (width: number, height: number) => void,
) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const sizeCallback = useRef(onSize);
  useLayoutEffect(() => {
    sizeCallback.current = onSize;
  });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    if (!active) {
      element.replaceChildren();
      setStatus('idle');
      return;
    }
    let live = true,
      task: RenderTask | undefined;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (!live) return;
      const base = page.getViewport({ scale: 1 });
      sizeCallback.current?.(base.width, base.height);
      const targetHeight = (targetWidth * 297) / 210;
      const viewport = page.getViewport({ scale: Math.min(targetWidth / base.width, targetHeight / base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.className = 'block h-full w-full object-contain';
      canvas.setAttribute('aria-hidden', 'true');
      task = page.render({ canvas, viewport });
      await task.promise;
      if (!live) return;
      element.replaceChildren(canvas);
      setStatus('done');
    })().catch(() => {
      // Cancellation rejects too; only a live render failure is an error.
      if (live) setStatus('error');
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [pdf, pageNumber, active, targetWidth]);
  return { host, status };
}

function PageView({
  pdf,
  pageNumber,
  scale,
  active,
  renderWidth,
  register,
  onSize,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  active: boolean;
  renderWidth: number;
  register: (pageNumber: number, element: HTMLDivElement | null) => void;
  onSize: (width: number, height: number) => void;
}) {
  const { host, status } = usePageCanvas(pdf, pageNumber, active, renderWidth, onSize);
  return (
    <div
      ref={(element) => register(pageNumber, element)}
      data-page={pageNumber}
      className="relative shrink-0"
      style={{ width: PAGE_W_PX * scale, height: PAGE_H_PX * scale }}
    >
      <div
        role="img"
        aria-label={'Nội dung PDF trang ' + pageNumber}
        className="absolute left-0 top-0 bg-white dark:bg-white shadow-card"
        style={{ ...A4_FRAME, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        <div ref={host} className="h-full w-full" />
        {status === 'idle' && (
          <div className="absolute inset-0" style={{ padding: A4_MARGINS }}>
            <SkeletonText lines={14} spacing="lg" lastLineWidth="55%" />
          </div>
        )}
        {status === 'error' && (
          <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-base text-slate-600 dark:text-slate-600">
            Không vẽ được trang {pageNumber}. Hãy tải bản gốc để xem.
          </p>
        )}
      </div>
    </div>
  );
}

function Thumbnail({
  pdf,
  pageNumber,
  active,
  current,
  register,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  current: boolean;
  register: (pageNumber: number, element: HTMLButtonElement | null) => void;
  onSelect: (pageNumber: number) => void;
}) {
  const { host, status } = usePageCanvas(pdf, pageNumber, active, Math.ceil(THUMB_W * devicePixelRatio()));
  return (
    <button
      type="button"
      ref={(element) => register(pageNumber, element)}
      data-page={pageNumber}
      aria-label={'Đi tới trang ' + pageNumber}
      aria-current={current ? 'page' : undefined}
      onClick={() => onSelect(pageNumber)}
      className={
        'group flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 ' +
        (current
          ? 'bg-primary-100 dark:bg-slate-700'
          : 'bg-transparent hover:bg-slate-300 dark:bg-transparent dark:hover:bg-slate-700')
      }
    >
      <div
        className={
          'relative overflow-hidden bg-white dark:bg-white shadow-sm ring-2 ' +
          (current ? 'ring-primary-500 dark:ring-primary-400' : 'ring-transparent dark:ring-transparent')
        }
        style={{ width: THUMB_W, height: (THUMB_W * 297) / 210 }}
      >
        <div ref={host} className="h-full w-full" />
        {status !== 'done' && <Skeleton variant="rectangular" animation="pulse" className="absolute inset-0" />}
      </div>
      <span
        className={
          'font-mono text-2xs tabular-nums ' +
          (current ? 'font-bold text-primary-700 dark:text-primary-300' : 'text-ink-muted dark:text-slate-400')
        }
      >
        {pageNumber}
      </span>
    </button>
  );
}

function ThumbnailRail({
  pdf,
  current,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  current: number;
  onSelect: (pageNumber: number) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<number, HTMLButtonElement>());
  // Thumbnails render once they scroll near the rail viewport and are kept (they are small).
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set());
  const register = useCallback((pageNumber: number, element: HTMLButtonElement | null) => {
    if (element) items.current.set(pageNumber, element);
    else items.current.delete(pageNumber);
  }, []);
  useEffect(() => {
    const root = rail.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.page));
        if (!shown.length) return;
        setSeen((previous) => {
          if (shown.every((n) => previous.has(n))) return previous;
          const next = new Set(previous);
          shown.forEach((n) => next.add(n));
          return next;
        });
      },
      { root, rootMargin: '200px 0px' },
    );
    items.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf]);
  // Keep the highlighted thumbnail inside the rail without scrolling any outer container.
  useEffect(() => {
    const root = rail.current,
      element = items.current.get(current);
    if (!root || !element) return;
    const top = element.offsetTop,
      bottom = top + element.offsetHeight;
    if (top < root.scrollTop || bottom > root.scrollTop + root.clientHeight)
      root.scrollTop = top - (root.clientHeight - element.offsetHeight) / 2;
  }, [current]);
  return (
    <nav
      ref={rail}
      aria-label="Danh sách trang"
      className="relative hidden h-[65vh] w-32 shrink-0 overflow-y-auto rounded-xl bg-slate-200 dark:bg-slate-900 p-2 xl:block"
    >
      <div className="flex flex-col items-center gap-2">
        {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
          <Thumbnail
            key={n}
            pdf={pdf}
            pageNumber={n}
            active={seen.has(n)}
            current={n === current}
            register={register}
            onSelect={onSelect}
          />
        ))}
      </div>
    </nav>
  );
}

export interface PdfPreviewProps {
  /** PDF source (object URL or signed URL). */
  url: string;
  /** Optional download actions shown in the toolbar (e.g. DocumentHub "Tải PDF / Tải DOCX"). */
  onDownloadPdf?: () => void;
  onDownloadDocx?: () => void;
  /** Disables the download buttons while a download is in progress. */
  downloadBusy?: boolean;
}

export function PdfPreview({ url, onDownloadPdf, onDownloadDocx, downloadBusy = false }: PdfPreviewProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState(1);
  const [draft, setDraft] = useState('1');
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [fitScale, setFitScale] = useState<number | null>(null);
  const [renderScale, setRenderScale] = useState<number | null>(null);
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set());
  const [nonA4, setNonA4] = useState(false);
  const [railOpen, setRailOpen] = useState(readRail);
  const viewport = useRef<HTMLDivElement>(null);
  const pages = useRef(new Map<number, HTMLDivElement>());
  // Page chosen via toolbar/keyboard/thumbnail; wins over scroll-derived tracking until the user scrolls.
  const pinned = useRef<number | null>(null);
  const editing = useRef(false);
  const numPages = pdf?.numPages ?? 0;
  const scale = zoom === 'fit' ? (fitScale ?? 1) : zoom;
  const layout = useRef({ scale, top: 0, left: 0 });

  // Load the document; `attempt` re-runs the load for "Thử lại".
  useEffect(() => {
    let live = true;
    setPdf(null);
    setError('');
    setCurrent(1);
    setNear(new Set());
    setNonA4(false);
    pinned.current = null;
    viewport.current?.scrollTo({ top: 0, left: 0 });
    const task = getDocument({ url });
    task.promise
      .then((doc) => {
        if (live) setPdf(doc);
      })
      .catch(() => {
        if (live) setError('Không mở được tài liệu PDF. Hãy thử lại, hoặc tải bản gốc để xem bằng trình đọc trên máy.');
      });
    return () => {
      live = false;
      void task.destroy();
    };
  }, [url, attempt]);

  // Fit-width scale follows the viewport width (scrollbar gutter is reserved, so no resize loop).
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width > 0) setFitScale(Math.round(clamp(width / PAGE_W_PX, 0.2, MAX_ZOOM) * 1000) / 1000);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Canvas resolution follows the zoom, debounced so window resizes do not re-render every frame.
  const first = useRef(true);
  useEffect(() => {
    if (fitScale === null) return;
    const delay = first.current ? 0 : 200;
    first.current = false;
    const timer = setTimeout(() => setRenderScale(scale), delay);
    return () => clearTimeout(timer);
  }, [scale, fitScale]);
  const renderWidth =
    renderScale === null
      ? 0
      : Math.min(MAX_CANVAS_W, Math.ceil((PAGE_W_PX * Math.ceil(renderScale * devicePixelRatio() * 10)) / 10));

  // Keep the reading position when the scale changes (all frames share the same A4 size).
  useLayoutEffect(() => {
    const element = viewport.current,
      previous = layout.current;
    if (element && previous.scale !== scale) {
      const position = (previous.top - PAD) / (PAGE_H_PX * previous.scale + GAP);
      element.scrollTop = PAD + position * (PAGE_H_PX * scale + GAP);
      element.scrollLeft = previous.left * (scale / previous.scale);
    }
    layout.current = { scale, top: element?.scrollTop ?? 0, left: element?.scrollLeft ?? 0 };
  }, [scale]);

  const register = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    if (element) pages.current.set(pageNumber, element);
    else pages.current.delete(pageNumber);
  }, []);

  // Track which pages are near the viewport (lazy rendering) and which one is current (most visible height).
  useEffect(() => {
    const root = viewport.current;
    if (!pdf || !root) return;
    const visible = new Map<number, number>();
    const pageOf = (entry: IntersectionObserverEntry) => Number((entry.target as HTMLElement).dataset.page);
    const nearObserver = new IntersectionObserver(
      (entries) =>
        setNear((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            if (entry.isIntersecting) next.add(pageOf(entry));
            else next.delete(pageOf(entry));
          }
          return next;
        }),
      { root, rootMargin: '100% 0px' },
    );
    const currentObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(pageOf(entry), entry.intersectionRect.height);
          else visible.delete(pageOf(entry));
        }
        if (pinned.current !== null && visible.has(pinned.current)) return;
        pinned.current = null;
        let best = 0,
          bestHeight = 0;
        visible.forEach((height, n) => {
          if (height > bestHeight + 1 || (Math.abs(height - bestHeight) <= 1 && n < best)) {
            best = n;
            bestHeight = height;
          }
        });
        if (best) setCurrent(best);
      },
      { root, threshold: VISIBILITY_THRESHOLDS },
    );
    pages.current.forEach((element) => {
      nearObserver.observe(element);
      currentObserver.observe(element);
    });
    return () => {
      nearObserver.disconnect();
      currentObserver.disconnect();
    };
  }, [pdf]);

  useEffect(() => {
    if (!editing.current) setDraft(String(current));
  }, [current]);

  const goTo = useCallback(
    (target: number) => {
      const root = viewport.current;
      if (!numPages || !root) return;
      const pageNumber = clamp(Math.round(target), 1, numPages);
      const element = pages.current.get(pageNumber);
      pinned.current = pageNumber;
      setCurrent(pageNumber);
      setDraft(String(pageNumber));
      if (element) root.scrollTo({ top: element.offsetTop - PAD });
    },
    [numPages],
  );

  const commitDraft = () => {
    editing.current = false;
    const value = Number.parseInt(draft.replace(/\D/g, ''), 10);
    if (Number.isFinite(value) && value > 0) goTo(value);
    else setDraft(String(current));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!pdf || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
    const targets: Record<string, number> = {
      PageUp: current - 1,
      PageDown: current + 1,
      Home: 1,
      End: numPages,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    goTo(targets[event.key]);
  };

  const toggleRail = () =>
    setRailOpen((open) => {
      try {
        localStorage.setItem(RAIL_KEY, open ? '0' : '1');
      } catch {
        // Storage unavailable: keep the choice for this session only.
      }
      return !open;
    });

  const releasePin = () => {
    pinned.current = null;
  };
  const ready = !!pdf && renderWidth > 0;
  const percent = Math.round(scale * 100) + '%';

  return (
    <div className="flex flex-col gap-3 text-ink dark:text-slate-100" onKeyDown={onKeyDown}>
      <div
        role="toolbar"
        aria-label="Công cụ xem tài liệu"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 px-2 py-1.5 shadow-sm"
      >
        <span className="hidden xl:inline-flex">
          <IconButton
            size="sm"
            icon={railOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            aria-label={railOpen ? 'Ẩn danh sách trang' : 'Hiện danh sách trang'}
            aria-pressed={railOpen}
            tooltip={railOpen ? 'Ẩn danh sách trang' : 'Hiện danh sách trang'}
            disabled={!pdf}
            onClick={toggleRail}
          />
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            icon={<ChevronLeft size={14} />}
            aria-label="Trang trước"
            tooltip="Trang trước (PageUp)"
            disabled={!pdf || current <= 1}
            onClick={() => goTo(current - 1)}
          />
          <label className="flex items-center gap-1.5 text-sm">
            <span>Trang</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Số trang"
              value={draft}
              disabled={!pdf}
              onFocus={(event) => {
                editing.current = true;
                event.currentTarget.select();
              }}
              onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 5))}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitDraft();
                } else if (event.key === 'Escape' && editing.current) {
                  event.stopPropagation();
                  editing.current = false;
                  setDraft(String(current));
                  event.currentTarget.blur();
                }
              }}
              className="w-12 rounded-lg border border-border dark:border-slate-600 bg-surface dark:bg-slate-900 px-1.5 py-1 text-center font-mono text-sm tabular-nums text-ink dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 disabled:opacity-50"
            />
            <span className="font-mono tabular-nums text-ink-muted dark:text-slate-400">/ {numPages || '…'}</span>
          </label>
          <IconButton
            size="sm"
            icon={<ChevronRight size={14} />}
            aria-label="Trang sau"
            tooltip="Trang sau (PageDown)"
            disabled={!pdf || current >= numPages}
            onClick={() => goTo(current + 1)}
          />
        </div>
        <span className="hidden h-6 w-px bg-slate-300 dark:bg-slate-600 sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            icon={<ZoomOut size={14} />}
            aria-label="Thu nhỏ"
            tooltip="Thu nhỏ"
            disabled={!pdf || scale <= MIN_ZOOM + 0.001}
            onClick={() => setZoom(prevZoom(scale))}
          />
          <span
            aria-live="polite"
            className="w-12 text-center font-mono text-xs tabular-nums text-ink-secondary dark:text-slate-300"
          >
            {percent}
          </span>
          <IconButton
            size="sm"
            icon={<ZoomIn size={14} />}
            aria-label="Phóng to"
            tooltip="Phóng to"
            disabled={!pdf || scale >= MAX_ZOOM - 0.001}
            onClick={() => setZoom(nextZoom(scale))}
          />
          <Tooltip content="Thu phóng vừa chiều rộng khung xem">
            <Button
              variant={zoom === 'fit' ? 'secondary' : 'ghost'}
              size="xs"
              leftIcon={<MoveHorizontal size={12} />}
              aria-pressed={zoom === 'fit'}
              disabled={!pdf}
              onClick={() => setZoom('fit')}
            >
              Vừa khung
            </Button>
          </Tooltip>
          <Tooltip content="Xem đúng kích thước thật của trang A4">
            <Button
              variant={zoom === 1 ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={zoom === 1}
              disabled={!pdf}
              onClick={() => setZoom(1)}
            >
              100%
            </Button>
          </Tooltip>
        </div>
        {(onDownloadPdf || onDownloadDocx) && (
          <div className="ml-auto flex items-center gap-2">
            {onDownloadPdf && (
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<Download size={12} />}
                disabled={downloadBusy}
                onClick={onDownloadPdf}
              >
                Tải PDF
              </Button>
            )}
            {onDownloadDocx && (
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<Download size={12} />}
                disabled={downloadBusy}
                onClick={onDownloadDocx}
              >
                Tải DOCX
              </Button>
            )}
          </div>
        )}
      </div>

      {nonA4 && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Trang gốc khác A4, được thu vừa khung xem. Bản tải về giữ nguyên khổ gốc.
        </p>
      )}

      <div className="flex gap-3">
        {pdf && railOpen && <ThumbnailRail pdf={pdf} current={current} onSelect={goTo} />}
        <div
          ref={viewport}
          tabIndex={0}
          aria-label="Vùng xem tài liệu A4. Dùng PageUp, PageDown, Home, End để chuyển trang."
          aria-busy={!ready}
          onScroll={(event) => {
            layout.current.top = event.currentTarget.scrollTop;
            layout.current.left = event.currentTarget.scrollLeft;
          }}
          onWheel={releasePin}
          onTouchMove={releasePin}
          onPointerDown={releasePin}
          style={{ scrollbarGutter: 'stable' }}
          className="relative h-[65vh] min-w-0 flex-1 overflow-auto rounded-xl bg-slate-200 dark:bg-slate-900 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400"
        >
          {error ? (
            <div className="mx-auto max-w-xl pt-8">
              <ErrorMessage title="Không xem được tài liệu" error={error} onRetry={() => setAttempt((n) => n + 1)} />
            </div>
          ) : pdf ? (
            <div className="flex w-max min-w-full flex-col items-center gap-3">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <PageView
                  key={n}
                  pdf={pdf}
                  pageNumber={n}
                  scale={scale}
                  active={ready && near.has(n)}
                  renderWidth={renderWidth}
                  register={register}
                  onSize={(width, height) => {
                    if (Math.abs(width - 595.276) > 2 || Math.abs(height - 841.89) > 2) setNonA4(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <div role="status" className="flex flex-col items-center">
              <span className="sr-only">Đang tải tài liệu…</span>
              <Skeleton
                variant="rectangular"
                animation="pulse"
                width={PAGE_W_PX * scale}
                height={PAGE_H_PX * scale}
                className="shadow-card"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
