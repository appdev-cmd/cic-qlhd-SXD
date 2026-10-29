// Hồ sơ trao đổi trên bim_issues (migration 20261023100000): vướng mắc thường và RFI / RFA / RFP / NCR có số hiệu tự sinh.
import type { BimRecordType } from '@/features/bim-suite/types/bim.types';

export const RECORD_TYPE_LABELS: Record<BimRecordType, string> = {
  vuong_mac: 'Vướng mắc',
  rfi: 'RFI · Yêu cầu thông tin',
  rfa: 'RFA · Đề nghị phê duyệt',
  rfp: 'RFP · Đề nghị báo giá',
  ncr: 'NCR · Báo cáo không phù hợp',
};

/** Hồ sơ cần bên nhận trả lời (khác vướng mắc thường). */
export const needsReply = (type?: BimRecordType | null) => !!type && type !== 'vuong_mac';
