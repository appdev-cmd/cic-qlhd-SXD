import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AdminDocumentView } from './AdminDocumentView';
import { buildGpxd, buildMau03, buildYeuCauBoSung } from '../../lib/documents/templates';
import { downloadDocx } from '../../lib/documents/docx';
import { todayIso } from '../../lib/sla';
import { formatAdminDate } from '../../lib/documents/model';
import type { Project } from '../../types/domain';
import type { ProjectAppraisalData } from '../../types/appraisal';

export type DocumentTemplate = 'mau_03' | 'gpxd' | 'yeu_cau_bo_sung' | 'mau_14';

export const DOCUMENT_TEMPLATE_LABELS: Record<DocumentTemplate, string> = {
  mau_03: 'Mẫu số 03 — Thông báo kết quả thẩm định',
  gpxd: 'Giấy phép xây dựng',
  yeu_cau_bo_sung: 'Văn bản yêu cầu bổ sung hồ sơ',
  mau_14: 'Mẫu số 14 — Dấu thẩm định bản vẽ',
};

export function ProjectDocumentPreview({
  project,
  appraisal,
  template,
}: {
  project: Project;
  appraisal: ProjectAppraisalData | null;
  template: DocumentTemplate;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const today = todayIso();

  const doc = useMemo(() => {
    if (template === 'gpxd') return buildGpxd(project, appraisal, today);
    if (template === 'yeu_cau_bo_sung') {
      const missing = appraisal?.permit.checklistDocs.filter((d) => d.status !== 'hop_le').map((d) => `${d.name}: ${d.note}`) ?? [];
      return buildYeuCauBoSung(project, missing, today);
    }
    return buildMau03(project, appraisal, today);
  }, [template, project, appraisal, today]);

  if (template === 'mau_14') {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-surface rounded-2xl border border-border shadow-card space-y-4 dark:bg-slate-900 dark:border-slate-800">
        <h4 className="text-sm font-bold text-ink uppercase">Mẫu số 14: Dấu xác nhận thẩm định trên bản vẽ</h4>
        <p className="text-xs text-ink-muted text-center max-w-md">
          Dấu được đóng vào khung tên từng trang bản vẽ thiết kế cơ sở đã thẩm định (NĐ 217/2026/NĐ-CP). Đóng dấu điện tử lên PDF
          bản vẽ sẽ triển khai cùng chức năng ký số.
        </p>
        <div
          className="w-80 p-4 border-2 border-dashed border-rose-600 rounded-xl bg-white text-rose-700 text-center space-y-1"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          <p className="font-bold text-xs uppercase">Sở Xây dựng tỉnh Điện Biên</p>
          <p className="font-bold text-sm uppercase">Đã thẩm định thiết kế cơ sở</p>
          <p className="text-2xs">
            Kèm theo Thông báo số: <strong>{appraisal?.sample03Notice.docNumber ?? '[....]'}</strong>
          </p>
          <p className="text-2xs">Hồ sơ: {project.code}</p>
          <p className="text-2xs italic">{formatAdminDate('Điện Biên', today)}</p>
          <div className="pt-2 border-t border-rose-300 flex items-center justify-center gap-1 font-bold text-2xs">
            <CheckCircle2 size={13} />
            <span>{project.workflowState === 'da_phat_hanh' ? 'ĐÃ KÝ SỐ' : 'CHỜ KÝ SỐ'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminDocumentView
      doc={doc}
      isExporting={isExporting}
      onExportDocx={async () => {
        setIsExporting(true);
        try {
          await downloadDocx(doc, `${project.code}-${template}`);
        } finally {
          setIsExporting(false);
        }
      }}
    />
  );
}
