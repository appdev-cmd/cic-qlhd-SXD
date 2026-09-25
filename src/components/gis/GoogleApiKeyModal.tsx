import React, { useState } from 'react';
import { Key, X, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { getStoredGoogleMapsApiKey, setStoredGoogleMapsApiKey } from '../../lib/googleMapsLoader';

export interface GoogleApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdated: (key: string) => void;
}

export function GoogleApiKeyModal({ isOpen, onClose, onKeyUpdated }: GoogleApiKeyModalProps) {
  const currentKey = getStoredGoogleMapsApiKey();
  const [apiKey, setApiKey] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredGoogleMapsApiKey(apiKey.trim());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    onKeyUpdated(apiKey.trim());
    onClose();
  };

  const handleClearKey = () => {
    setApiKey('');
    setStoredGoogleMapsApiKey('');
    onKeyUpdated('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center border border-primary-500/20">
              <Key size={20} />
            </div>
            <div>
              <h3 className="font-bold text-ink text-sm">Cấu hình Google Maps API Key</h3>
              <p className="text-3xs text-ink-muted">Tích hợp Google Maps JavaScript API chính thức</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-subtle flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Trạng thái hiện tại */}
        <div className="p-3 rounded-xl bg-subtle border border-border flex items-center justify-between gap-3 text-2xs">
          <div className="flex items-center gap-2">
            {currentKey ? (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            )}
            <div>
              <span className="font-semibold text-ink">Trạng thái API Key: </span>
              {currentKey ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  Đã cấu hình ({currentKey.slice(0, 8)}...{currentKey.slice(-4)})
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Chưa cấu hình (Đang dùng Google Maps Tiles Trực tiếp)
                </span>
              )}
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-3xs font-semibold bg-primary-500/10 text-primary-600 dark:text-primary-400">
            {currentKey ? 'Google Maps SDK' : 'Direct Tiles'}
          </span>
        </div>

        {/* Form nhập Key */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-2xs font-semibold text-ink mb-1.5">
              Google Maps JavaScript API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full pl-3 pr-10 py-2 rounded-xl border border-border bg-subtle text-ink font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-primary-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-3xs text-ink-muted mt-1.5">
              Khóa API được lưu trữ an toàn trong trình duyệt (localStorage) và biến môi trường{' '}
              <code className="px-1 py-0.5 rounded bg-subtle font-mono text-primary-600">
                VITE_GOOGLE_MAPS_API_KEY
              </code>.
            </p>
          </div>

          {/* Hướng dẫn lấy key */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 space-y-2 text-2xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck size={14} className="text-blue-600 dark:text-blue-400" />
              <span>Cách lấy Google Maps API Key miễn phí từ Google Cloud:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-3xs text-blue-800/90 dark:text-blue-300">
              <li>Truy cập Google Cloud Console và tạo một Project mới.</li>
              <li>Bật các API: <strong>Maps JavaScript API</strong> và <strong>Places API</strong>.</li>
              <li>Vào mục <strong>Credentials</strong> → <strong>Create Credentials</strong> → Chọn <strong>API key</strong>.</li>
              <li>Sao chép mã API key dán vào ô bên trên và bấm Lưu.</li>
            </ol>
            <div className="pt-1">
              <a
                href="https://console.cloud.google.com/google/maps-apis"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-3xs font-semibold text-primary-600 dark:text-primary-400 hover:underline"
              >
                <span>Mở Google Cloud Console Maps APIs</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {currentKey ? (
              <button
                type="button"
                onClick={handleClearKey}
                className="px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-2xs font-semibold transition-colors"
              >
                Xóa Key & Dùng Tiles
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-border bg-subtle hover:bg-surface text-ink text-2xs font-semibold transition-colors"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-2xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                <span>{saveSuccess ? 'Đã lưu!' : 'Lưu & Kích hoạt'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
