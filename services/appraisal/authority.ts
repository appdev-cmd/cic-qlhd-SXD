import config from './data/authority.json' with { type: 'json' };
import { normalizeGrade, normalizeGroup } from './sla.js';
import type { Project } from './store.js';
const text = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase();
function get(project: Partial<Project>, ...keys: string[]): unknown {
  return keys.map((key) => project[key]).find((value) => value !== null && value !== undefined && value !== '') ?? null;
}
export function facts(project: Partial<Project>) {
  let investment = text(get(project, 'investment_form', 'investmentForm'));
  const tt39 = (project.tt39_data || {}) as Record<string, unknown>;
  if (!investment) {
    const source = text(tt39.projectType) + ' ' + text(tt39.fundingSource);
    investment = source.includes('đầu tư công') || source.includes('ngân sách') ? 'dau_tu_cong' : '';
  }
  const location = text(get(project, 'location_district', 'location'));
  return {
    field: text(get(project, 'field', 'projectField')),
    group: normalizeGroup(get(project, 'group_type', 'projectGroup')),
    grade: normalizeGrade(get(project, 'grade', 'buildingGrade')),
    investment: investment || null,
    commune: Boolean(get(project, 'decided_by_commune', 'decidedByCommune')),
    appendixIv: get(project, 'is_appendix_iv', 'isAppendixIv'),
    zone: config.ZONE_WORDS.some((word) => location.includes(word)),
    location,
  };
}
type Facts = ReturnType<typeof facts>;
export function appendixIv(f: Facts): [boolean | null, string] {
  if (f.appendixIv === true) return [true, 'Đã xác nhận thuộc Phụ lục IV'];
  const grade = (config.GRADE_RANK as Record<string, number>)[f.grade || ''];
  const field = f.field;
  if (grade === undefined) return [null, 'Chưa có cấp công trình'];
  if (['tôn giáo', 'tín ngưỡng'].some((word) => field.includes(word)))
    return [false, 'Công trình tôn giáo, tín ngưỡng không thuộc danh mục Phụ lục IV'];
  if (['kho', 'bãi'].some((word) => field.includes(word))) return [false, 'Kho, bãi không thuộc danh mục Phụ lục IV'];
  if (field.includes('đê điều')) return [true, 'V.2 Công trình đê điều (mọi cấp)'];
  if (['thủy lợi', 'hồ chứa', 'đập'].some((word) => field.includes(word))) {
    if (grade >= config.GRADE_RANK.II) return [true, 'V.1 Công trình thủy lợi (cấp II trở lên)'];
    if (grade === config.GRADE_RANK.III)
      return [null, 'V.1 Hồ chứa, đập ngăn nước cấp III thuộc Phụ lục IV — cần xác định loại công trình'];
    return [false, 'V.1 Công trình thủy lợi cấp IV'];
  }
  if (grade >= config.GRADE_RANK.II) {
    const item =
      field.includes('dân dụng') || field.includes('nhà ở')
        ? 'I Công trình dân dụng'
        : field.includes('giao thông')
          ? 'IV Công trình giao thông'
          : field.includes('hạ tầng')
            ? 'III Công trình hạ tầng kỹ thuật'
            : field.includes('công nghiệp')
              ? 'II Công trình công nghiệp'
              : 'Công trình cấp II trở lên';
    return [true, item + ' (cấp II trở lên — xác nhận hạng mục trong Phụ lục IV)'];
  }
  return field.includes('giao thông')
    ? [null, 'IV Cao tốc, đường sắt, hầm Metro áp dụng mọi cấp — cần xác định loại công trình']
    : [false, 'Công trình cấp III, IV ngoài các loại áp dụng mọi cấp'];
}
function speciality(f: Facts): [string | null, string] {
  if (config.AGRICULTURE_FIELDS.some((word) => f.field.includes(word)))
    return ['so_nnmt', 'Điểm b khoản 5 Điều 73 NĐ 217/2026'];
  if (config.SO_XD_FIELDS.some((word) => f.field.includes(word)))
    return [config.SO_XD, 'Điểm a khoản 5 Điều 73 NĐ 217/2026'];
  if (config.INDUSTRY_FIELDS.some((word) => f.field.includes(word)))
    return ['so_cong_thuong', 'Điểm c khoản 5 Điều 73 NĐ 217/2026 (trừ công nghiệp nhẹ, vật liệu xây dựng)'];
  return [null, 'Chưa có lĩnh vực/chuyên ngành của dự án'];
}
function result(authority: string, basis: string[], reasons: string[], missing: string[], suggestion: string) {
  return {
    authority,
    label: (config.LABELS as Record<string, string>)[authority],
    inScope: authority === 'chua_xac_dinh' ? null : authority === config.SO_XD,
    basis,
    reasons,
    missing,
    suggestion,
    requiresConfirmation: true,
  };
}
export function feasibility(f: Facts) {
  const missing = [
    ['nguồn vốn/hình thức đầu tư', f.investment],
    ['nhóm dự án', f.group],
    ['cấp công trình', f.grade],
    ['lĩnh vực', f.field],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key!);
  if (f.commune)
    return result(
      'ubnd_xa',
      ['Khoản 4 Điều 32 NĐ 217/2026'],
      ['Dự án do UBND cấp xã quyết định đầu tư.'],
      missing,
      'reject_intake',
    );
  if (f.group === 'QG' || f.grade === 'DB')
    return result(
      'bo_chuyen_nganh',
      ['Khoản 2 Điều 32 NĐ 217/2026'],
      ['Dự án quan trọng quốc gia hoặc có công trình cấp đặc biệt.'],
      missing,
      'reject_intake',
    );
  if (f.zone)
    return result(
      'bql_kcn',
      ['Khoản 3 Điều 32; điểm d khoản 5 Điều 73 NĐ 217/2026'],
      ['Địa điểm thuộc khu công nghiệp/khu kinh tế.'],
      missing,
      'confirm',
    );
  if (f.investment === 'kinh_doanh') {
    const [listed] = appendixIv(f);
    if (listed === false)
      return result(
        'khong_thuoc_dien',
        ['Điểm c khoản 1 Điều 27 Luật Xây dựng 135/2025', 'Điều 32 khoản 1 NĐ 217/2026'],
        ['Dự án kinh doanh không thuộc quy mô lớn và không có công trình Phụ lục IV.'],
        missing,
        'reject_intake',
      );
    if (listed === null) missing.push('xác nhận công trình thuộc Phụ lục IV');
  }
  const [authority, basis] = speciality(f);
  if (!authority) return result('chua_xac_dinh', ['Khoản 5 Điều 73 NĐ 217/2026'], [basis], missing, 'confirm');
  if (authority !== config.SO_XD)
    return result(authority, [basis], ['Chuyên ngành không thuộc Sở Xây dựng.'], missing, 'reject_intake');
  return result(
    config.SO_XD,
    ['Khoản 5 Điều 32 NĐ 217/2026', basis],
    ['Dự án trên địa bàn tỉnh thuộc chuyên ngành Sở Xây dựng.'],
    missing,
    missing.length ? 'confirm' : 'accept',
  );
}
export function permit(f: Facts, appraised = false, subtype?: string | null) {
  const missing = [
    ['cấp công trình', f.grade],
    ['nguồn vốn/hình thức đầu tư', f.investment],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key!);
  const existing = ['amendment', 'extension', 'reissue'].includes(subtype || '');
  if (!existing) {
    if (appraised)
      return result(
        'mien_phep',
        ['Điểm e khoản 2 Điều 43 Luật Xây dựng 135/2025'],
        ['Dự án đã được cơ quan chuyên môn về xây dựng thẩm định BCNCKT.'],
        missing,
        'redirect_start_notice',
      );
    if (f.investment === 'dau_tu_cong')
      return result(
        'mien_phep',
        ['Điểm b khoản 2 Điều 43 Luật Xây dựng 135/2025'],
        [
          'Công trình thuộc dự án đầu tư công do Chủ tịch UBND các cấp quyết định đầu tư (cần xác nhận người quyết định đầu tư).',
        ],
        missing,
        'redirect_start_notice',
      );
    const [listed, item] = appendixIv(f);
    if (f.investment === 'kinh_doanh' && listed)
      return result(
        'khong_thuoc_dien',
        ['Điểm c khoản 1 Điều 27, điểm e khoản 2 Điều 43 Luật Xây dựng 135/2025'],
        [
          'Dự án có công trình thuộc Phụ lục IV phải trình cơ quan chuyên môn thẩm định BCNCKT; sau khi thẩm định, công trình được miễn giấy phép (' +
            item +
            ').',
        ],
        missing,
        'reject_intake',
      );
  }
  if (f.zone)
    return result(
      'bql_kcn',
      ['Khoản 2 Điều 53 NĐ 217/2026'],
      ['Công trình trong khu công nghiệp/khu kinh tế.'],
      missing,
      'reject_intake',
    );
  if (['III', 'IV'].includes(f.grade || ''))
    return result(
      'ubnd_xa',
      ['Khoản 1 Điều 53 NĐ 217/2026'],
      ['Công trình cấp III, IV hoặc nhà ở riêng lẻ.'],
      missing,
      'reject_intake',
    );
  if (!f.grade)
    return result('chua_xac_dinh', ['Điều 53 NĐ 217/2026'], ['Chưa có cấp công trình.'], missing, 'confirm');
  return result(
    config.SO_XD,
    ['Khoản 3 Điều 53 NĐ 217/2026', ...(existing ? ['Điểm a khoản 4 Điều 53 NĐ 217/2026'] : [])],
    [
      existing
        ? 'Giấy phép do Sở cấp trước đây: Sở điều chỉnh, gia hạn, cấp lại.'
        : 'Công trình cấp II trở lên trên địa bàn tỉnh.',
    ],
    missing,
    missing.length ? 'confirm' : 'accept',
  );
}
export function inspection(f: Facts) {
  const missing = [
    ['cấp công trình', f.grade],
    ['lĩnh vực', f.field],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key!);
  const [listed, item] = appendixIv(f);
  if (f.grade === 'DB')
    return result(
      'bo_chuyen_nganh',
      ['Điểm b khoản 1 Điều 26 NĐ 207/2026'],
      ['Công trình cấp đặc biệt.'],
      missing,
      'reject_intake',
    );
  if (listed === false && f.investment !== 'dau_tu_cong')
    return result(
      'khong_thuoc_dien',
      ['Khoản 1 Điều 25 NĐ 207/2026'],
      ['Không thuộc công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng; chủ đầu tư tự tổ chức nghiệm thu.'],
      missing,
      'reject_intake',
    );
  if (listed === null) missing.push('xác nhận công trình thuộc Phụ lục IV NĐ 217/2026 (' + item + ')');
  const reasons = listed ? ['Công trình thuộc diện kiểm tra: ' + item + '.'] : [];
  if (f.investment === 'dau_tu_cong')
    reasons.push('Dự án do UBND tỉnh là cơ quan chủ quản (điểm e khoản 2 Điều 26) nếu được xác nhận.');
  return result(
    config.SO_XD,
    ['Điểm c khoản 1 Điều 26 NĐ 207/2026', 'Khoản 1 Điều 25 NĐ 207/2026'],
    reasons,
    missing,
    missing.length ? 'confirm' : 'accept',
  );
}
export function resolveAuthority(
  procedure: string,
  project: Partial<Project>,
  appraised = false,
  subtype?: string | null,
) {
  const f = facts(project);
  const resolved =
    procedure === 'gpxd' ? permit(f, appraised, subtype) : procedure === 'nghiem_thu' ? inspection(f) : feasibility(f);
  const [listed, item] = appendixIv(f);
  return {
    ...resolved,
    appendixIv: { listed, item },
    facts: {
      field: f.field,
      group: f.group,
      grade: f.grade,
      investment: f.investment,
      commune: f.commune,
      zone: f.zone,
    },
  };
}
