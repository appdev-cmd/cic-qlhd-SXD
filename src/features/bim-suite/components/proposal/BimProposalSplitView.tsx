// G3: hai phương án cạnh nhau trong hai khung 3D, camera đồng bộ.
import React, { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { BimViewer, type BimViewerRef } from '../BimViewer';
import { useBimModels } from '../../hooks/useBim';
import { BimProposalService } from '../../services/BimProposalService';

export const BimProposalSplitView: React.FC<{ projectId: string; ids: string[]; onClose: () => void }> = ({
  projectId,
  ids,
  onClose,
}) => {
  const left = useRef<BimViewerRef>(null);
  const right = useRef<BimViewerRef>(null);
  const syncing = useRef(false);
  const { data: models = [] } = useBimModels(projectId);
  const list = useQuery({
    queryKey: ['bim-proposals', projectId],
    queryFn: () => BimProposalService.list(projectId),
    retry: false,
  });
  const pair = useMemo(
    () =>
      ids
        .map((id) => list.data?.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .slice(0, 2),
    [ids, list.data],
  );
  const sideModels = pair.map((p) => models.filter((m) => p.model_ids.includes(m.id) && m.status === 'ready'));
  // Đồng bộ camera hai chiều, chặn vòng lặp phản hồi
  const sync = (to: React.RefObject<BimViewerRef | null>) => (pose: Parameters<BimViewerRef['setCameraPose']>[0]) => {
    if (syncing.current) return;
    syncing.current = true;
    to.current?.setCameraPose(pose);
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  if (list.isPending) return <div className="p-4 text-xs text-txt-muted">Đang tải phương án…</div>;
  if (pair.length < 2)
    return (
      <div className="p-4 text-xs text-amber-800">
        Không tìm thấy đủ hai phương án để so sánh.{' '}
        <button type="button" className="underline" onClick={onClose}>
          Quay lại
        </button>
      </div>
    );
  return (
    <div className="flex h-[calc(100dvh-170px)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
        <span className="font-semibold">So sánh phương án · camera đồng bộ</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 font-semibold dark:border-slate-600"
        >
          <X className="h-3 w-3" aria-hidden /> Thoát so sánh
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        {pair.map((p, i) => (
          <div key={p.id} className={`relative min-w-0 flex-1 ${i ? 'border-l-2 border-primary-400' : ''}`}>
            <BimViewer
              ref={i ? right : left}
              models={sideModels[i]}
              activeModel={sideModels[i][0] ?? null}
              onCameraChange={sync(i ? left : right)}
              onModelsLoaded={() => {
                const pose = (i ? left : right).current?.getCameraPose();
                if (pose) (i ? right : left).current?.setCameraPose(pose);
              }}
              className="h-full"
            />
            <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-slate-900/80 px-2 py-0.5 text-2xs font-semibold text-white shadow dark:bg-slate-900">
              {p.ten}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
