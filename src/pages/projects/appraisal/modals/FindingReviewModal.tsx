import type { Finding } from '../../../../types/appraisal';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import { StatusLabel, labels } from '../shared';
import type { FindingDecision } from '../tabs/FindingsTab';
import { FormModal, NoteField, useDirtyForm, type ReviewDialogProps } from './FormModal';

export type FindingReviewBody = { decision: string; note: string };

/** Records the officer's decision on one finding — PATCH /findings/{id} with accept | reject | defer. */
export function FindingReviewModal({
  finding,
  decision,
  note = '',
  ...dialog
}: { finding: Finding; decision: FindingDecision; note?: string } & ReviewDialogProps<FindingReviewBody>) {
  const { form, patch, dirty } = useDirtyForm<FindingReviewBody>({ decision, note });
  return (
    <FormModal heading={finding.title} dirty={dirty} {...dialog} onSubmit={() => dialog.onSubmit(form)}>
      <div className="space-y-2 rounded-xl bg-subtle dark:bg-slate-900 p-3 text-sm">
        <StatusLabel value={finding.result} />
        <p>{finding.explanation}</p>
      </div>
      <SearchableSelect
        value={form.decision}
        onChange={(next) => patch({ decision: next })}
        options={['accept', 'reject', 'defer'].map((v) => ({ value: v, label: labels[v] }))}
      />
      <NoteField value={form.note} onChange={(next) => patch({ note: next })} />
    </FormModal>
  );
}
