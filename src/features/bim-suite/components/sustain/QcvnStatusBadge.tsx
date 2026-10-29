import React from 'react';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { CHECK_LABELS, STATUS_COLOR, type CheckStatus } from '../../lib/qcvn043';

const ICON: Record<CheckStatus, React.ElementType> = { dat: CheckCircle2, khong_dat: XCircle, chua_co: CircleDashed };

/** Kết quả rà QCVN: biểu tượng + chữ + màu trạng thái. */
export const StatusBadge: React.FC<{ s: CheckStatus }> = ({ s }) => {
  const I = ICON[s];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold" style={{ color: STATUS_COLOR[s] }}>
      <I className="h-3.5 w-3.5" aria-hidden />
      {CHECK_LABELS[s]}
    </span>
  );
};
