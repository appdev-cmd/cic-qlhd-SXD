import { FileSearch } from 'lucide-react';
import type { DossierDocument, SourceRef } from '../../../../types/appraisal';
import { ReviewModal } from '../../../../components/appraisal/ReviewModal';
import { Button } from '../../../../components/ui/Button';

const LIMIT = 100;

/** Quotes from the source documents behind a fact / finding, with a button to open the original file. */
export function EvidenceModal({
  refs,
  documents,
  onOpenOriginal,
  onClose,
}: {
  refs: SourceRef[];
  documents: DossierDocument[];
  onOpenOriginal: (documentId: string) => void;
  onClose: () => void;
}) {
  return (
    <ReviewModal heading="Bằng chứng từ tài liệu gốc" onClose={onClose}>
      <div className="space-y-4">
        {refs.slice(0, LIMIT).map((s, i) => (
          <article key={i} className="rounded-xl border border-border dark:border-slate-700 p-4">
            <div className="flex justify-between gap-3">
              <p className="text-xs text-ink-muted dark:text-slate-400">
                {documents.find((x) => x.id === s.documentId)?.name} · {s.locator}
              </p>
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<FileSearch size={12} />}
                onClick={() => onOpenOriginal(s.documentId)}
              >
                Bản gốc
              </Button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{s.quote}</p>
          </article>
        ))}
        {refs.length > LIMIT && <p>Hiển thị 100 đoạn đầu. Tải bản gốc để đọc toàn bộ tài liệu.</p>}
      </div>
    </ReviewModal>
  );
}
