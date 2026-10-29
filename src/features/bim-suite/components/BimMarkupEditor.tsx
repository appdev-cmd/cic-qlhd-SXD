import { BimOverlay } from '@/features/bim-suite/adapters/controls';
import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimMarkupEditor.tsx
// Vẽ ghi chú lên ảnh chụp mô hình (mũi tên, khoanh vùng, bút tự do, chữ) — dùng cho vướng mắc (BCF markup)
// và góc nhìn đã lưu. Kết quả là ảnh PNG đã gộp nét vẽ.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil, MoveUpRight, Square, Circle, Type, Undo2, Redo2, Trash2, Check } from 'lucide-react';
import { toCssPx } from '@/features/bim-suite/adapters/utils';

type Tool = 'pen' | 'arrow' | 'rect' | 'ellipse' | 'text';

interface Shape {
  tool: Tool;
  color: string;
  width: number;
  points: { x: number; y: number }[];
  text?: string;
}

interface BimMarkupEditorProps {
  image: string;
  title?: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

const COLORS = ['#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#111827', '#ffffff'];
const TOOLS: { key: Tool; label: string; icon: React.ElementType }[] = [
  { key: 'arrow', label: 'Mũi tên', icon: MoveUpRight },
  { key: 'rect', label: 'Khung chữ nhật', icon: Square },
  { key: 'ellipse', label: 'Khoanh vùng', icon: Circle },
  { key: 'pen', label: 'Bút tự do', icon: Pencil },
  { key: 'text', label: 'Chữ', icon: Type },
];

/** Vẽ một nét lên canvas (toạ độ theo pixel ảnh gốc) */
export const drawShape = (ctx: CanvasRenderingContext2D, s: Shape, scale = 1) => {
  const w = s.width * scale;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const [a, b] = [s.points[0], s.points[s.points.length - 1]];
  if (!a) {
    ctx.restore();
    return;
  }
  if (s.tool === 'pen') {
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  } else if (s.tool === 'rect') {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (s.tool === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2 || 1,
      Math.abs(b.y - a.y) / 2 || 1,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else if (s.tool === 'arrow') {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(12, w * 4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x - Math.cos(angle) * head * 0.6, b.y - Math.sin(angle) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  } else if (s.tool === 'text' && s.text) {
    const size = Math.max(16, w * 6);
    ctx.font = `600 ${size}px Inter, "Segoe UI", sans-serif`;
    const metrics = ctx.measureText(s.text);
    ctx.fillStyle = s.color === '#ffffff' ? 'rgba(17,24,39,0.75)' : 'rgba(255,255,255,0.85)';
    ctx.fillRect(a.x - 4, a.y - size, metrics.width + 8, size * 1.3);
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, a.x, a.y);
  }
  ctx.restore();
};

export const BimMarkupEditor: React.FC<BimMarkupEditorProps> = ({
  image,
  title = 'Ghi chú lên ảnh',
  onSave,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [redo, setRedo] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const c = canvasRef.current;
      if (c) {
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
      }
      setReady(true);
    };
    img.src = image;
  }, [image]);

  // Vẽ lại toàn bộ khi danh sách nét thay đổi
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !imgRef.current) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(imgRef.current, 0, 0);
    const scale = c.width / 1000 > 1 ? c.width / 1000 : 1;
    [...shapes, ...(draft ? [draft] : [])].forEach((s) => drawShape(ctx, s, scale));
  }, [shapes, draft, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textAt) return;
      if (e.key === 'Escape') onCancel();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toImage = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
      sx: toCssPx(e.clientX - r.left),
      sy: toCssPx(e.clientY - r.top),
    };
  };

  const commit = (s: Shape) => {
    setShapes((prev) => [...prev, s]);
    setRedo([]);
  };

  const undo = () => {
    setShapes((prev) => {
      if (!prev.length) return prev;
      setRedo((r) => [...r, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = toImage(e);
    if (tool === 'text') {
      setTextAt(p);
      setTextValue('');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ tool, color, width, points: [{ x: p.x, y: p.y }] });
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const p = toImage(e);
    setDraft((d) =>
      d
        ? { ...d, points: d.tool === 'pen' ? [...d.points, { x: p.x, y: p.y }] : [d.points[0], { x: p.x, y: p.y }] }
        : d,
    );
  };

  const onUp = () => {
    if (!draft) return;
    const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]];
    if (draft.tool === 'pen' ? draft.points.length > 1 : Math.hypot(b.x - a.x, b.y - a.y) > 4) commit(draft);
    setDraft(null);
  };

  const confirmText = () => {
    if (textAt && textValue.trim())
      commit({ tool: 'text', color, width, points: [{ x: textAt.x, y: textAt.y }], text: textValue.trim() });
    setTextAt(null);
    setTextValue('');
  };

  return createPortal(
    <BimOverlay onClose={onCancel}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-700 text-white text-xs dark:bg-slate-900">
        <span className="font-semibold mr-2">{title}</span>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-800 dark:bg-slate-800">
          {TOOLS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              data-tooltip={label}
              aria-label={label}
              onClick={() => setTool(key)}
              className={`p-1.5 rounded-md ${tool === key ? 'bg-primary-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Màu ${c}`}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-primary-400 scale-110' : 'border-slate-600'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-slate-300">
          Nét
          <BimInput
            type="range"
            min={2}
            max={12}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="w-20 accent-primary-500"
          />
        </label>
        <button
          type="button"
          onClick={undo}
          disabled={!shapes.length}
          className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          data-tooltip="Hoàn tác (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!redo.length) return;
            setShapes((prev) => [...prev, redo[redo.length - 1]]);
            setRedo((r) => r.slice(0, -1));
          }}
          disabled={!redo.length}
          className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          data-tooltip="Làm lại"
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setShapes([])}
          disabled={!shapes.length}
          className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          data-tooltip="Xóa hết nét vẽ"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 flex items-center gap-1"
        >
          <X className="w-4 h-4" /> Hủy
        </button>
        <button
          type="button"
          onClick={() => canvasRef.current && onSave(canvasRef.current.toDataURL('image/png'))}
          className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 font-semibold flex items-center gap-1"
        >
          <Check className="w-4 h-4" /> Dùng ảnh này
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="relative max-w-full max-h-full">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className={`max-w-full max-h-[calc(100vh-7rem)] rounded-lg shadow-2xl bg-white ${tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
            style={{ touchAction: 'none' }}
          />
          {textAt && (
            <BimInput
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmText();
                if (e.key === 'Escape') setTextAt(null);
              }}
              onBlur={confirmText}
              placeholder="Nhập ghi chú rồi Enter"
              className="absolute px-2 py-1 rounded border-2 border-primary-500 bg-white text-slate-900 text-sm shadow-lg min-w-[180px]"
              style={{ left: textAt.sx, top: textAt.sy - 16 }}
            />
          )}
        </div>
      </div>
      <p className="pb-3 text-center text-2xs text-slate-400">
        Kéo chuột để vẽ · chọn công cụ Chữ rồi bấm vào ảnh để ghi chú · Ctrl+Z hoàn tác · Esc để hủy
      </p>
    </BimOverlay>,
    document.body,
  );
};
