import { BimOverlay } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimQrLabelModal.tsx
// Nhãn mã QR dán tại cấu kiện ngoài hiện trường: quét bằng điện thoại mở đúng cấu kiện trên mô hình.

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import qrcode from 'qrcode-generator';
import { X, Printer, Download, QrCode } from 'lucide-react';
import { getIfcLabel } from '../lib/ifcLabels';

export interface QrLabelItem {
  guid: string;
  name?: string | null;
  category?: string | null;
  /** Liên kết riêng (vd. bước của tuyến kiểm tra); mặc định mở cấu kiện theo GUID */
  link?: string;
  /** Dòng phụ thay cho tên lớp IFC (vd. "Bước 2 · Tuyến kỹ thuật tầng 3") */
  caption?: string;
}

interface BimQrLabelModalProps {
  projectId: string;
  projectName?: string;
  items: QrLabelItem[];
  onClose: () => void;
  title?: string;
  description?: string;
}

/** Opens the project model at the element (BimProjectViewer reads ?bimGuid=). */
export const elementDeepLink = (projectId: string, guid: string, origin = window.location.origin) =>
  `${origin}/app/bim/${encodeURIComponent(projectId)}?bimGuid=${encodeURIComponent(guid)}`;

const qrSvg = (text: string) => {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
};

const qrDataUrl = (text: string, cell = 8) => {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createDataURL(cell, 4);
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const BimQrLabelModal: React.FC<BimQrLabelModalProps> = ({
  projectId,
  projectName,
  items,
  onClose,
  title,
  description,
}) => {
  const labels = useMemo(
    () =>
      items.map((it) => {
        const url = it.link || elementDeepLink(projectId, it.guid);
        return { ...it, url, svg: qrSvg(url) };
      }),
    [items, projectId],
  );

  const print = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    const cells = labels
      .map(
        (l) =>
          `<div class="lbl">${l.svg}<div class="t"><b>${escapeHtml(l.name || 'Cấu kiện')}</b><span>${escapeHtml(l.caption || getIfcLabel(l.category || ''))}</span><small>${escapeHtml(l.guid)}</small>${
            projectName ? `<em>${escapeHtml(projectName)}</em>` : ''
          }</div></div>`,
      )
      .join('');
    w.document
      .write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title || 'Nhãn QR cấu kiện')}</title><style>
      @page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;margin:0}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}
      .lbl{display:flex;gap:4mm;align-items:center;border:1px dashed #94a3b8;border-radius:3mm;padding:3mm;break-inside:avoid}
      .lbl svg{width:32mm;height:32mm;flex:none}
      .t{display:flex;flex-direction:column;gap:1mm;font-size:10pt;min-width:0}
      .t span{color:#475569;font-size:9pt}.t small{font-family:monospace;font-size:7pt;color:#64748b;word-break:break-all}
      .t em{font-size:8pt;color:#1d4ed8;font-style:normal}
    </style></head><body><div class="grid">${cells}</div><script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const downloadPng = (l: (typeof labels)[number]) => {
    const a = document.createElement('a');
    a.href = qrDataUrl(l.url);
    a.download = `QR_${(l.name || l.guid).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60)}.gif`;
    a.click();
  };

  return createPortal(
    <BimOverlay onClose={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {title || 'Nhãn mã QR cấu kiện'} ({labels.length})
              </h3>
              <p className="text-xs text-slate-500">
                {description ||
                  'Dán tại hiện trường — quét bằng điện thoại để mở đúng cấu kiện trên mô hình (cần đăng nhập).'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid sm:grid-cols-2 gap-3">
          {labels.map((l) => (
            <div
              key={l.url}
              className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600"
            >
              <div className="w-24 h-24 shrink-0 bg-white rounded-lg p-1" dangerouslySetInnerHTML={{ __html: l.svg }} />
              <div className="min-w-0 text-xs space-y-0.5">
                <p className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">{l.name || 'Cấu kiện'}</p>
                <p className="text-slate-500">{l.caption || getIfcLabel(l.category || '')}</p>
                <p className="font-mono text-2xs text-slate-400 break-all">{l.guid}</p>
                <button
                  type="button"
                  onClick={() => downloadPng(l)}
                  className="mt-1 text-2xs text-primary-600 hover:underline flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Tải ảnh QR
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={print}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> In nhãn (A4)
          </button>
        </div>
      </div>
    </BimOverlay>,
    document.body,
  );
};
