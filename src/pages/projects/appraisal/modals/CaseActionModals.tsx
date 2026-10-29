import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import { inputClass } from '../shared';
import { FormModal, NoteField, useDirtyForm, type ReviewDialogProps } from './FormModal';

/** Adds a component listed in the submission letter — POST /requirements. */
export function AddRequirementModal(dialog: ReviewDialogProps<{ name: string; category: string }>) {
  const { form, patch, dirty } = useDirtyForm({ name: '', category: '' });
  return (
    <FormModal heading="Thêm thành phần theo tờ trình" dirty={dirty} {...dialog} onSubmit={() => dialog.onSubmit(form)}>
      <label className="block text-sm font-medium">
        Tên tài liệu
        <input required className={inputClass} value={form.name} onChange={(e) => patch({ name: e.target.value })} />
      </label>
      <NoteField label="Nhóm tài liệu" value={form.category} onChange={(category) => patch({ category })} />
    </FormModal>
  );
}

/** Records a consultation note and, optionally, the investor's response — POST /consultations. */
export function ConsultationModal(dialog: ReviewDialogProps<{ text: string; response: string }>) {
  const { form, patch, dirty } = useDirtyForm({ text: '', response: '' });
  return (
    <FormModal heading="Ý kiến và giải trình" dirty={dirty} {...dialog} onSubmit={() => dialog.onSubmit(form)}>
      <NoteField label="Ý kiến cần xử lý" value={form.text} onChange={(text) => patch({ text })} />
      <NoteField
        label="Nội dung giải trình (nếu đã có)"
        required={false}
        value={form.response}
        onChange={(response) => patch({ response })}
      />
    </FormModal>
  );
}

/** Internal review by the head of department / director — POST /final-review. */
export function FinalReviewModal(dialog: ReviewDialogProps<{ decision: string; note: string }>) {
  const { form, patch, dirty } = useDirtyForm({ decision: 'request_supplement', note: '' });
  return (
    <FormModal heading="Rà soát nội bộ" dirty={dirty} {...dialog} onSubmit={() => dialog.onSubmit(form)}>
      <SearchableSelect
        value={form.decision}
        onChange={(decision) => patch({ decision })}
        options={[
          { value: 'request_supplement', label: 'Yêu cầu bổ sung' },
          { value: 'reviewed', label: 'Hoàn tất rà soát nhận xét' },
        ]}
      />
      <NoteField value={form.note} onChange={(note) => patch({ note })} />
    </FormModal>
  );
}

/** Reopens a locked (reviewed) submission — POST /reopen; the reason needs at least 10 characters. */
export function ReopenModal(dialog: ReviewDialogProps<{ note: string }>) {
  const { form, patch, dirty } = useDirtyForm({ note: '' });
  return (
    <FormModal heading="Mở lại hồ sơ đã khóa" dirty={dirty} {...dialog} onSubmit={() => dialog.onSubmit(form)}>
      <NoteField minLength={10} value={form.note} onChange={(note) => patch({ note })} />
    </FormModal>
  );
}
