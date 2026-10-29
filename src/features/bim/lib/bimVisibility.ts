export interface ItemVisibility {
  isolated: Set<number> | null;
  hidden: Set<number>;
  filterHidden: Set<number>;
  classificationHidden?: Set<number>;
  annotationHidden?: Set<number>;
}
interface VisibilityModel {
  resetVisible(): Promise<unknown>;
  setVisible(ids: number[] | undefined, visible: boolean): Promise<unknown>;
}

const pending = new WeakMap<VisibilityModel, { tail: Promise<void>; revision: number }>();
/** One serialized visibility transaction per model; rapid changes apply the latest complete snapshot. */
export function applyBimVisibility(
  model: VisibilityModel,
  state?: ItemVisibility,
  temporaryHidden?: Set<number>,
): Promise<void> {
  const entry = pending.get(model) ?? { tail: Promise.resolve(), revision: 0 };
  pending.set(model, entry);
  const revision = ++entry.revision;
  const isolated = state?.isolated ? [...state.isolated] : null;
  const hidden = [
    ...new Set([
      ...(state?.hidden || []),
      ...(state?.filterHidden || []),
      ...(state?.classificationHidden || []),
      ...(state?.annotationHidden || []),
      ...(temporaryHidden || []),
    ]),
  ];
  const run = entry.tail
    .catch(() => undefined)
    .then(async () => {
      if (revision !== entry.revision) return;
      await model.resetVisible();
      if (isolated) {
        await model.setVisible(undefined, false);
        await model.setVisible(isolated, true);
      }
      if (hidden.length) await model.setVisible(hidden, false);
    });
  entry.tail = run;
  return run;
}
