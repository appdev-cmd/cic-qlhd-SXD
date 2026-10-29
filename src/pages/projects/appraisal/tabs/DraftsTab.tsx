import { Download, FileJson, FileText, RotateCcw, ShieldCheck } from 'lucide-react';
import type { AppraisalRun, Dossier } from '../../../../types/appraisal';
import { appraisalService as api } from '../../../../services/appraisalService';
import { Button } from '../../../../components/ui/Button';
import { formatDateTime } from '../../../../lib/utils';
import type { AppraisalCase } from '../../../../hooks/useAppraisalCase';

const DRAFTS = [
  ['report', 'Báo cáo hỗ trợ kiểm tra'],
  ['supplement', 'Dự thảo bổ sung — Mẫu 15'],
  ['suspension', 'Dự thảo tạm dừng — Mẫu 16'],
  ['notice', 'Dự thảo kết quả — Mẫu 03'],
  ['decision', 'Khung quyết định — Mẫu 09'],
  ['stamp', 'Danh mục bản vẽ đóng dấu — Mẫu 14'],
] as const;

/** Dự thảo kết quả: A4 previews / exports of the draft forms, internal review and reopening. */
export function DraftsTab({
  c,
  d,
  run,
  onPreview,
  onFinalReview,
  onReopen,
}: {
  c: AppraisalCase;
  d: Dossier;
  run: AppraisalRun | undefined;
  onPreview: (url: string) => void;
  onFinalReview: () => void;
  onReopen: () => void;
}) {
  const exportsLocked = c.busy || !run || run.stale;
  const reviewer = c.health?.mode === 'demo' || ['head_of_department', 'director'].includes(c.health?.actor.role || '');
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Tài liệu được phân trang A4, có nguồn và nội dung chưa đủ dữ liệu. Các bản xuất đều là dự thảo chưa ký.
      </p>
      {DRAFTS.map(([kind, label]) => (
        <div
          key={kind}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 p-4"
        >
          <p className="text-sm font-medium">{label}</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="xs"
              leftIcon={<FileText size={12} />}
              disabled={exportsLocked}
              onClick={() =>
                c.action(async () =>
                  onPreview(URL.createObjectURL(await api.blob(`/cases/${d.id}/export/${kind}/pdf`))),
                )
              }
            >
              Xem A4
            </Button>
            {['pdf', 'docx'].map((format) => (
              <Button
                key={format}
                variant="secondary"
                size="xs"
                leftIcon={<Download size={12} />}
                disabled={exportsLocked}
                onClick={() =>
                  c.action(() => api.download(`/cases/${d.id}/export/${kind}/${format}`, `${kind}.${format}`))
                }
              >
                {format.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          leftIcon={<ShieldCheck size={15} />}
          disabled={c.busy || d.readOnly || !run || run.stale || !!d.finalReview || !reviewer}
          onClick={onFinalReview}
        >
          Rà soát nội bộ
        </Button>
        <Button
          variant="secondary"
          leftIcon={<FileJson size={15} />}
          onClick={() => c.action(() => api.download(`/cases/${d.id}/export/report/json`, 'ho-so-va-ket-qua.json'))}
        >
          Tải dữ liệu và nguồn JSON
        </Button>
      </div>
      {!d.readOnly && d.finalReview && reviewer && (
        <Button variant="secondary" leftIcon={<RotateCcw size={15} />} onClick={onReopen}>
          Mở lại để rà soát
        </Button>
      )}
      {d.finalReview && (
        <p className="text-sm">
          {d.finalReview.note} · {d.finalReview.actor} · {formatDateTime(d.finalReview.at)}
        </p>
      )}
    </div>
  );
}
