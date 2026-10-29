import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BookOpen, EyeOff, ListChecks, ListTree, Rocket, Search, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { PROJECT_PROCEDURES } from '../../lib/projectProcedures';
import { HELP_ANCHORS, helpHref } from '../../lib/helpAnchors';

const HIDDEN_KEY = 'buildappraisal:quickstart-hidden';

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Opens the app-wide quick search: AppLayout listens for Ctrl+K on window. */
function openQuickSearch() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
}

interface Step {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  text: React.ReactNode;
  action: string;
  run: () => void;
}

/**
 * Thẻ "Bắt đầu nhanh" ở đầu Dashboard cho người mới: 5 bước làm quen, mỗi bước có nút tới đúng trang
 * hoặc thao tác. Bấm "Ẩn" để tắt (nhớ trong trình duyệt này).
 */
export function QuickStart() {
  const [hidden, setHidden] = useState(readHidden);
  const navigate = useNavigate();
  if (hidden) return null;

  const hide = () => {
    try {
      localStorage.setItem(HIDDEN_KEY, '1');
    } catch {
      // only hidden for this visit
    }
    setHidden(true);
  };

  const steps: Step[] = [
    {
      icon: Search,
      title: 'Tìm hồ sơ bằng Ctrl+K',
      text: (
        <>
          Gõ mã hồ sơ, tên dự án hoặc tên trang; gõ không dấu được. Phím <Kbd>/</Kbd> cũng mở ô tìm nhanh.
        </>
      ),
      action: 'Mở tìm nhanh',
      run: openQuickSearch,
    },
    {
      icon: ListTree,
      title: 'Mở danh sách theo nghiệp vụ',
      text: 'Menu Hồ sơ nghiệp vụ chia BCNCKT, GPXD, Nghiệm thu. Tab “Chờ tôi xử lý” gom việc của anh/chị.',
      action: 'Hồ sơ chờ tôi xử lý',
      run: () => navigate(PROJECT_PROCEDURES.bcnckt.path + '?scope=queue'),
    },
    {
      icon: ListChecks,
      title: 'Đọc thanh tiến trình hồ sơ',
      text: 'Đầu mỗi hồ sơ có các bước của thủ tục và danh sách “Việc cần xong trước khi trình rà soát”.',
      action: 'Xem cách đọc',
      run: () => navigate(helpHref(HELP_ANCHORS.progress)),
    },
    {
      icon: Sparkles,
      title: 'Xử lý thẻ đề xuất',
      text: 'Tab Nội dung thẩm định: đọc chứng cứ rồi bấm Chấp nhận, Sửa / ghi chú hoặc Bỏ qua trên từng thẻ.',
      action: 'Xem cách làm',
      run: () => navigate(helpHref(HELP_ANCHORS.findings)),
    },
    {
      icon: Bell,
      title: 'Xem chuông hạn',
      text: 'Chuông trên thanh trên cùng đếm hồ sơ quá hạn, sắp đến hạn. Bấm một dòng để mở danh sách.',
      action: 'Hồ sơ quá hạn',
      run: () => navigate(PROJECT_PROCEDURES.bcnckt.path + '?sla=overdue'),
    },
  ];

  return (
    <section
      aria-labelledby="quickstart-title"
      className="rounded-2xl border border-primary-200 dark:border-slate-700 bg-surface dark:bg-slate-900 p-5 shadow-card"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-lg bg-primary-50 dark:bg-primary-900 p-2 text-primary-600 dark:text-primary-300">
            <Rocket size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="quickstart-title" className="font-semibold text-ink dark:text-slate-100">
              Bắt đầu nhanh
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted dark:text-slate-400">
              5 bước làm quen hệ thống. Bấm “Ẩn” khi đã quen; mở lại hướng dẫn ở menu Hệ thống.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" leftIcon={<BookOpen size={15} />} onClick={() => navigate(helpHref())}>
            Hướng dẫn đầy đủ
          </Button>
          <Tooltip content="Ẩn thẻ này; mở lại hướng dẫn ở menu Hệ thống">
            <Button variant="ghost" size="sm" leftIcon={<EyeOff size={15} />} onClick={hide}>
              Ẩn
            </Button>
          </Tooltip>
        </div>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 dark:bg-primary-600 font-mono text-xs font-bold text-white dark:text-white">
                {index + 1}
              </span>
              <step.icon size={15} className="shrink-0 text-primary-600 dark:text-primary-300" />
              <h3 className="min-w-0 text-sm font-semibold leading-snug text-ink dark:text-slate-100">{step.title}</h3>
            </div>
            <p className="flex-1 text-xs leading-relaxed text-ink-secondary dark:text-slate-300">{step.text}</p>
            <Button variant="outline" size="xs" className="self-start" onClick={step.run}>
              {step.action}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border dark:border-slate-600 bg-surface dark:bg-slate-900 px-1 font-mono text-2xs text-ink dark:text-slate-100">
      {children}
    </kbd>
  );
}
