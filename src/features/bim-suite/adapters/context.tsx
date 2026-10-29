'use client';
// Cầu nối giữa mã BIM chuyển từ cic-hud và BuildSIA. Mã gốc gọi useAuth(), usePermissionContext().can(...),
// usePermissionCheck(), useImpersonation(); ở đây các hook giữ nguyên tên và hình dạng trả về nhưng lấy dữ liệu từ
// phiên đăng nhập Supabase của BuildSIA và quyền dự án (thành viên dự án, quản trị đơn vị) do trang server truyền vào.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuth as useAppAuth } from '@/context/AuthContext';
import { bimCan, type BimAccess } from './permissions';

export type { BimAccess } from './permissions';

export type BimCurrentUser = { id: string; name: string; FullName: string; EmployeeID: string; email: string };

type BimContextValue = { access: BimAccess; user: User | null; currentUser: BimCurrentUser | null };

const BimContext = createContext<BimContextValue | null>(null);

function displayName(user: User) {
  return String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Tài khoản');
}

export function BimAccessProvider({ access, children }: { access: BimAccess; children: ReactNode }) {
  const { session } = useAppAuth();
  const user = session?.user || null;
  const value = useMemo<BimContextValue>(() => {
    if (!user) return { access, user: null, currentUser: null };
    const name = displayName(user);
    // cic-hud định danh người dùng bằng EmployeeID; BuildSIA không có bảng nhân sự nên dùng id tài khoản.
    return {
      access,
      user,
      currentUser: { id: user.id, name, FullName: name, EmployeeID: user.id, email: user.email ?? '' },
    };
  }, [access, user]);
  return <BimContext.Provider value={value}>{children}</BimContext.Provider>;
}

function useBimContext() {
  const value = useContext(BimContext);
  if (!value) throw new Error('BimAccessProvider missing');
  return value;
}

export function useBimAccess() {
  return useBimContext().access;
}

/** Thay context/AuthContext của cic-hud: chỉ các trường mã BIM dùng. */
export function useAuth() {
  const { user, currentUser } = useBimContext();
  return { supabaseUser: user, currentUser, user: currentUser, isAuthenticated: Boolean(user) };
}

/** Thay context/PermissionContext của cic-hud. */
export function usePermissionContext() {
  const { access } = useBimContext();
  return useMemo(
    () => ({ can: (resource: string, action: string) => bimCan(access, resource, action), loading: false }),
    [access],
  );
}

/** Thay hooks/usePermissionCheck của cic-hud; canEditProject không còn tính theo Ban QLDA mà theo quyền dự án. */
export function usePermissionCheck() {
  const { access } = useBimContext();
  return useMemo(
    () => ({
      can: (resource: string, action: string) => bimCan(access, resource, action),
      canEditProject: (project?: unknown) => {
        void project;
        return access.canWrite;
      },
      isGlobalScope: false,
      loading: false,
    }),
    [access],
  );
}

/** cic-hud cho quản trị "đăng nhập thay"; BuildSIA không có tính năng này. */
export function useImpersonation() {
  return { impersonatedUser: null as null | { EmployeeID: string; FullName: string }, isImpersonating: false };
}
