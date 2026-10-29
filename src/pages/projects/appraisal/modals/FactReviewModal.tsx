import type { Fact } from '../../../../types/appraisal';
import { NumberInput } from '../../../../components/ui/NumberInput';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import { inputClass } from '../shared';
import { FormModal, NoteField, useDirtyForm, type ReviewDialogProps } from './FormModal';

export type FactReviewBody = { decision: string; value: string; note: string };

/** Confirms (or discards) one extracted value — PATCH /facts/{id}. */
export function FactReviewModal({ fact, ...dialog }: { fact: Fact } & ReviewDialogProps<FactReviewBody>) {
  const { form, patch, dirty } = useDirtyForm<FactReviewBody>({ value: fact.value, note: '', decision: 'confirmed' });
  return (
    <FormModal heading={'Xác nhận ' + fact.label} dirty={dirty} {...dialog} onSubmit={() => dialog.onSubmit(form)}>
      <blockquote className="rounded-xl bg-subtle dark:bg-slate-900 p-3 text-sm">{fact.quote}</blockquote>
      <label className="block text-sm font-medium">
        Giá trị xác nhận
        {fact.unit === 'VNĐ' ? (
          <NumberInput value={form.value} onChange={(v) => patch({ value: String(v) })} suffix="VNĐ" />
        ) : (
          <input className={inputClass} value={form.value} onChange={(e) => patch({ value: e.target.value })} />
        )}
      </label>
      <SearchableSelect
        value={form.decision}
        onChange={(decision) => patch({ decision })}
        options={[
          { value: 'confirmed', label: 'Xác nhận giá trị' },
          { value: 'rejected', label: 'Không sử dụng giá trị' },
        ]}
      />
      <NoteField value={form.note} onChange={(note) => patch({ note })} />
    </FormModal>
  );
}
