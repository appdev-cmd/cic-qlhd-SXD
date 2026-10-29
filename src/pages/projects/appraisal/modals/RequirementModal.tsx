import type { Dossier } from '../../../../types/appraisal';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import { labels } from '../shared';
import { FormModal, NoteField, useDirtyForm, type ReviewDialogProps } from './FormModal';

export type RequirementBody = { status: string; note: string };

/** Checks one required dossier component — PATCH /requirements/{id}. */
export function RequirementModal({
  requirement,
  ...dialog
}: { requirement: Dossier['requirements'][number] } & ReviewDialogProps<RequirementBody>) {
  const { form, patch, dirty } = useDirtyForm({
    decision: requirement.status === 'missing' ? 'needs_supplement' : requirement.status,
    note: '',
  });
  return (
    <FormModal
      heading="Kiểm tra thành phần hồ sơ"
      dirty={dirty}
      {...dialog}
      onSubmit={() => dialog.onSubmit({ status: form.decision, note: form.note })}
    >
      <p className="text-sm font-medium">{requirement.name}</p>
      <SearchableSelect
        value={form.decision}
        onChange={(decision) => patch({ decision })}
        options={['submitted', 'verified', 'needs_supplement'].map((v) => ({ value: v, label: labels[v] }))}
      />
      <NoteField value={form.note} onChange={(note) => patch({ note })} />
    </FormModal>
  );
}
