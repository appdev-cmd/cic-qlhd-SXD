import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface AuthoritySuggestion {
  authority: string;
  label: string;
  inScope: boolean | null;
  basis: string[];
  reasons: string[];
  missing: string[];
  suggestion: 'accept' | 'confirm' | 'reject_intake' | 'redirect_start_notice';
  appendixIv?: { listed: boolean | null; item: string };
}

export interface ProcedurePolicy {
  version: string;
  resultForm?: string;
  limits: Record<string, { used: number; max: number | null; form?: string }>;
}

const LIMIT_LABELS: Record<string, string> = {
  request_supplement: 'Yêu cầu bổ sung',
  suspend: 'Tạm dừng thẩm định',
  extend: 'Gia hạn',
};
const SUGGESTIONS: Record<AuthoritySuggestion['suggestion'], string> = {
  accept: 'Thuộc thẩm quyền — tiếp nhận xử lý.',
  confirm: 'Cần xác nhận thêm thông tin trước khi kết luận thẩm quyền.',
  reject_intake: 'Có thể không thuộc thẩm quyền — xem xét từ chối tiếp nhận, nêu rõ lý do.',
  redirect_start_notice: 'Thuộc diện miễn giấy phép — hướng dẫn chủ đầu tư gửi thông báo khởi công.',
};

/** Suggested competent authority and procedural limits; the officer confirms, nothing is rejected automatically. */
export function ProcedureInfo({ authority, policy }: { authority?: AuthoritySuggestion; policy?: ProcedurePolicy }) {
  if (!authority) return null;
  const Icon = authority.inScope === true ? ShieldCheck : authority.inScope === false ? ShieldAlert : ShieldQuestion;
  const tone =
    authority.inScope === true
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-100'
      : authority.inScope === false
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100'
        : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  return (
    <div className="space-y-2">
      <div className={cn('rounded-lg border p-3 text-sm', tone)}>
        <p className="flex items-center gap-2 font-medium">
          <Icon size={16} /> Thẩm quyền đề xuất: {authority.label}
        </p>
        <p className="mt-1">{SUGGESTIONS[authority.suggestion]}</p>
        {authority.reasons.length > 0 && <p className="mt-1 text-xs">{authority.reasons.join(' ')}</p>}
        <p className="mt-1 text-xs">Căn cứ: {authority.basis.join('; ')}.</p>
        {authority.appendixIv?.item && (
          <p className="mt-1 text-xs">Phụ lục IV NĐ 217/2026: {authority.appendixIv.item}.</p>
        )}
        {authority.missing.length > 0 && (
          <p className="mt-1 text-xs">Cần bổ sung thông tin dự án: {authority.missing.join(', ')}.</p>
        )}
        <p className="mt-1 text-xs opacity-80">
          Đề xuất tự động từ dữ liệu dự án; chuyên viên xác nhận trước khi xử lý.
        </p>
      </div>
      {policy && Object.keys(policy.limits).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(policy.limits).map(([key, limit]) => (
            <span
              key={key}
              className="rounded-md border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 px-2 py-1 text-ink-secondary dark:text-slate-300"
            >
              {LIMIT_LABELS[key] || key}: {limit.used}/{limit.max ?? '∞'} lần{limit.form ? ' · ' + limit.form : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
