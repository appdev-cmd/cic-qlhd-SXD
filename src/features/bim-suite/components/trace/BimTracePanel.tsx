import { formatNumber, formatDateTime } from '@/lib/utils';
// MEP system trace: select an element -> colour the supply side (upstream) and the receiving side (downstream);
// "what if it fails": affected floors downstream (operational assets come with facility management, phase B7).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Eye, Focus, Network } from 'lucide-react';
import type { BimColorGroup, BimSelectedElement, BimViewerRef } from '../../viewer/types';
import { BimTraceService, type TraceResult } from '../../services/BimTraceService';
import { getIfcLabel } from '../../lib/ifcLabels';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const btn =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
/** Ba vai trò, ba ô màu phân loại đầu tiên (đã kiểm định); luôn kèm chú giải chữ. */
export const TRACE_COLORS = { thuong: '#2a78d6', ha: '#eb6834', lien_ke: '#1baf7a', he_thong: '#6250d6' } as const;

export const BimTracePanel: React.FC<{
  viewerRef: React.RefObject<BimViewerRef | null>;
  selection: BimSelectedElement | null;
  className?: string;
}> = ({ viewerRef, selection, className = '' }) => {
  const modelId = selection?.modelId ?? null;
  const guid = selection?.guid ?? null;
  const net = useQuery({
    queryKey: ['bim-mang-ket-noi', modelId],
    queryFn: () => BimTraceService.network(modelId!),
    enabled: !!modelId,
    retry: false,
  });
  const trace = useQuery({
    queryKey: ['bim-truy-vet', modelId, guid],
    queryFn: () => BimTraceService.trace(modelId!, guid!),
    enabled: !!modelId && !!guid && (net.data?.ket_noi ?? 0) > 0,
    retry: false,
  });
  const [system, setSystem] = useState<string | null>(null);
  const [isolated, setIsolated] = useState(false);
  const colored = useRef(false);
  const r: TraceResult | undefined = trace.data;

  // Tô màu: thượng nguồn, hạ nguồn, liền kề; hoặc toàn bộ một hệ thống khi chọn hệ thống
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelId) return;
    let cancelled = false;
    void (async () => {
      const groups: BimColorGroup[] = [];
      const add = async (guids: string[], color: string) => {
        const ids = (await viewer.mapGuidsToIds(modelId, guids)).filter((x): x is number => x !== null);
        if (ids.length) groups.push({ modelId, color, ids });
        return ids;
      };
      const all: number[] = [];
      if (system) all.push(...(await add(await BimTraceService.systemMembers(modelId, system), TRACE_COLORS.he_thong)));
      else if (r) {
        all.push(
          ...(await add(
            r.thuong_nguon.map((n) => n.guid),
            TRACE_COLORS.thuong,
          )),
        );
        all.push(
          ...(await add(
            r.ha_nguon.map((n) => n.guid),
            TRACE_COLORS.ha,
          )),
        );
        all.push(...(await add(r.lien_ke, TRACE_COLORS.lien_ke)));
      }
      if (cancelled) return;
      // Cô lập trước rồi mới tô: áp lại trạng thái hiển thị làm mất màu đã tô
      if (isolated && all.length) {
        const self = selection?.expressId != null ? [selection.expressId] : [];
        await viewer.isolateElements(modelId, [...all, ...self]);
      }
      if (!groups.length && !colored.current) return;
      colored.current = groups.length > 0;
      await viewer.colorize(groups.length ? groups : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [r, system, isolated, modelId, viewerRef, selection?.expressId]);
  useEffect(
    () => () => {
      if (colored.current) void viewerRef.current?.colorize(null);
    },
    [viewerRef],
  );

  const showAll = async () => {
    setIsolated(false);
    await viewerRef.current?.showAll();
  };
  const floors = useMemo(() => [...(r?.anh_huong.tang ?? [])].sort((a, b) => b.so_cau_kien - a.so_cau_kien), [r]);
  const error = net.error ?? trace.error;

  return (
    <div
      className={`flex flex-col gap-2 overflow-y-auto p-2 text-xs text-slate-700 dark:text-slate-200 ${className}`}
      aria-label="Truy vết hệ thống MEP"
    >
      <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
        <Network className="h-4 w-4 text-primary-600" aria-hidden /> Truy vết hệ thống MEP
      </div>
      {error && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {errorText(error)}
        </p>
      )}
      {!selection?.guid && (
        <p className="text-2xs text-slate-500">
          Chọn một thiết bị, ống hoặc đầu cuối trên mô hình để truy vết phía cấp và phía nhận.
        </p>
      )}
      {net.isSuccess && net.data.ket_noi === 0 && (
        <p className="rounded-xl border border-slate-200 p-2 text-2xs text-slate-600 dark:border-slate-700">
          Mô hình này chưa có mạng kết nối: IFC không khai báo cổng nối (IfcDistributionPort, IfcRelConnectsPorts). Nạp
          lại IFC có cổng để truy vết.
        </p>
      )}
      {net.data && net.data.ket_noi > 0 && (
        <section className="rounded-xl border border-slate-200 p-2 dark:border-slate-700" aria-label="Hệ thống">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold">
              {net.data.he_thong.length} hệ thống · {formatNumber(net.data.ket_noi, 2)} kết nối
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {net.data.he_thong.map((s) => (
              <button
                key={s.guid}
                type="button"
                aria-pressed={system === s.guid}
                className={`${btn} ${system === s.guid ? 'border-violet-400 bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200' : ''}`}
                onClick={() => setSystem(system === s.guid ? null : s.guid)}
              >
                {s.ten ?? s.guid} <span className="font-normal text-slate-500">{s.so_thanh_vien}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {r && !system && (
        <>
          <section
            className="space-y-1 rounded-xl border border-slate-200 p-2 dark:border-slate-700"
            aria-label="Kết quả truy vết"
          >
            <p className="truncate font-semibold">
              {selection?.name ?? r.goc}{' '}
              <span className="font-normal text-slate-500">· {getIfcLabel(selection?.category ?? '')}</span>
            </p>
            {r.he_thong.length > 0 && (
              <p className="text-2xs text-slate-500">Thuộc: {r.he_thong.map((s) => s.ten).join(', ')}</p>
            )}
            <ul className="space-y-0.5 text-2xs" aria-label="Chú giải truy vết">
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm" style={{ background: TRACE_COLORS.thuong }} aria-hidden /> Phía cấp
                (thượng nguồn): <b className="tabular-nums">{r.thuong_nguon.length}</b> cấu kiện
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-sm" style={{ background: TRACE_COLORS.ha }} aria-hidden /> Phía nhận
                (hạ nguồn): <b className="tabular-nums">{r.ha_nguon.length}</b> cấu kiện
              </li>
              {r.lien_ke.length > 0 && (
                <li className="flex items-center gap-1.5">
                  <span className="h-3 w-4 rounded-sm" style={{ background: TRACE_COLORS.lien_ke }} aria-hidden /> Nối
                  hai chiều: <b className="tabular-nums">{r.lien_ke.length}</b>
                </li>
              )}
            </ul>
            {r.gioi_han && (
              <p className="text-2xs text-amber-700 dark:text-amber-300">
                Đã dừng ở độ sâu tối đa; mạng có thể còn tiếp.
              </p>
            )}
            {!r.thuong_nguon.length && !r.ha_nguon.length && !r.lien_ke.length && (
              <p className="text-2xs text-slate-500">Cấu kiện này không nối với cấu kiện nào.</p>
            )}
            <div className="flex gap-1 pt-1">
              <button
                type="button"
                className={btn}
                onClick={() => setIsolated(true)}
                disabled={!r.thuong_nguon.length && !r.ha_nguon.length}
              >
                <Focus className="h-3 w-3" aria-hidden /> Chỉ hiện mạng
              </button>
              <button type="button" className={btn} onClick={() => void showAll()}>
                <Eye className="h-3 w-3" aria-hidden /> Hiện tất cả
              </button>
            </div>
          </section>

          <section
            className="space-y-1 rounded-xl border border-slate-200 p-2 dark:border-slate-700"
            aria-label="Ảnh hưởng nếu hỏng"
          >
            <div className="flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Nếu hỏng thì ảnh hưởng gì
            </div>
            <p className="text-2xs">
              {r.ha_nguon.length
                ? `${r.ha_nguon.length} cấu kiện trên ${floors.length} tầng mất cấp.`
                : 'Không có cấu kiện nào phía nhận.'}
            </p>
            {floors.length > 0 && (
              <ul className="max-h-28 space-y-0.5 overflow-y-auto text-2xs">
                {floors.slice(0, 12).map((f) => (
                  <li key={f.tang ?? '-'} className="flex justify-between gap-2">
                    <span className="truncate">{f.tang ?? 'chưa rõ tầng'}</span>
                    <span className="tabular-nums text-slate-500">{f.so_cau_kien}</span>
                  </li>
                ))}
                {floors.length > 12 && <li className="text-slate-500">… và {floors.length - 12} tầng khác</li>}
              </ul>
            )}
          </section>
        </>
      )}
      {trace.isFetching && (
        <p role="status" className="text-2xs text-slate-500">
          Đang truy vết…
        </p>
      )}
    </div>
  );
};
