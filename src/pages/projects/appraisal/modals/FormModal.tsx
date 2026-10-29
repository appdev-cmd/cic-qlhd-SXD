import React, { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Notice, inputClass } from '../shared';

/** Form state plus `dirty` (JSON.stringify against the opening values) for the unsaved-changes guard. */
export function useDirtyForm<T>(initial: T) {
  const [start] = useState(() => JSON.stringify(initial));
  const [form, setForm] = useState(initial);
  const patch = (next: Partial<T>) => setForm((current) => ({ ...current, ...next }));
  return { form, patch, dirty: JSON.stringify(form) !== start };
}

/** Review dialog shell: Modal (child-form guard, dirty prompt) + form + "Lưu đánh giá" footer button. */
export function FormModal({
  heading,
  dirty,
  busy,
  error,
  onClose,
  onSubmit,
  children,
}: {
  heading: string;
  dirty: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const formId = useId();
  return (
    <Modal
      heading={heading}
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <Button type="submit" form={formId} leftIcon={<Check size={15} />} loading={busy} loadingText="Đang lưu…">
          Lưu đánh giá
        </Button>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {error && <Notice role="alert">{error}</Notice>}
        {children}
      </form>
    </Modal>
  );
}

/** Required multi-line note ("Lý do và căn cứ xác nhận" by default). */
export function NoteField({
  label = 'Lý do và căn cứ xác nhận',
  value,
  onChange,
  minLength = 3,
  required = true,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea
        required={required}
        minLength={required ? minLength : undefined}
        rows={3}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Props shared by every review dialog of the workspace. */
export interface ReviewDialogProps<B> {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (body: B) => void;
}
