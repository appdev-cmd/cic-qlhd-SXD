import type { FragmentsModel } from '@thatopen/fragments';
import type { Outliner } from '@thatopen/components-front';
import { SELECTION_MATERIAL } from './viewerConstants';

/** Selection always takes precedence over maintenance/group colors, including after a color reset. */
export async function syncSelectionAppearance(
  models: ReadonlyMap<string, Pick<FragmentsModel, 'highlight' | 'resetOpacity'>>,
  selection: ReadonlyMap<string, ReadonlySet<number>>,
  outliner: Pick<Outliner, 'clean' | 'addItems'> | null,
  ghost: boolean,
) {
  outliner?.clean();
  const outlined: Record<string, Set<number>> = {};
  for (const [modelId, selected] of selection) {
    const model = models.get(modelId);
    if (!model || !selected.size) continue;
    const ids = [...selected];
    if (ghost) await model.resetOpacity(ids);
    await model.highlight(ids, SELECTION_MATERIAL);
    outlined[modelId] = new Set(ids);
  }
  if (Object.keys(outlined).length) await outliner?.addItems(outlined);
}
