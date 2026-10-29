import { ClipboardCheck, Database, FileStack, SearchCheck } from 'lucide-react';
import type { Dossier } from '../../../types/appraisal';
import { KpiTile } from '../../../components/ui/KpiTile';
import { activeDocumentIds } from './shared';

/** Four headline counters of the submission; each opens the tab that holds the details. */
export function CaseKpis({ d, onOpenTab }: { d: Dossier; onOpenTab: (tab: 'intake' | 'facts' | 'findings') => void }) {
  const run = d.runs.slice(-1)[0];
  const activeIds = activeDocumentIds(d);
  const submitted = d.requirements.filter((r) => r.status !== 'missing').length;
  const pendingFacts = d.facts.filter((f) => activeIds.has(f.documentId) && f.reviewStatus === 'pending').length;
  const unclear = run?.findings.filter((f) => f.result !== 'consistent').length;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label="Thành phần đã nộp"
        value={`${submitted}/${d.requirements.length}`}
        icon={<ClipboardCheck size={18} />}
        tone={submitted < d.requirements.length ? 'warning' : 'success'}
        onClick={() => onOpenTab('intake')}
      />
      <KpiTile
        label="Phiên bản tài liệu"
        value={d.documents.length}
        icon={<FileStack size={18} />}
        onClick={() => onOpenTab('intake')}
      />
      <KpiTile
        label="Dữ liệu chờ xác nhận"
        value={pendingFacts}
        icon={<Database size={18} />}
        tone={pendingFacts ? 'warning' : 'success'}
        onClick={() => onOpenTab('facts')}
      />
      <KpiTile
        label="Nội dung cần làm rõ"
        value={unclear ?? '—'}
        hint={unclear === undefined ? 'Chưa chạy kiểm tra' : undefined}
        icon={<SearchCheck size={18} />}
        tone={unclear === undefined ? 'default' : unclear ? 'danger' : 'success'}
        onClick={() => onOpenTab('findings')}
      />
    </div>
  );
}
