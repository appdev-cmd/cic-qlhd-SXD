import React from 'react';
import { AlertCircle, RefreshCw, WifiOff, ServerCrash, FileWarning } from 'lucide-react';

export interface ErrorMessageProps {
  error: Error | string | null;
  onRetry?: () => void;
  variant?: 'inline' | 'card' | 'fullPage';
  title?: string;
}

/** Classify the error and pick an icon / friendly Vietnamese message. */
const getErrorDetails = (
  error: Error | string | null,
): {
  icon: React.ReactNode;
  title: string;
  message: string;
} => {
  const errorMessage = typeof error === 'string' ? error : error?.message || 'Đã xảy ra lỗi';
  const lower = errorMessage.toLowerCase();

  if (lower.includes('network') || lower.includes('fetch')) {
    return {
      icon: <WifiOff className="w-8 h-8 text-warning-500 dark:text-warning-400" />,
      title: 'Lỗi kết nối',
      message: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.',
    };
  }

  if (lower.includes('500') || lower.includes('server')) {
    return {
      icon: <ServerCrash className="w-8 h-8 text-danger-500 dark:text-danger-400" />,
      title: 'Lỗi máy chủ',
      message: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
    };
  }

  if (lower.includes('404') || lower.includes('not found')) {
    return {
      icon: <FileWarning className="w-8 h-8 text-warning-500 dark:text-warning-400" />,
      title: 'Không tìm thấy',
      message: 'Dữ liệu yêu cầu không tồn tại hoặc đã bị xóa.',
    };
  }

  return {
    icon: <AlertCircle className="w-8 h-8 text-danger-500 dark:text-danger-400" />,
    title: 'Đã xảy ra lỗi',
    message: errorMessage,
  };
};

/** Reusable error message (inline / card / full page). */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error, onRetry, variant = 'card', title: customTitle }) => {
  if (!error) return null;

  const { icon, title, message } = getErrorDetails(error);
  const displayTitle = customTitle || title;

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 text-sm text-danger-600 dark:text-danger-400" role="alert">
        <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span>{message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="font-medium hover:underline text-danger-700 dark:text-danger-300"
          >
            Thử lại
          </button>
        )}
      </div>
    );
  }

  if (variant === 'fullPage') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8" role="alert">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-danger-100 dark:bg-danger-900">
            {icon}
          </div>
          <h2 className="text-2xl font-bold mb-3 text-txt-primary dark:text-slate-100">{displayTitle}</h2>
          <p className="mb-6 text-txt-muted dark:text-slate-400">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors bg-primary-500 text-white hover:bg-primary-600 dark:bg-primary-600 dark:text-white dark:hover:bg-primary-500"
            >
              <RefreshCw className="w-5 h-5" aria-hidden="true" />
              Thử lại
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-6 border bg-danger-50 border-danger-100 dark:bg-slate-900 dark:border-danger-800"
      role="alert"
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-danger-100 dark:bg-danger-900">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold mb-1 text-danger-800 dark:text-danger-300">{displayTitle}</h3>
          <p className="text-sm text-danger-600 dark:text-danger-400">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-danger-500 text-white hover:bg-danger-600 dark:bg-danger-600 dark:text-white dark:hover:bg-danger-500"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Thử lại
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;
