import { cn } from '../../lib/utils';

export type StatusType =
  | 'tiep_nhan'
  | 'dang_tham_dinh'
  | 'yeu_cau_bo_sung'
  | 'da_tham_dinh'
  | 'qua_han'
  | 'tra_ho_so'
  | 'hieu_luc'
  | 'sap_het_han'
  | 'het_han';

const STATUS_CONFIG: Record<
  StatusType,
  { label: string; badgeCls: string; dotCls: string }
> = {
  tiep_nhan: {
    label: 'Mới tiếp nhận',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg--950 dark:text-blue-300 dark:border-blue-800',
    dotCls: 'bg-blue-500',
  },
  dang_tham_dinh: {
    label: 'Đang thẩm định',
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg--950 dark:text-amber-300 dark:border-amber-800',
    dotCls: 'bg-amber-500',
  },
  yeu_cau_bo_sung: {
    label: 'Yêu cầu bổ sung',
    badgeCls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg--950 dark:text-purple-300 dark:border-purple-800',
    dotCls: 'bg-purple-500',
  },
  da_tham_dinh: {
    label: 'Đã có kết quả',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg--950 dark:text-emerald-300 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },
  qua_han: {
    label: 'Quá hạn SLA',
    badgeCls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg--950 dark:text-rose-300 dark:border-rose-800',
    dotCls: 'bg-rose-500',
  },
  tra_ho_so: {
    label: 'Đã trả hồ sơ',
    badgeCls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dotCls: 'bg-slate-500',
  },
  hieu_luc: {
    label: 'Còn hiệu lực',
    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg--950 dark:text-emerald-300 dark:border-emerald-800',
    dotCls: 'bg-emerald-500',
  },
  sap_het_han: {
    label: 'Sắp hết hạn (<90d)',
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg--950 dark:text-amber-300 dark:border-amber-800',
    dotCls: 'bg-amber-500',
  },
  het_han: {
    label: 'Đã hết hạn',
    badgeCls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg--950 dark:text-rose-300 dark:border-rose-800',
    dotCls: 'bg-rose-500',
  },
};

/** Nhãn tiếng Việt cho mọi mã trạng thái / giai đoạn (dùng trong lịch sử thay đổi, xuất Excel). */
export const STATUS_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])),
  bcnckt: 'Thẩm định BCNCKT',
  gpxd: 'Cấp Giấy phép XD',
  nghiem_thu: 'Kiểm tra nghiệm thu',
  hoan_thanh: 'Hoàn thành',
  dat: 'Đạt',
  can_bo_sung: 'Cần bổ sung',
  cho_y_kien_ca: 'Chờ ý kiến Công an',
  dau_tu_cong: 'Đầu tư công',
  ppp: 'Đối tác PPP',
  kinh_doanh: 'Kinh doanh (Phụ lục IV)',
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusType | string;
  label?: string;
  className?: string;
}) {
  const config =
    STATUS_CONFIG[status as StatusType] || {
      label: label || status,
      badgeCls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      dotCls: 'bg-slate-400',
    };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-semibold border transition-colors',
        config.badgeCls,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dotCls)} />
      {label || config.label}
    </span>
  );
}
