import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;
const button =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400 transition-colors rounded-lg border border-border dark:border-border bg-surface dark:bg-surface px-3 py-2 text-xs text-ink dark:text-ink disabled:opacity-50';
export function PdfPreview({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [nonA4, setNonA4] = useState(false);
  const [scale, setScale] = useState(1),
    [fit, setFit] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    container.current?.scrollTo({ top: 0, left: 0 });
  }, [page, fit]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setScale(Math.min(1, Math.max(0.2, (entries[0].contentRect.width - 24) / ((210 * 96) / 25.4)))),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let live = true;
    setPdf(null);
    setPage(1);
    setError('');
    setBusy(true);
    const task = getDocument({ url });
    task.promise
      .then((doc) => {
        if (live) setPdf(doc);
      })
      .catch(() => {
        if (live) {
          setError('Không xem được tài liệu. Tải PDF để mở bằng trình đọc trên máy.');
          setBusy(false);
        }
      });
    return () => {
      live = false;
      void task.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let live = true,
      renderTask: RenderTask | undefined;
    setBusy(true);
    setError('');
    (async () => {
      const p = await pdf.getPage(page);
      if (!live || !canvas.current) return;
      const viewport = p.getViewport({ scale: 1.7 });
      const original = p.getViewport({ scale: 1 });
      setNonA4(Math.abs(original.width - 595.276) > 2 || Math.abs(original.height - 841.89) > 2);
      const surface = canvas.current;
      surface.width = Math.ceil(viewport.width);
      surface.height = Math.ceil(viewport.height);
      renderTask = p.render({ canvas: surface, viewport });
      await renderTask.promise;
      if (live) setBusy(false);
    })().catch(() => {
      if (live) {
        setError('Không vẽ được trang PDF. Hãy tải bản gốc để xem.');
        setBusy(false);
      }
    });
    return () => {
      live = false;
      renderTask?.cancel();
    };
  }, [pdf, page]);
  return (
    <div className="space-y-3 text-ink dark:text-ink">
      <div className="flex items-center flex-wrap gap-3">
        <button className={button} disabled={!pdf || busy || page === 1} onClick={() => setPage((n) => n - 1)}>
          Trang trước
        </button>
        <span className="text-sm">
          Trang {page} / {pdf?.numPages || '…'}
        </span>
        <button
          className={button}
          disabled={!pdf || busy || page === pdf.numPages}
          onClick={() => setPage((n) => n + 1)}
        >
          Trang sau
        </button>
        <button className={button} onClick={() => setFit((v) => !v)}>
          {fit ? 'Xem 100%' : 'Vừa chiều rộng'}
        </button>
        {busy && (
          <span role="status" className="text-xs">
            Đang hiển thị trang…
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {nonA4 && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Trang gốc khác A4, được thu vừa khung xem. Bản tải về giữ nguyên khổ gốc.
        </p>
      )}
      <div ref={container} className="max-h-[65vh] overflow-auto bg-slate-200 dark:bg-slate-800 p-3">
        <div
          style={{
            width: '210mm',
            height: '297mm',
            maxHeight: '297mm',
            overflow: 'hidden',
            boxSizing: 'border-box',
            zoom: fit ? scale : 1,
          }}
          className="mx-auto bg-white dark:bg-white shadow-sm"
        >
          <canvas
            ref={canvas}
            aria-label={'Nội dung PDF trang ' + page}
            role="img"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
}
