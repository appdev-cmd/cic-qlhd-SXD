import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { StaffUser } from '../types/domain';
import { useStaff } from '../hooks/useData';
import { setCurrentActorId } from '../lib/supabase';

const STORAGE_KEY = 'cic_current_staff_id';
const DEFAULT_STAFF_ID = 'staff-001';

interface CurrentUserContextValue {
  /** Cán bộ đang thao tác (giai đoạn phát triển: chọn nhanh để thử luồng theo vai trò). */
  currentUser: StaffUser | null;
  staffList: StaffUser[];
  switchUser: (staffId: string) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined);

function readStoredId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_STAFF_ID;
  } catch {
    return DEFAULT_STAFF_ID;
  }
}

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const { data: staffList = [] } = useStaff();
  const [staffId, setStaffId] = useState<string>(readStoredId);

  // Cập nhật ngay (không chờ effect) để request đầu tiên đã mang đúng x-actor-id
  setCurrentActorId(staffId);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, staffId);
    } catch {
      // localStorage không khả dụng (chế độ ẩn danh) — bỏ qua
    }
  }, [staffId]);

  const value = useMemo<CurrentUserContextValue>(
    () => ({
      currentUser: staffList.find((s) => s.id === staffId) ?? staffList[0] ?? null,
      staffList,
      switchUser: setStaffId,
    }),
    [staffList, staffId]
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  return ctx;
}

export const ROLE_LABELS: Record<StaffUser['role'], string> = {
  officer: 'Chuyên viên',
  head_of_department: 'Trưởng phòng',
  director: 'Lãnh đạo Sở',
  admin: 'Quản trị hệ thống',
};
