import React, { type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Catches render errors in its subtree and shows a recoverable fallback. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // No error-reporting service in this project yet; log with the component stack.
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload(); // Hard reload to clear dirty state
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        className="min-h-[400px] w-full flex items-center justify-center p-8 rounded-xl bg-bg-app dark:bg-slate-950"
        role="alert"
      >
        <div className="text-center max-w-md mx-auto p-8 rounded-xl border shadow-card bg-bg-surface border-border dark:bg-slate-900 dark:border-slate-800">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-danger-100 dark:bg-danger-900">
            <AlertTriangle className="w-8 h-8 text-danger-500 dark:text-danger-300" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-txt-primary dark:text-slate-100">Đã xảy ra lỗi hệ thống</h2>
          <p className="mb-6 text-sm text-txt-muted dark:text-slate-400">
            {this.state.error?.message || 'Có lỗi không mong muốn xảy ra. Vui lòng thử lại hoặc liên hệ quản trị viên.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-colors bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:text-white dark:hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Tải lại trang
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
