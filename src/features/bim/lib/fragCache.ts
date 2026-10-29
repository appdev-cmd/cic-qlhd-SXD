import type { BimModel } from '../types/bim.types';
import { apiResponse } from '../../../services/apiClient';

// Always re-authorize downloads through the existing gateway. Geometry is kept
// only by the mounted viewer, never in a cache shared by different accounts.
export const pinFragCache = (_models: BimModel[]) => {};
export const prefetchSignedUrls = async (_models: BimModel[]) => {};
export async function loadFragBuffer(
  model: BimModel,
  onProgress?: (p: { loaded: number; total: number | null; fromCache: boolean }) => void,
) {
  const response = await apiResponse(`/bim/models/${encodeURIComponent(model.id)}/files/frag`);
  const buffer = await response.arrayBuffer();
  onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength, fromCache: false });
  return buffer;
}
