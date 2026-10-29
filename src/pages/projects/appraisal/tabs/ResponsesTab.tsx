import { Plus } from 'lucide-react';
import type { Dossier } from '../../../../types/appraisal';
import { Button } from '../../../../components/ui/Button';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { formatDateTime } from '../../../../lib/utils';

/** Ý kiến và giải trình: consultation notes and the investor's responses. */
export function ResponsesTab({ d, onAdd }: { d: Dossier; onAdd: () => void }) {
  return (
    <div className="space-y-4">
      <Button leftIcon={<Plus size={14} />} onClick={onAdd}>
        Ghi ý kiến hoặc giải trình
      </Button>
      {d.consultations.map((c) => (
        <article
          key={c.id}
          className="space-y-2 rounded-2xl border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 p-4"
        >
          <p className="font-medium">{c.text}</p>
          <p className="text-sm">{c.response || 'Chưa có giải trình.'}</p>
          <p className="text-xs text-ink-muted dark:text-slate-400">
            {c.actor} · {formatDateTime(c.at)}
          </p>
        </article>
      ))}
      {!d.consultations.length && (
        <EmptyState
          title="Chưa ghi nhận ý kiến"
          description="Tài liệu sửa được nộp thành phiên bản mới tại Hồ sơ đầu vào."
          className="py-10"
        />
      )}
    </div>
  );
}
