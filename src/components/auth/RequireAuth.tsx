import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LoginPage } from '../../pages/LoginPage';

/** Chặn truy cập khi chưa đăng nhập (cloud) hoặc đang khôi phục mật khẩu; demo vào thẳng. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!auth.passwordRecovery && (auth.mode === 'demo' || auth.profile)) return <>{children}</>;
  return <LoginPage />;
}
