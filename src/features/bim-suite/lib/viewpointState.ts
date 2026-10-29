import type { BimViewpoint, BimViewpointVisibility } from '@/features/bim-suite/types/bim.types';

/**
 * Thứ tự ưu tiên hình thức của một cấu kiện khi trả lại màu sau hover/bỏ chọn:
 * đang chọn > đang rê chuột > màu nhóm (4D/5D/bảo trì) > ghost > màu gốc.
 */
export type ItemAppearance = 'selection' | 'hover' | 'group' | 'ghost' | 'base';

export function resolveItemAppearance(state: {
  selected: boolean;
  hovered?: boolean;
  groupColored: boolean;
  ghost: boolean;
}): ItemAppearance {
  if (state.selected) return 'selection';
  if (state.hovered) return 'hover';
  if (state.groupColored) return 'group';
  if (state.ghost) return 'ghost';
  return 'base';
}

/** Trạng thái hiển thị của một mô hình trong trình xem (tập ID cục bộ). */
export interface ModelVisibilityLike {
  isolated: ReadonlySet<number> | null;
  hidden: ReadonlySet<number>;
  filterHidden?: ReadonlySet<number>;
  classificationHidden?: ReadonlySet<number>;
}

/**
 * Chụp trạng thái hiển thị của mọi mô hình đang nạp. Cấu kiện bị ẩn bởi bộ lọc hoặc cây
 * không gian được gộp vào danh sách ẩn: góc nhìn khôi phục đúng những gì người dùng đã thấy,
 * không phụ thuộc trạng thái của các bảng lọc lúc mở lại.
 */
export function captureVisibility(
  loadedIds: readonly string[],
  stateOf: (modelId: string) => ModelVisibilityLike | undefined,
): Record<string, BimViewpointVisibility> {
  const out: Record<string, BimViewpointVisibility> = {};
  for (const modelId of loadedIds) {
    const state = stateOf(modelId);
    const hidden = new Set<number>();
    state?.hidden.forEach((id) => hidden.add(id));
    state?.filterHidden?.forEach((id) => hidden.add(id));
    state?.classificationHidden?.forEach((id) => hidden.add(id));
    out[modelId] = {
      isolated: state?.isolated ? [...state.isolated] : null,
      hidden: [...hidden],
    };
  }
  return out;
}

export interface VisibilityPlanEntry {
  isolated: Set<number> | null;
  hidden: Set<number>;
}

/**
 * Tính trạng thái hiển thị cần áp cho từng mô hình đang nạp từ một góc nhìn.
 * - Định dạng mới (`visibility`): áp theo từng mô hình; mô hình nạp sau khi lưu thì để hiện đầy đủ.
 * - Định dạng cũ (`isolatedIds`/`hiddenIds`): chỉ áp lên một mô hình đích như trước đây.
 */
export function planVisibility(
  vp: Pick<BimViewpoint, 'visibility' | 'isolatedIds' | 'hiddenIds' | 'modelIds'>,
  loadedIds: readonly string[],
): Map<string, VisibilityPlanEntry> {
  const plan = new Map<string, VisibilityPlanEntry>();
  if (vp.visibility) {
    for (const modelId of loadedIds) {
      const saved = vp.visibility[modelId];
      plan.set(modelId, {
        isolated: saved?.isolated ? new Set(saved.isolated) : null,
        hidden: new Set(saved?.hidden ?? []),
      });
    }
    return plan;
  }
  const target = vp.modelIds?.find((id) => loadedIds.includes(id)) ?? loadedIds[0];
  for (const modelId of loadedIds) {
    const isTarget = modelId === target;
    plan.set(modelId, {
      hidden: new Set(isTarget ? (vp.hiddenIds ?? []) : []),
      isolated: vp.isolatedIds?.length ? new Set(isTarget ? vp.isolatedIds : []) : null,
    });
  }
  return plan;
}

/** Góc nhìn có đang cô lập cấu kiện ở bất kỳ mô hình nào không. */
export function viewpointHasIsolation(vp: Pick<BimViewpoint, 'visibility' | 'isolatedIds'>): boolean {
  if (vp.visibility) return Object.values(vp.visibility).some((v) => v.isolated !== null && v.isolated !== undefined);
  return !!vp.isolatedIds?.length;
}
