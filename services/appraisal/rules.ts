import { Decimal } from 'decimal.js';
import config from './data/rules.json' with { type: 'json' };
import { COSTS, latestDocuments, now, uid, type CaseDocument, type DocumentSegment } from './domain.js';
import { legalOverview, ref, ND206, LAW135 } from './legal.js';
import type { DeadlineCase } from './sla.js';
import type { Fact } from './facts.js';
import { decimalScale, decimalString } from './facts.js';

export const RULE_VERSION = config.RULE_VERSION;
export interface AiNote {
  text: string;
  sources: Array<DocumentSegment & { documentId: string }>;
  status: string;
  model: string;
}
export interface Requirement {
  id: string;
  name: string;
  required: boolean;
  category: string;
  status: string;
  note: string;
  verifiedBy: string | null;
}
export interface AnalysisCase extends DeadlineCase {
  facts: Fact[];
  requirements: Requirement[];
}
export interface Finding {
  id: string;
  code: string;
  category: string;
  title: string;
  result: string;
  explanation: string;
  sources: Array<Pick<Fact, 'documentId' | 'segmentId' | 'locator' | 'quote'>>;
  missingEvidence: string[];
  calculation: string;
  legalRefs: Array<{ label: string; url: string }>;
  review: { decision: string; note?: string; [key: string]: unknown } | null;
  severity: string;
}
export function analyze(value: AnalysisCase, mode = 'intake') {
  const documents = latestDocuments(value, mode);
  const active = new Set(documents.map((document) => document.id));
  const facts = value.facts.filter((fact) => active.has(fact.documentId) && fact.reviewStatus !== 'rejected');
  const findings: Finding[] = [];
  function add(
    code: string,
    category: string,
    title: string,
    result: string,
    explanation: string,
    evidence: Array<Pick<Fact, 'documentId' | 'segmentId' | 'locator' | 'quote'>> = [],
    missing: string[] = [],
    formula = '',
    legal: Array<{ label: string; url: string }> = [],
  ) {
    findings.push({
      id: uid(),
      code,
      category,
      title,
      result,
      explanation,
      sources: evidence.map(({ documentId, segmentId, locator, quote }) => ({ documentId, segmentId, locator, quote })),
      missingEvidence: [...missing],
      calculation: formula,
      legalRefs: [...legal],
      review: null,
      severity: ['inconsistent', 'insufficient_evidence'].includes(result) ? 'warning' : 'info',
    });
  }
  const values = (key: string, requirement?: string) =>
    facts.filter(
      (fact) =>
        fact.key === key &&
        (!requirement ||
          documents.some((document) => document.id === fact.documentId && document.requirementId === requirement)),
    );
  function numeric(key: string, requirement?: string): [Decimal, Fact] | null {
    const matches = values(key, requirement);
    if (!matches.length || new Set(matches.map((fact) => fact.value)).size !== 1) return null;
    try {
      return [new Decimal(matches[0].value), matches[0]];
    } catch {
      return null;
    }
  }
  for (const requirement of value.requirements) {
    const docs = documents.filter(
      (document) => document.requirementId === requirement.id && document.role !== 'reference',
    );
    const readable = docs.filter(
      (document) =>
        document.segments.length &&
        !((document.warnings as string[]) || []).some((warning) => warning.includes('chưa đọc đủ')),
    );
    if (requirement.required && !readable.length)
      add(
        'INPUT.' + requirement.id,
        'Hồ sơ đầu vào',
        requirement.name,
        'insufficient_evidence',
        'Chưa có tệp đọc được đầy đủ trong lần trình này. Việc dẫn tên tài liệu không thay thế tệp đầu vào.',
        [],
        [requirement.name],
      );
    else if (readable.length) {
      const source = readable.at(-1)!;
      const segment = source.segments[0];
      add(
        'INPUT.' + requirement.id,
        'Hồ sơ đầu vào',
        requirement.name,
        'consistent',
        'Đã có tệp đọc được. Chuyên viên cần kiểm tra nội dung và phụ lục; đây chưa phải xác nhận hợp lệ.',
        [{ documentId: source.id, segmentId: segment.id, locator: segment.locator, quote: segment.text }],
      );
    }
  }
  for (const key of [
    'project_name',
    'province',
    'building_grade',
    'mep_certificate',
    'survey_certificate',
    'standard_primary',
    'standard_secondary',
  ]) {
    const matches = values(key);
    if (new Set(matches.map((fact) => fact.value.toLowerCase())).size > 1)
      add(
        'CROSS.' + key,
        'Nhất quán',
        matches[0].label + ' khác nhau giữa tài liệu',
        'inconsistent',
        'Cần xác minh bản gốc hoặc giải trình phiên bản; chưa xác định giá trị nào đúng.',
        matches,
      );
  }
  const costVersions: Array<{
    documentId: string;
    name: string;
    version: unknown;
    total: string;
    sum: string;
    items: Array<{ key: string; name: string; value: string }>;
  }> = [];
  const formatMoney = (number: Decimal) => number.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  for (const document of value.documents.filter(
    (document) => document.requirementId === 'KT05' && document.role !== 'reference',
  )) {
    const fs = value.facts.filter((fact) => fact.documentId === document.id && fact.reviewStatus !== 'rejected');
    const mapped = new Map<string, Fact>();
    for (const [key] of COSTS) {
      const matches = fs.filter((fact) => fact.key === 'cost.' + key);
      if (matches.length && new Set(matches.map((fact) => fact.value)).size === 1) mapped.set(key, matches[0]);
    }
    const totals = fs.filter((fact) => fact.key === 'total');
    if (mapped.size === 7 && totals.length && new Set(totals.map((fact) => fact.value)).size === 1) {
      const summed = Decimal.sum(...[...mapped.values()].map((fact) => fact.value));
      const declared = new Decimal(totals[0].value);
      costVersions.push({
        documentId: document.id,
        name: document.name,
        version: document.version,
        total: totals[0].value,
        sum: decimalString(summed, Math.max(...[...mapped.values()].map((fact) => decimalScale(fact.value)))),
        items: COSTS.map(([key, name]) => ({ key, name, value: mapped.get(key)!.value })),
      });
      if (active.has(document.id))
        add(
          'COST.SUM',
          'Chi phí',
          'Tổng 7 khoản mục chi phí',
          summed.eq(declared) ? 'consistent' : 'inconsistent',
          'Kiểm tra số học trên giá trị được trích xuất. Chưa xác nhận khối lượng, đơn giá hoặc tính hợp pháp.',
          [...mapped.values(), totals[0]],
          [],
          `${formatMoney(summed)} VNĐ so với tổng công bố ${formatMoney(declared)} VNĐ`,
        );
    }
  }
  if (!costVersions.length)
    add(
      'COST.MISSING',
      'Chi phí',
      'Chưa đủ bảng tổng mức đầu tư',
      'insufficient_evidence',
      'Cần đủ 7 khoản mục, đơn vị tiền và tổng công bố trong cùng tài liệu.',
      [],
      ['Bảng tổng mức đầu tư đủ 7 khoản mục'],
    );
  const planning = ['land_area', 'footprint', 'floor_area', 'density', 'far'].map((key) => numeric(key, 'KT03'));
  if (planning.every((item) => item !== null) && planning[0]![0].gt(0)) {
    const [land, footprint, floor, density, far] = planning.map((item) => item![0]);
    const expectedD = footprint.div(land).mul(100);
    const expectedF = floor.div(land);
    const matches = expectedD.minus(density).abs().lte('.05') && expectedF.minus(far).abs().lte('.005');
    add(
      'PLAN.MATH',
      'Quy hoạch',
      'Mật độ và hệ số sử dụng đất',
      matches ? 'consistent' : 'inconsistent',
      'Kiểm tra số học và làm tròn; cần bản quy hoạch được chấp thuận để kết luận phù hợp.',
      planning.map((item) => item![1]),
      [],
      `${footprint.toFixed()}/${land.toFixed()} × 100 = ${expectedD.toFixed(4)}%; ${floor.toFixed()}/${land.toFixed()} = ${expectedF.toFixed(5)}`,
    );
  }
  const totalFloor = numeric('floor_area', 'KT03');
  const floorFacts = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B', 'C', 'D', 'G1', 'G2'].map((key) =>
    numeric('floor.' + key, 'KT04'),
  );
  if (totalFloor && floorFacts.every((item) => item !== null)) {
    const summed = Decimal.sum(...floorFacts.map((item) => item![0]));
    const difference = summed.minus(totalFloor[0]);
    add(
      'AREA.SUM',
      'Thiết kế',
      'Đối chiếu diện tích sàn các hạng mục',
      difference.isZero() ? 'consistent' : 'inconsistent',
      'Giả thiết cộng A1–A6, B, C, D, G1, G2; cần xác nhận phạm vi tính diện tích, bán hầm và hành lang.',
      [totalFloor[1], ...floorFacts.map((item) => item![1])],
      [],
      `${summed.toFixed()} − ${totalFloor[0].toFixed()} = ${difference.toFixed()} m²`,
    );
  }
  const tank = ['tank_capacity', 'tank_length', 'tank_width', 'tank_height'].map((key) => numeric(key, 'KT04'));
  if (tank.every((item) => item !== null)) {
    const [capacity, l, w, h] = tank.map((item) => item![0]);
    add(
      'FIRE.TANK',
      'PCCC và môi trường',
      'Dung tích bể và kích thước ngoài',
      'requires_specialist',
      'Kích thước ngoài không phải dung tích hữu ích. Cần mặt cắt, ngăn bể, mực nước và tính toán chữa cháy.',
      tank.map((item) => item![1]),
      ['Bản vẽ chi tiết bể và tính toán lưu lượng'],
      `${tank[1]![1].value} × ${tank[2]![1].value} × ${tank[3]![1].value} = ${decimalString(
        l.mul(w).mul(h),
        tank.slice(1).reduce((sum, item) => sum + decimalScale(item![1].value), 0),
      )} m³; dung tích hữu ích ghi ${tank[0]![1].value} m³`,
    );
  }
  for (const [code, category, title, need] of config.specialized)
    add(
      'SCOPE.' + code,
      category,
      title,
      'requires_specialist',
      'Cần chuyên viên đánh giá căn cứ và phạm vi; kiểm tra tự động chưa thay thế thẩm định nội dung này.',
      [],
      [need],
    );
  const overview = legalOverview(value);
  const profile = overview.profile;
  add(
    'LAW.TIME',
    'Pháp lý và năng lực',
    'Chế độ pháp lý và phạm vi thẩm định',
    'requires_specialist',
    profile.label +
      '. ' +
      profile.reason +
      ' Phạm vi: ' +
      profile.scopeLabel +
      (profile.confirmed ? '. Chuyên viên đã xác nhận lựa chọn.' : '. Chưa có xác nhận của chuyên viên.'),
    [],
    [],
    '',
    profile.refs,
  );
  for (const item of overview.checklist)
    if (['missing', 'unknown'].includes(item.state))
      add(
        'LAW.INPUT.' + item.id,
        'Thành phần theo pháp luật',
        item.name,
        'insufficient_evidence',
        (item.state === 'unknown' ? 'Chưa xác định có thuộc trường hợp áp dụng. ' : 'Chưa liên kết tệp chứng cứ. ') +
          item.condition,
        [],
        [item.name],
        '',
        [item.legalRef],
      );
  if (profile.code === 'nd217') {
    add(
      'LAW.SCOPE',
      'Phạm vi thẩm định',
      'Phân biệt nhiệm vụ cơ quan chuyên môn và người quyết định đầu tư',
      'requires_specialist',
      overview.scopeNotes.join(' '),
      [],
      [],
      '',
      [ref('Điều 26–27 Luật 135/2025', LAW135), ref('Điều 38 NĐ 217/2026'), ref('Điều 7 NĐ 206/2026', ND206)],
    );
    add(
      'LAW.AUTHORITY',
      'Pháp lý và năng lực',
      'Xác định đúng cơ quan có thẩm quyền',
      'requires_specialist',
      'Cần loại, nhóm, cấp công trình chính, người quyết định đầu tư, địa bàn, phân cấp và lịch sử thẩm định; không suy ra chỉ từ tên tỉnh.',
      [],
      ['Căn cứ xác định thẩm quyền cụ thể'],
      '',
      [ref('Điều 32–33; khoản 7–9 Điều 76 NĐ 217/2026')],
    );
  }
  const unreviewed = facts.filter((fact) => fact.reviewStatus !== 'confirmed').length;
  if (unreviewed)
    add(
      'DATA.REVIEW',
      'Dữ liệu',
      'Dữ liệu cần chuyên viên xác nhận',
      'insufficient_evidence',
      `Còn ${unreviewed} trường dữ liệu chưa xác nhận. Các phép kiểm tra hiện là kết quả sơ bộ.`,
      [],
      ['Xác nhận các trường dữ liệu quan trọng'],
    );
  let delta = null;
  if (costVersions.length > 1) {
    const before = costVersions[0];
    const after = costVersions.at(-1)!;
    delta = {
      before: before.total,
      after: after.total,
      netSavings: new Decimal(before.total).minus(after.total).toFixed(),
      items: after.items.map((item, i) => ({
        name: item.name,
        before: before.items[i].value,
        after: item.value,
        difference: new Decimal(item.value).minus(before.items[i].value).toFixed(),
      })),
    };
  }
  return {
    id: uid(),
    createdAt: now(),
    ruleVersion: RULE_VERSION,
    mode,
    documentIds: [...active],
    stale: false,
    findings,
    costVersions,
    costComparison: delta,
    provider: 'deterministic',
    aiStatus: 'Chưa gọi mô hình AI; kết quả kiểm tra bằng quy tắc.',
    legalDate: value.legalDate,
    legalOverview: overview,
    revision: value.revision,
    aiNotes: [] as AiNote[],
  };
}
