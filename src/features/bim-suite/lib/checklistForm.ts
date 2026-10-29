// G4: chấm checklist hiện trường (thuần): mục số đo so giá trị thiết kế ± dung sai, mục đạt/không đạt, gợi ý kết luận.
export type ChecklistKind = 'dat_khong' | 'so' | 'chu';
export interface ChecklistItem {
  ma: string;
  noi_dung: string;
  kieu: ChecklistKind;
  don_vi?: string | null;
  gia_tri_thiet_ke?: number | null;
  dung_sai?: number | null;
}
export interface ChecklistAnswer {
  ma: string;
  dat?: boolean | null;
  gia_tri?: number | null;
  ghi_chu?: string | null;
}
export interface ItemVerdict {
  ma: string;
  /** null: chưa điền. */
  ok: boolean | null;
  /** Độ lệch so với thiết kế (giá trị tuyệt đối, đơn vị của mục). */
  deviation: number | null;
}

export function judgeItem(item: ChecklistItem, answer: ChecklistAnswer | undefined): ItemVerdict {
  if (item.kieu === 'chu') return { ma: item.ma, ok: true, deviation: null };
  if (item.kieu === 'dat_khong') return { ma: item.ma, ok: answer?.dat ?? null, deviation: null };
  const v = answer?.gia_tri;
  if (v === null || v === undefined || !Number.isFinite(v)) return { ma: item.ma, ok: null, deviation: null };
  const deviation =
    item.gia_tri_thiet_ke !== null && item.gia_tri_thiet_ke !== undefined ? Math.abs(v - item.gia_tri_thiet_ke) : null;
  const ok =
    deviation !== null && item.dung_sai !== null && item.dung_sai !== undefined
      ? deviation <= item.dung_sai + 1e-9
      : true;
  return { ma: item.ma, ok, deviation };
}

export interface ChecklistSummary {
  verdicts: ItemVerdict[];
  complete: boolean;
  allOk: boolean;
  /** Sai số lớn nhất của các mục đo bằng mm (để ghi vào sổ xác minh). */
  maxDeviationMm: number | null;
  suggestion: 'dat' | 'sai_lech' | null;
}

export function summarizeChecklist(items: ChecklistItem[], answers: ChecklistAnswer[]): ChecklistSummary {
  const byMa = new Map(answers.map((a) => [a.ma, a]));
  const verdicts = items.map((i) => judgeItem(i, byMa.get(i.ma)));
  const complete = verdicts.every((v) => v.ok !== null);
  const allOk = verdicts.every((v) => v.ok !== false);
  const mm = items
    .map((i, k) => (/^mm$/i.test(i.don_vi ?? '') ? verdicts[k].deviation : null))
    .filter((d): d is number => d !== null);
  return {
    verdicts,
    complete,
    allOk,
    maxDeviationMm: mm.length ? Math.max(...mm) : null,
    suggestion: !complete ? null : allOk ? 'dat' : 'sai_lech',
  };
}

/** Mẫu áp dụng cho lớp IFC (mẫu không ghi lớp thì áp cho mọi cấu kiện). */
export const templatesFor = <T extends { loai_ifc: string[] }>(templates: T[], ifcClass: string | null | undefined) =>
  templates.filter((t) => !t.loai_ifc.length || (ifcClass && t.loai_ifc.includes(ifcClass.toUpperCase())));
