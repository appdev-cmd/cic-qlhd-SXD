import { formatNumber, formatDateTime } from '@/lib/utils';
'use client';
// Lọc cấu kiện theo mã Uniclass 2015 đọc từ IfcClassificationReference của tệp IFC (thuoc_tinh.phan_loai do bộ chuyển
// đổi trích). Thay BimUniclassFilter của cic-hud, vốn đọc mã từ từ điển dữ liệu riêng của dự án HUD. Mã cha chọn cả
// mã con (Pr_20_85 → Pr_20_85_16_15).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Focus, Loader2, MousePointerClick, Palette, Tags } from 'lucide-react';
import type { BimModel } from '../types/bim.types';
import { BimService } from '../services/BimService';
import { BimUniclassService, type UniclassCode } from '../services/BimUniclassService';

const tables: { key: string; label: string; hint: string }[] = [
  { key: 'pr', label: 'Sản phẩm (Pr)', hint: 'Vật liệu, cấu kiện, thiết bị' },
  { key: 'ss', label: 'Hệ thống (Ss)', hint: 'Hệ kết cấu, hệ kỹ thuật' },
  { key: 'ef', label: 'Bộ phận (EF)', hint: 'Phần tử, chức năng' },
];
// Màu tô theo nhóm mã, đủ phân biệt trên nền mô hình xám.
const palette = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
];

export function BimUniclassPanel({
  models,
  onSelect,
  onIsolate,
  onColorize,
}: {
  models: BimModel[];
  onSelect: (items: { modelId: string; expressId: number }[]) => void;
  onIsolate: (groups: { modelId: string; ids: number[] }[]) => void;
  onColorize: (groups: { modelId: string; ids: number[]; color: string; label: string }[] | null) => void;
}) {
  const modelIds = useMemo(
    () =>
      models
        .filter((m) => m.status === 'ready')
        .map((m) => m.id)
        .sort(),
    [models],
  );
  const [table, setTable] = useState('pr');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['bim-uniclass', modelIds],
    queryFn: () => BimUniclassService.summary(modelIds),
    enabled: modelIds.length > 0,
    staleTime: 60_000,
  });
  const codes = useMemo(() => (query.data ?? []).filter((c) => c.bang === table), [query.data, table]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of query.data ?? []) map.set(c.bang, (map.get(c.bang) ?? 0) + 1);
    return map;
  }, [query.data]);

  const elementsOf = (code: string) =>
    BimService.filterElements(modelIds, [{ truong: ['phan_loai'], toan_tu: 'chua', gia_tri: code }]);
  const group = (rows: { model_id: string; express_id: number }[]) => {
    const map = new Map<string, number[]>();
    for (const r of rows) map.set(r.model_id, [...(map.get(r.model_id) ?? []), r.express_id]);
    return [...map].map(([modelId, ids]) => ({ modelId, ids }));
  };
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lọc được cấu kiện theo mã Uniclass.');
    } finally {
      setBusy(null);
    }
  };
  const colorizeTable = () =>
    run('color', async () => {
      const top = codes
        .slice()
        .sort((a, b) => b.so_luong - a.so_luong)
        .slice(0, palette.length);
      const groups = [];
      for (const [i, code] of top.entries())
        for (const g of group(await elementsOf(code.ma)))
          groups.push({ ...g, color: palette[i], label: `${code.ma} ${code.ten ?? ''}`.trim() });
      onColorize(groups.length ? groups : null);
    });

  if (!modelIds.length) return null;
  return (
    <section aria-labelledby="bim-uniclass-title" className="space-y-3 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Tags size={15} className="text-primary-700" />
        <h3 id="bim-uniclass-title" className="flex-1 font-semibold text-txt-primary">
          Phân loại Uniclass 2015
        </h3>
        {codes.length ? (
          <button type="button" className="doc-button py-1" onClick={colorizeTable} disabled={!!busy}>
            {busy === 'color' ? <Loader2 size={13} className="animate-spin" /> : <Palette size={13} />}
            Tô màu
          </button>
        ) : null}
      </div>
      <div role="tablist" className="flex flex-wrap gap-1">
        {tables.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={table === t.key}
            data-tooltip={t.hint}
            onClick={() => setTable(t.key)}
            className={`rounded-full border px-2.5 py-1 ${table === t.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-border text-txt-secondary hover:border-primary-300'}`}
          >
            {t.label} {counts.get(t.key) ? `(${counts.get(t.key)})` : ''}
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <p role="status" className="text-txt-muted">
          Đang đọc mã phân loại…
        </p>
      ) : query.error ? (
        <p role="alert" className="text-rose-700">
          {query.error instanceof Error ? query.error.message : 'Không đọc được mã phân loại.'}
        </p>
      ) : !query.data?.length ? (
        <p className="text-txt-muted">
          Mô hình chưa gắn mã Uniclass. Khi xuất IFC, bật xuất phân loại (IfcClassificationReference) để lọc theo mã.
        </p>
      ) : !codes.length ? (
        <p className="text-txt-muted">Không có mã thuộc bảng này.</p>
      ) : (
        <ul className="max-h-[40vh] space-y-1 overflow-y-auto">
          {codes.map((code: UniclassCode) => (
            <li key={code.ma} className="flex items-center gap-2 rounded-lg border border-border-subtle px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-mono font-semibold text-txt-primary">{code.ma}</span>
                {code.ten ? <span className="block truncate text-txt-muted">{code.ten}</span> : null}
              </span>
              <span className="tabular-nums text-txt-muted">{formatNumber(code.so_luong, 2)}</span>
              <button
                type="button"
                className="doc-icon size-7"
                aria-label={`Chọn cấu kiện mã ${code.ma}`}
                disabled={!!busy}
                onClick={() =>
                  run(code.ma + ':select', async () =>
                    onSelect(
                      (await elementsOf(code.ma)).map((r) => ({ modelId: r.model_id, expressId: r.express_id })),
                    ),
                  )
                }
              >
                {busy === code.ma + ':select' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <MousePointerClick size={13} />
                )}
              </button>
              <button
                type="button"
                className="doc-icon size-7"
                aria-label={`Cô lập cấu kiện mã ${code.ma}`}
                disabled={!!busy}
                onClick={() => run(code.ma + ':isolate', async () => onIsolate(group(await elementsOf(code.ma))))}
              >
                {busy === code.ma + ':isolate' ? <Loader2 size={13} className="animate-spin" /> : <Focus size={13} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
