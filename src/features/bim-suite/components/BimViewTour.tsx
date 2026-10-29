import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// Trình chiếu chuỗi góc nhìn đã lưu (diễn hoạt camera), xuất ảnh hàng loạt (ZIP) và quay video (WebM) từ khung 3D.
import React, { useRef, useState } from 'react';
import { Film, Images, Play, Square } from 'lucide-react';
import type { BimSavedView } from '@/features/bim-suite/types/bim.types';
import { useToast } from '@/features/bim-suite/adapters/toast';

const wait = (ms: number, signal: { stop: boolean }) =>
  new Promise<void>((resolve) => {
    const started = Date.now();
    const tick = () => (signal.stop || Date.now() - started >= ms ? resolve() : setTimeout(tick, 100));
    tick();
  });
const safe = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .slice(0, 60) || 'goc_nhin';

/** Định dạng video trình duyệt quay được (Chrome/Edge: WebM VP9/VP8). */
export function pickVideoMime(isSupported: (m: string) => boolean): string | null {
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => isSupported(m)) ?? null;
}

export const BimViewTour: React.FC<{
  views: BimSavedView[];
  onApply: (view: BimSavedView) => Promise<void> | void;
  capture: () => string;
  getCanvas?: () => HTMLCanvasElement | null;
}> = ({ views, onApply, capture, getCanvas }) => {
  const { addToast } = useToast();
  const [dwell, setDwell] = useState(4);
  const [mode, setMode] = useState<null | 'play' | 'images' | 'video'>(null);
  const [current, setCurrent] = useState(0);
  const stopRef = useRef({ stop: false });

  const run = async (kind: 'play' | 'images' | 'video') => {
    if (!views.length) return;
    stopRef.current = { stop: false };
    const signal = stopRef.current;
    setMode(kind);
    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];
    const images: { name: string; data: string }[] = [];
    try {
      if (kind === 'video') {
        const canvas = getCanvas?.();
        const mime =
          typeof MediaRecorder !== 'undefined' ? pickVideoMime((m) => MediaRecorder.isTypeSupported(m)) : null;
        if (!canvas || !mime || typeof canvas.captureStream !== 'function') {
          addToast({
            type: 'error',
            message: 'Trình duyệt này không quay được video khung 3D. Dùng Chrome hoặc Edge, hoặc xuất ảnh.',
          });
          return;
        }
        recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.start(500);
      }
      for (let i = 0; i < views.length && !signal.stop; i++) {
        setCurrent(i);
        await onApply(views[i]);
        // Chờ trình xem vẽ xong góc nhìn mới trước khi chụp
        await wait(kind === 'images' ? 1200 : dwell * 1000, signal);
        if (kind === 'images' && !signal.stop)
          images.push({ name: `${String(i + 1).padStart(2, '0')}_${safe(views[i].name)}.png`, data: capture() });
      }
      if (kind === 'images' && images.length) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const img of images)
          if (img.data.startsWith('data:image/png;base64,')) zip.file(img.name, img.data.slice(22), { base64: true });
        download(await zip.generateAsync({ type: 'blob' }), 'goc_nhin_BIM.zip');
        addToast({ type: 'success', message: `Đã xuất ${images.length} ảnh góc nhìn.` });
      }
    } finally {
      if (recorder && recorder.state !== 'inactive') {
        const done = new Promise<void>((resolve) => {
          recorder!.onstop = () => resolve();
        });
        recorder.stop();
        await done;
        if (chunks.length) download(new Blob(chunks, { type: 'video/webm' }), 'trinh_chieu_BIM.webm');
      }
      setMode(null);
    }
  };
  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const btn =
    'flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40';

  if (views.length < 2) return null;
  return (
    <div className="px-2 pt-2" aria-label="Trình chiếu góc nhìn">
      <div className="flex flex-wrap items-center gap-1.5 text-2xs">
        {mode ? (
          <>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {mode === 'images' ? 'Đang xuất ảnh' : mode === 'video' ? 'Đang quay' : 'Đang trình chiếu'} {current + 1}/
              {views.length}
            </span>
            <button
              type="button"
              className={btn}
              onClick={() => {
                stopRef.current.stop = true;
              }}
            >
              <Square className="w-3 h-3" /> Dừng
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={btn}
              onClick={() => void run('play')}
              data-tooltip="Lần lượt bay qua các góc nhìn đang hiển thị"
            >
              <Play className="w-3 h-3" /> Trình chiếu
            </button>
            <label className="flex items-center gap-1 text-slate-500">
              mỗi cảnh
              <BimInput
                type="number"
                min={1}
                max={30}
                value={dwell}
                onChange={(e) => setDwell(Math.max(1, Math.min(30, Number(e.target.value) || 4)))}
                className="w-10 px-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                aria-label="Số giây mỗi cảnh"
              />{' '}
              giây
            </label>
            <button type="button" className={btn} onClick={() => void run('images')}>
              <Images className="w-3 h-3" /> Xuất ảnh
            </button>
            {getCanvas && (
              <button type="button" className={btn} onClick={() => void run('video')}>
                <Film className="w-3 h-3" /> Quay video
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
