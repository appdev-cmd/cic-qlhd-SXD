import type { Dossier, Fact, Finding } from '../../../../types/appraisal';
import { toast } from '../../../../components/ui/Toast';
import type { AppraisalCase } from '../../../../hooks/useAppraisalCase';
import type { FindingDecision } from '../tabs/FindingsTab';
import { FactReviewModal } from './FactReviewModal';
import { FindingReviewModal } from './FindingReviewModal';
import { RequirementModal } from './RequirementModal';
import { AddRequirementModal, ConsultationModal, FinalReviewModal, ReopenModal } from './CaseActionModals';

export type CaseModal =
  | { type: 'fact'; fact: Fact }
  | { type: 'finding'; finding: Finding; decision: FindingDecision; note?: string }
  | { type: 'requirement'; requirement: Dossier['requirements'][number] }
  | { type: 'add' }
  | { type: 'consultation' }
  | { type: 'final' }
  | { type: 'reopen' };

/** Renders the open review dialog and maps its form onto the matching case mutation. */
export function CaseModals({ c, modal, onClose }: { c: AppraisalCase; modal: CaseModal; onClose: () => void }) {
  const save =
    <B extends object>(path: string, message: string, method = 'POST') =>
    (body: B) =>
      c.action(async () => {
        await c.mutate(path, body, method);
        onClose();
        toast.success(message);
      });
  const dialog = { busy: c.busy, error: c.error, onClose };
  switch (modal.type) {
    case 'fact':
      return (
        <FactReviewModal
          fact={modal.fact}
          {...dialog}
          onSubmit={save('/facts/' + modal.fact.id, 'Đã lưu xác nhận dữ liệu', 'PATCH')}
        />
      );
    case 'finding':
      return (
        <FindingReviewModal
          finding={modal.finding}
          decision={modal.decision}
          note={modal.note}
          {...dialog}
          onSubmit={save('/findings/' + modal.finding.id, 'Đã lưu đánh giá đề xuất', 'PATCH')}
        />
      );
    case 'requirement':
      return (
        <RequirementModal
          requirement={modal.requirement}
          {...dialog}
          onSubmit={save('/requirements/' + modal.requirement.id, 'Đã lưu kết quả kiểm tra thành phần', 'PATCH')}
        />
      );
    case 'add':
      return <AddRequirementModal {...dialog} onSubmit={save('/requirements', 'Đã thêm thành phần hồ sơ')} />;
    case 'consultation':
      return <ConsultationModal {...dialog} onSubmit={save('/consultations', 'Đã ghi ý kiến')} />;
    case 'final':
      return <FinalReviewModal {...dialog} onSubmit={save('/final-review', 'Đã lưu kết quả rà soát nội bộ')} />;
    case 'reopen':
      return <ReopenModal {...dialog} onSubmit={save('/reopen', 'Đã mở lại hồ sơ để rà soát')} />;
  }
}
