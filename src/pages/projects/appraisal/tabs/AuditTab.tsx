import type { Dossier } from '../../../../types/appraisal';
import { DossierGrid } from '../../../../components/appraisal/DossierGrid';
import { formatDateTime } from '../../../../lib/utils';

/** Lịch sử: audit trail of the submission (actors are already resolved to names by the API). */
export function AuditTab({ d }: { d: Dossier }) {
  return (
    <DossierGrid
      storageKey="appraisal-audit"
      rows={d.audit}
      columns={[
        { label: 'Thời gian', value: (r) => r.at, render: (r) => formatDateTime(r.at), width: 170 },
        { label: 'Người thực hiện', value: (r) => r.actor, width: 180 },
        { label: 'Thao tác', value: (r) => r.action, width: 210 },
        { label: 'Chi tiết', value: (r) => r.detail, width: 450 },
      ]}
    />
  );
}
