import React from 'react';
import { Modal } from '../ui/Modal';

/** Hộp thoại nghiệp vụ — giữ API cũ, dùng Modal chuẩn (guard form con, Esc theo lớp, hỏi lại khi có thay đổi). */
export function ReviewModal({
  heading,
  children,
  onClose,
  dirty = false,
}: {
  heading: string;
  children: React.ReactNode;
  onClose: () => void;
  dirty?: boolean;
}) {
  return (
    <Modal heading={heading} onClose={onClose} dirty={dirty} size="xl">
      {children}
    </Modal>
  );
}
