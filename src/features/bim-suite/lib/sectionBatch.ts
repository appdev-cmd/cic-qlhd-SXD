import { appendSectionCap, type CapPlane } from './sectionCaps';
import { appendSectionOutline } from './sectionOutline';

export interface SectionBatch {
  triangles: Float32Array[];
  planes: CapPlane[];
  offset: number;
  outline: boolean;
  caps: boolean;
  maxSegments: number;
  maxCapTriangles: number;
}
export function processSectionBatch(input: SectionBatch) {
  const outline: number[] = [],
    positions: number[] = [],
    uvs: number[] = [],
    normals: number[] = [];
  let items = 0,
    triangles = 0,
    limited = false;
  for (const mesh of input.triangles) {
    if (input.outline && outline.length / 6 < input.maxSegments)
      appendSectionOutline(mesh, input.planes, outline, {
        offset: input.offset,
        maxSegments: input.maxSegments - outline.length / 6,
      });
    let wrote = 0;
    if (input.caps)
      for (const plane of input.planes) {
        if (triangles + wrote >= input.maxCapTriangles) {
          limited = true;
          break;
        }
        const remaining = Math.max(0, Math.floor(input.maxCapTriangles - triangles - wrote));
        const added = appendSectionCap(mesh, plane, positions, uvs, { offset: input.offset * 2, hatch: 0.2, normals });
        if (added > remaining) {
          const kept = triangles + wrote + remaining;
          positions.length = kept * 9;
          normals.length = kept * 9;
          uvs.length = kept * 6;
          limited = true;
        }
        wrote += Math.min(added, remaining);
      }
    triangles += wrote;
    if (wrote) items++;
  }
  return {
    outline: new Float32Array(outline),
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    normals: new Float32Array(normals),
    items,
    triangles,
    limited: limited || outline.length / 6 >= input.maxSegments || triangles >= input.maxCapTriangles,
  };
}
export type SectionBatchResult = ReturnType<typeof processSectionBatch>;
