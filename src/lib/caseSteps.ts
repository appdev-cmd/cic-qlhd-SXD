import type { Dossier } from '../types/appraisal';

export interface CaseStep {
  id: string;
  label: string;
  help?: string;
}

export interface CaseProgress {
  steps: CaseStep[];
  /** Bước đang làm. */
  current: string;
  /** Mọi bước đã xong (hồ sơ đã ban hành / lưu trữ). */
  completed: boolean;
  /** Bước bị chặn (từ chối tiếp nhận, dừng xử lý). */
  blockedAt?: string;
  /** Ghi chú trạng thái chờ ở bước hiện tại (chờ bổ sung, tạm dừng…). */
  waiting?: string;
}

type Procedure = 'bcnckt' | 'gpxd' | 'nghiem_thu';

const STEPS: Record<Procedure, CaseStep[]> = {
  bcnckt: [
    { id: 'intake', label: 'Tiếp nhận' },
    { id: 'validity', label: 'Kiểm tra hợp lệ', help: 'Kiểm tra hồ sơ ≤05 ngày làm việc; bổ sung một lần (Mẫu 15)' },
    { id: 'review', label: 'Thẩm định', help: 'Phiếu 4 nhóm nội dung theo Điều 38 NĐ 217/2026' },
    { id: 'submit', label: 'Trình rà soát' },
    { id: 'done', label: 'Thông báo kết quả', help: 'Mẫu 03 — 3 mức kết luận' },
    { id: 'stamp', label: 'Đóng dấu & lưu trữ', help: 'Mẫu 14; lưu trữ theo khoản 9 Điều 36' },
  ],
  gpxd: [
    { id: 'intake', label: 'Tiếp nhận' },
    { id: 'validity', label: 'Kiểm tra hồ sơ', help: 'Bổ sung hồ sơ một lần' },
    { id: 'review', label: 'Thẩm định, lấy ý kiến', help: 'Cơ quan được hỏi trả lời trong 02 ngày làm việc' },
    { id: 'submit', label: 'Trình rà soát' },
    { id: 'done', label: 'Hoàn tất rà soát' },
    { id: 'issue', label: 'Cấp giấy phép', help: 'Nội dung giấy phép theo Điều 49; sổ công khai Điều 66' },
  ],
  nghiem_thu: [
    { id: 'intake', label: 'Tiếp nhận' },
    { id: 'validity', label: 'Kiểm tra hồ sơ' },
    { id: 'review', label: 'Xem xét hồ sơ' },
    { id: 'site', label: 'Kiểm tra hiện trường', help: 'Theo dõi khắc phục tồn tại nếu có' },
    { id: 'submit', label: 'Trình rà soát' },
    { id: 'done', label: 'Thông báo kết quả', help: 'Phụ lục VIII NĐ 207/2026' },
  ],
};

export function caseState(d: Pick<Dossier, 'workflow' | 'finalReview'>): string {
  return d.workflow?.state || (d.finalReview?.decision === 'reviewed' ? 'reviewed' : 'received');
}

/** Tiến trình theo các bước pháp lý của thủ tục, suy ra từ `workflow.state` (nguồn trạng thái duy nhất). */
export function caseProgress(
  d: Pick<Dossier, 'procedure' | 'workflow' | 'finalReview' | 'stamping' | 'permit'>,
): CaseProgress {
  const procedure = (d.procedure || 'bcnckt') as Procedure;
  const steps = STEPS[procedure] || STEPS.bcnckt;
  const state = caseState(d);
  const last = steps[steps.length - 1].id;
  const base = { steps, completed: false };
  switch (state) {
    case 'received':
    case 'assigned':
      return { ...base, current: 'validity' };
    case 'awaiting_supplement':
      // BCNCKT: the single supplement request belongs to the intake check (Mẫu 15).
      return { ...base, current: procedure === 'bcnckt' ? 'validity' : 'review', waiting: 'Chờ bổ sung hồ sơ' };
    case 'suspended':
      return { ...base, current: 'review', waiting: 'Tạm dừng thẩm định' };
    case 'processing':
      return { ...base, current: 'review' };
    case 'site_visit':
      return { ...base, current: procedure === 'nghiem_thu' ? 'site' : 'review' };
    case 'correction':
      return { ...base, current: procedure === 'nghiem_thu' ? 'site' : 'review', waiting: 'Theo dõi khắc phục' };
    case 'pending_review':
      return { ...base, current: 'submit' };
    case 'rejected':
      return { ...base, current: 'validity', blockedAt: 'validity', waiting: 'Từ chối tiếp nhận' };
    case 'stopped':
      return { ...base, current: 'review', blockedAt: 'review', waiting: 'Dừng xử lý' };
    case 'reviewed': {
      if (procedure === 'bcnckt') {
        const stamp = d.stamping?.status;
        if (stamp === 'archived') return { ...base, current: last, completed: true };
        return stamp && stamp !== 'not_started'
          ? { ...base, current: 'stamp', waiting: stamp === 'stamped' ? 'Chờ bản chụp PDF' : undefined }
          : { ...base, current: 'stamp' };
      }
      if (procedure === 'gpxd')
        return d.permit?.number ? { ...base, current: last, completed: true } : { ...base, current: 'issue' };
      return { ...base, current: last, completed: true };
    }
    default:
      return { ...base, current: 'validity' };
  }
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/** Việc cần xong trước khi trình lãnh đạo rà soát (phản ánh điều kiện mà Worker kiểm tra khi trình). */
export function preSubmitChecklist(
  d: Pick<Dossier, 'procedure' | 'documents' | 'runs' | 'facts' | 'appraisalSheet' | 'procedureReview'>,
): ChecklistItem[] {
  const procedure = d.procedure || 'bcnckt';
  const hasInput = d.documents.some((doc) => doc.role === 'submission');
  const items: ChecklistItem[] = [{ id: 'documents', label: 'Có tài liệu đầu vào', done: hasInput }];
  if (procedure === 'bcnckt') {
    const run = d.runs[d.runs.length - 1];
    const active = new Set(d.documents.map((doc) => doc.id));
    items.push(
      { id: 'analysis', label: 'Đã chạy kiểm tra, kết quả còn hiệu lực', done: !!run && !run.stale },
      {
        id: 'facts',
        label: 'Dữ liệu trích xuất đã được xác nhận',
        done: !d.facts.some((f) => active.has(f.documentId) && f.reviewStatus === 'pending'),
      },
      {
        id: 'findings',
        label: 'Các nội dung cần làm rõ đã được đánh giá',
        done: !!run && run.findings.every((f) => f.result === 'consistent' || !!f.review?.decision),
      },
      {
        id: 'sheet',
        label: 'Phiếu thẩm định đã có kết luận',
        done: !!d.appraisalSheet?.conclusion && d.appraisalSheet.conclusion !== 'pending',
      },
    );
  } else {
    items.push({
      id: 'review',
      label: 'Phiếu chuyên môn đã có kết luận',
      done: !!d.procedureReview?.conclusion,
    });
  }
  return items;
}
