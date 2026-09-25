import { FlaskConical } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';

/**
 * Gắn nhãn nội dung AI đang là dữ liệu minh họa (chưa kết nối mô hình / kho tri thức thật)
 * — theo nguyên tắc minh bạch của Luật AI 2025.
 */
export function AiDemoBadge({ label = 'AI minh họa' }: { label?: string }) {
  return (
    <Tooltip
      content="Nội dung do bộ sinh dữ liệu mẫu tạo ra, chưa phải kết quả phân tích của mô hình AI. Không dùng làm căn cứ pháp lý."
      placement="bottom"
    >
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-3xs font-bold uppercase tracking-wide dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <FlaskConical size={10} />
        {label}
      </span>
    </Tooltip>
  );
}
