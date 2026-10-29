import { BimTable, BimSelect, BimInput } from '@/features/bim-suite/adapters/controls';
// features/bim/components/BimBasemapPanel.tsx
// Nền bản đồ (OpenStreetMap theo toạ độ IfcSite) hoặc ảnh flycam / trực ảnh tự tải lên, đặt dưới mô hình.

import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon, X, Loader2, Upload, Save, Trash2, Eye, EyeOff } from 'lucide-react';
import type { BimBasemap, BimModel } from '@/features/bim-suite/types/bim.types';
import { BimService } from '../services/BimService';
import { buildOsmGround } from '../lib/basemap';
import { useToast } from '@/features/bim-suite/adapters/toast';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface BimBasemapPanelProps {
  projectId: string;
  model?: BimModel | null;
  canEdit?: boolean;
  currentUserName?: string;
  getSceneBox: () => { min: [number, number, number]; max: [number, number, number] } | null;
  apply: (
    config: {
      url: string;
      minX: number;
      minZ: number;
      maxX: number;
      maxZ: number;
      opacity?: number;
      elevation?: number;
    } | null,
  ) => Promise<void>;
  onClose: () => void;
}

export const BimBasemapPanel: React.FC<BimBasemapPanelProps> = ({
  projectId,
  model,
  canEdit,
  currentUserName,
  getSceneBox,
  apply,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: saved } = useQuery({
    queryKey: ['bim-basemap', projectId],
    queryFn: () => BimService.getBasemap(projectId),
  });
  const [mode, setMode] = useState<'anh' | 'osm'>('anh');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [bounds, setBounds] = useState({ minX: 0, minZ: 0, maxX: 100, maxZ: 100 });
  const [opacity, setOpacity] = useState(0.9);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  const lat = model?.georef?.latitude;
  const lon = model?.georef?.longitude;

  // Nạp cấu hình đã lưu của dự án (mỗi lần bản lưu đổi); chưa có thì lấy khung bao mô hình + 15%
  const savedKey = saved ? (saved.updated_at ?? 'saved') : 'none';
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  if (savedKey !== syncedKey) {
    setSyncedKey(savedKey);
    if (saved) {
      setMode(saved.loai);
      setBounds({
        minX: Number(saved.min_x),
        minZ: Number(saved.min_z),
        maxX: Number(saved.max_x),
        maxZ: Number(saved.max_z),
      });
      setOpacity(Number(saved.do_mo) || 0.9);
    } else {
      const box = getSceneBox();
      if (box) {
        const pad = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]) * 0.15;
        setBounds({ minX: box.min[0] - pad, minZ: box.min[2] - pad, maxX: box.max[0] + pad, maxZ: box.max[2] + pad });
      }
    }
  }

  const show = async (cfg = { mode, bounds, opacity, path: saved?.duong_dan || null }) => {
    setBusy(true);
    try {
      if (cfg.mode === 'osm') {
        if (lat == null || lon == null)
          throw new Error('Mô hình chưa có toạ độ IfcSite (vĩ độ/kinh độ) để đặt bản đồ nền.');
        const box = getSceneBox();
        const half = box ? Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]) * 0.8 + 50 : 300;
        const g = await buildOsmGround(lat, lon, half);
        await apply({ ...g, opacity: cfg.opacity });
      } else {
        const url = preview || (cfg.path ? await BimService.getSignedFileUrl(cfg.path) : null);
        if (!url) throw new Error('Chọn ảnh flycam / trực ảnh trước.');
        await apply({ url, ...cfg.bounds, opacity: cfg.opacity });
      }
      setVisible(true);
    } catch (e) {
      addToast({ type: 'error', title: 'Chưa hiển thị được nền', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const cfg: BimBasemap = {
        project_id: projectId,
        loai: mode,
        duong_dan: saved?.duong_dan || null,
        min_x: bounds.minX,
        min_z: bounds.minZ,
        max_x: bounds.maxX,
        max_z: bounds.maxZ,
        do_mo: opacity,
        ten_nguoi_cap_nhat: currentUserName || null,
      };
      await BimService.saveBasemap(cfg, mode === 'anh' ? file : null);
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ['bim-basemap', projectId] });
      addToast({ type: 'success', message: 'Đã lưu nền cho dự án — mọi người mở mô hình đều thấy.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const num = (key: keyof typeof bounds) => (
    <label className="flex-1">
      <span className="block text-3xs uppercase text-slate-400">{key}</span>
      <BimInput
        type="number"
        step="1"
        value={Math.round(bounds[key] * 100) / 100}
        onChange={(e) => setBounds((b) => ({ ...b, [key]: Number(e.target.value) || 0 }))}
        className="w-full px-1.5 py-1 rounded-md border border-border dark:border-slate-700 bg-white dark:bg-slate-900 text-2xs"
      />
    </label>
  );

  return (
    <div className="absolute top-3 right-24 z-20 w-72 rounded-2xl bg-bg-surface/95 dark:bg-slate-800 backdrop-blur-md border border-border dark:border-slate-700 shadow-xl text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border dark:border-slate-700">
        <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <MapIcon className="w-4 h-4 text-primary-600" /> Nền bản đồ / ảnh flycam
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600"
          aria-label="Đóng"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900">
          {(
            [
              ['anh', 'Ảnh flycam / trực ảnh'],
              ['osm', 'Bản đồ OpenStreetMap'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={`py-1 rounded-md ${mode === k ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold text-primary-700 dark:text-primary-300' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'anh' ? (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:border-primary-400 flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />{' '}
              {file ? file.name : saved?.duong_dan ? 'Thay ảnh khác…' : 'Chọn ảnh (JPG/PNG)'}
            </button>
            <BimInput
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setFile(f);
                setPreview((old) => {
                  if (old) URL.revokeObjectURL(old);
                  return URL.createObjectURL(f);
                });
              }}
            />
            <p className="text-2xs text-txt-muted">
              Khung ảnh theo mét trong hệ toạ độ trình xem (X hướng Đông, Z hướng Nam). Mặc định bằng khung bao mô hình
              + 15%.
            </p>
            <div className="flex gap-1">
              {num('minX')}
              {num('maxX')}
            </div>
            <div className="flex gap-1">
              {num('minZ')}
              {num('maxZ')}
            </div>
          </>
        ) : (
          <p className="text-2xs text-txt-muted leading-relaxed">
            Đặt bản đồ theo toạ độ IfcSite của mô hình (
            {lat != null && lon != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'chưa có'}). Hướng Bắc = trục −Z. Vị
            trí gần đúng; cần truy cập được máy chủ bản đồ OpenStreetMap.
          </p>
        )}

        <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          Độ đậm
          <BimInput
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="flex-1 accent-primary-600"
          />
        </label>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => show()}
            disabled={busy}
            className="flex-1 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-1"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Hiển thị
          </button>
          {visible && (
            <button
              type="button"
              onClick={async () => {
                await apply(null);
                setVisible(false);
              }}
              className="px-2 rounded-lg border border-border dark:border-slate-700"
              data-tooltip="Ẩn nền"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={busy || (mode === 'anh' && !file && !saved?.duong_dan)}
              className="px-2 rounded-lg border border-border dark:border-slate-700 disabled:opacity-40"
              data-tooltip="Lưu cho cả dự án"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          )}
          {canEdit && saved && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await BimService.deleteBasemap(projectId);
                  await apply(null);
                  setVisible(false);
                  void queryClient.invalidateQueries({ queryKey: ['bim-basemap', projectId] });
                } catch (e) {
                  addToast({ type: 'error', message: errorText(e) });
                }
              }}
              className="px-2 rounded-lg border border-border dark:border-slate-700 text-rose-500"
              data-tooltip="Xóa nền đã lưu"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {saved?.ten_nguoi_cap_nhat && <p className="text-2xs text-slate-400">Đã lưu bởi {saved.ten_nguoi_cap_nhat}</p>}
      </div>
    </div>
  );
};
