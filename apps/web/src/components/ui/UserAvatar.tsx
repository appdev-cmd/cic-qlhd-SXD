"use client";

import React, { useState, useEffect } from 'react';

export interface UserAvatarProps {
  src?: string | null;
  fallbackSrc?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  textClassName?: string;
  alt?: string;
  title?: string;
  onClick?: () => void;
}

const SIZE_MAP: Record<string, { box: string; text: string }> = {
  xs: { box: 'w-6 h-6', text: 'text-[9px]' },
  sm: { box: 'w-8 h-8', text: 'text-[10px]' },
  md: { box: 'w-10 h-10', text: 'text-xs' },
  lg: { box: 'w-12 h-12', text: 'text-sm' },
  xl: { box: 'w-16 h-16', text: 'text-base' },
};

const GRADIENTS = [
  'bg-gradient-to-br from-indigo-500 to-purple-600',
  'bg-gradient-to-br from-blue-500 to-cyan-600',
  'bg-gradient-to-br from-emerald-500 to-teal-600',
  'bg-gradient-to-br from-amber-500 to-orange-600',
  'bg-gradient-to-br from-rose-500 to-pink-600',
  'bg-gradient-to-br from-violet-500 to-fuchsia-600',
  'bg-gradient-to-br from-sky-500 to-indigo-600',
];

export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '?';
  // Loại bỏ ghi chú trong ngoặc đơn như (STC), (HCM), (BOD)
  const clean = name.replace(/\([^)]*\)/g, '').trim();
  if (!clean) return name.trim().charAt(0).toUpperCase();

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return (first + last).toUpperCase();
}

function getGradient(name?: string | null): string {
  if (!name) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

/**
 * Component hiển thị Avatar chuẩn của hệ thống CIC-ERP.
 * Tự động xử lý thứ tự ưu tiên 3 bước:
 * 1. Ưu tiên 1: src (Avatar do người dùng/nhân sự tự upload/thiết lập thủ công).
 * 2. Ưu tiên 2: fallbackSrc (Avatar từ tài khoản Google SSO / Profiles).
 * 3. Ưu tiên 3: Tự tạo Avatar chữ cái đại diện (Initials Họ + Tên) trên nền Gradient độc nhất theo Tên.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  fallbackSrc,
  name,
  size = 'sm',
  className = '',
  textClassName = '',
  alt,
  title,
  onClick,
}) => {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  // Reset trạng thái lỗi khi src hoặc fallbackSrc thay đổi
  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [src, fallbackSrc]);

  const cleanPrimarySrc = src && typeof src === 'string' ? src.trim() : null;
  const cleanFallbackSrc = fallbackSrc && typeof fallbackSrc === 'string' ? fallbackSrc.trim() : null;

  // Xác định nguồn ảnh hiện tại theo thứ tự ưu tiên
  let activeSrc: string | null = null;
  if (cleanPrimarySrc && !primaryFailed) {
    activeSrc = cleanPrimarySrc;
  } else if (cleanFallbackSrc && !fallbackFailed) {
    activeSrc = cleanFallbackSrc;
  }

  const handleError = () => {
    if (activeSrc === cleanPrimarySrc) {
      setPrimaryFailed(true);
    } else {
      setFallbackFailed(true);
    }
  };

  const initials = getInitials(name);
  const bgGradient = getGradient(name);
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.sm;
  return (
    <div
      data-avatar="true"
      data-no-tooltip="true"
      onClick={onClick}
      className={`relative shrink-0 rounded-full overflow-hidden flex items-center justify-center select-none avatar no-auto-tooltip ${sizeConfig.box} ${className} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {activeSrc ? (
        <img
          src={activeSrc}
          alt={alt || name || 'Avatar'}
          data-no-tooltip="true"
          referrerPolicy="no-referrer"
          onError={handleError}
          className="w-full h-full object-cover rounded-full"
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center font-bold text-white ${bgGradient} ${sizeConfig.text} ${textClassName}`}
        >
          {initials}
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
