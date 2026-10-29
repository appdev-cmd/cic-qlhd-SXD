import { formatNumber, formatDateTime } from '@/lib/utils';
// BIM model report (quantities, preliminary 5D cost, information quality, open issues) and the weekly report: text
// lines for e-mail / meeting minutes and Word export. Word files are built in the browser; docx is loaded on demand so
// the viewer bundle does not carry it. Ported from cic-hud lib/bimReport without the facility (operations) section.
import type { Document } from 'docx';
import type { DocBlock } from './docxHelpers';
import type { BimCostRow, BimIssue, BimModel, BimQualityReport, BimQuantitySummaryRow } from '../types/bim.types';
import type { WeeklyReport, WeeklyReportContent } from '../services/BimFieldService';
import { getIfcLabel, disciplineLabels } from './ifcLabels';
import { COST_ISSUES, UNIT_LABELS, formatVnd } from './costing';

const num = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? '-' : formatNumber(Number(v), digits);
const n0 = (v: unknown) => formatNumber(Number(v || 0), 2);
/** yyyy-mm-dd[...] → dd/mm/yyyy without time-zone shifts. */
export const vnDate = (value?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (value ?? '');
};
const vnDateTime = (value: string | number | Date) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(value),
  );
const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// ── Tool usage labels (bim_su_dung.cong_cu) ────────────────────────────────────────────────────────────────────────
export const TOOL_LABELS: Record<string, string> = {
  mo_mo_hinh: 'Mở mô hình',
  mat_cat: 'Mặt cắt / hộp cắt',
  va_cham: 'Dò va chạm',
  goc_nhin: 'Góc nhìn đã lưu',
  mo_phong_4d: 'Mô phỏng tiến độ',
  ban_ve_2d: 'Bản vẽ cạnh mô hình',
  nen_ban_do: 'Nền bản đồ',
  ban_do_thu_nho: 'Bản đồ thu nhỏ',
  nhan_qr: 'Nhãn QR hiện trường',
  so_sanh_split: 'So sánh phiên bản song song',
  so_sanh_slider: 'So sánh phiên bản thanh trượt',
  bang_tree: 'Cây cấu kiện',
  bang_properties: 'Thuộc tính cấu kiện',
  bang_sets: 'Bộ chọn thông minh',
  bang_quantities: 'Bảng khối lượng',
  bang_issues: 'Vướng mắc',
  bang_analytics: 'Phân tích',
  bang_ai: 'Trợ lý AI',
};
export const toolLabel = (key: string) =>
  TOOL_LABELS[key] ||
  (key.startsWith('do_')
    ? `Đo ${key.slice(3)}`
    : key.startsWith('to_mau_')
      ? `Tô màu: ${key.slice(7)}`
      : key.startsWith('bang_')
        ? `Bảng ${key.slice(5)}`
        : key);

// ── BIM model report ───────────────────────────────────────────────────────────────────────────────────────────────
export interface BimReportInput {
  projectName: string;
  model: BimModel;
  /** Models shown together (federated) when the report was made. */
  federatedModels?: BimModel[];
  quantities: BimQuantitySummaryRow[];
  costRows?: BimCostRow[];
  costTotal?: number;
  quality?: BimQualityReport | null;
  issues?: BimIssue[];
  preparedBy?: string;
  scopeLabel?: string;
  sourceAt?: number;
  /** Elements counted from a capped read (figures cover part of the models). */
  truncatedNote?: string | null;
}

/** Quantities per IFC class, largest volume first. */
export const groupQuantities = (rows: BimQuantitySummaryRow[]) => {
  const map = new Map<
    string,
    { so_luong: number; the_tich: number; dien_tich: number; chieu_dai: number; trong_luong: number; uoc_tinh: boolean }
  >();
  for (const r of rows) {
    const cur = map.get(r.loai_cau_kien) || {
      so_luong: 0,
      the_tich: 0,
      dien_tich: 0,
      chieu_dai: 0,
      trong_luong: 0,
      uoc_tinh: false,
    };
    cur.so_luong += r.so_luong ?? 0;
    cur.the_tich += r.tong_the_tich ?? 0;
    cur.dien_tich += r.tong_dien_tich ?? 0;
    cur.chieu_dai += r.tong_chieu_dai ?? 0;
    cur.trong_luong += r.tong_trong_luong ?? 0;
    cur.uoc_tinh ||= !!r.co_uoc_tinh_hinh_hoc;
    map.set(r.loai_cau_kien, cur);
  }
  return [...map.entries()].sort((a, b) => b[1].the_tich - a[1].the_tich || b[1].so_luong - a[1].so_luong);
};

const ISSUE_TYPE: Record<string, string> = {
  va_cham: 'Va chạm',
  thiet_ke: 'Thiết kế',
  hien_truong: 'Hiện trường',
  giai_phong_mat_bang: 'GPMB',
};
const PRIORITY: Record<string, string> = { critical: 'Rất cao', high: 'Cao', normal: 'Bình thường', low: 'Thấp' };
const STATUS: Record<string, string> = {
  open: 'Mới',
  in_progress: 'Đang xử lý',
  resolved: 'Đã xử lý',
  closed: 'Đã đóng',
};
const PARTY: Record<string, string> = {
  chu_dau_tu: 'Chủ đầu tư',
  tu_van_thiet_ke: 'Tư vấn thiết kế',
  tu_van_giam_sat: 'Tư vấn giám sát',
  nha_thau: 'Nhà thầu',
  khac: 'Khác',
};

export const bimReportFileName = (model: Pick<BimModel, 'file_name'>, now = new Date()) =>
  `Bao_cao_BIM_${model.file_name.replace(/\.[^.]+$/, '')}_${today(now)}.docx`;

export async function buildBimReportDocument(input: BimReportInput, now = new Date()): Promise<Document> {
  const h = await import('./docxHelpers');
  const { AlignmentType: A } = h;
  const { projectName, model, federatedModels, quantities, costRows, costTotal, quality, issues, preparedBy } = input;
  const children: DocBlock[] = [];
  let section = 0;
  const heading = (text: string) => h.pHeading(`${ROMAN[section++]}. ${text}`);

  children.push(...h.buildTitleBlock('BÁO CÁO', `Khai thác mô hình thông tin công trình (BIM) — ${projectName}`));
  if (input.scopeLabel) children.push(h.p(`Phạm vi dữ liệu: ${input.scopeLabel}`));
  if (input.sourceAt)
    children.push(
      h.p(
        `Dữ liệu IFC cập nhật: ${vnDateTime(input.sourceAt)}. Khối lượng ước tính và phần thiếu đơn giá phải được kiểm tra trước khi sử dụng.`,
      ),
    );
  if (input.truncatedNote) children.push(h.p(input.truncatedNote, { italics: true, size: 22 }));

  children.push(heading('THÔNG TIN MÔ HÌNH'));
  children.push(
    ...[
      ['Tên tệp mô hình', model.file_name],
      ['Phiên bản', `v${model.phien_ban ?? 1}${model.ghi_chu_phien_ban ? ` — ${model.ghi_chu_phien_ban}` : ''}`],
      ['Bộ môn', disciplineLabels[model.discipline] || model.discipline],
      ['Lược đồ IFC', model.ifc_schema || 'Không xác định'],
      ['Phần mềm tạo lập', model.phan_mem_tao || 'Không xác định'],
      ['Số cấu kiện', n0(model.element_count)],
      ['Ngày tải lên', vnDate(model.created_at)],
    ].map(([k, v]) => h.p(`- ${k}: ${v}`, { indent: 12.7 })),
  );
  if (federatedModels && federatedModels.length > 1) {
    children.push(h.p('Số liệu dưới đây tổng hợp trên các mô hình được ghép hiển thị:', { indent: 12.7, before: 60 }));
    children.push(
      ...federatedModels.map((m) =>
        h.p(
          `+ ${m.file_name} (v${m.phien_ban ?? 1} · ${disciplineLabels[m.discipline] || m.discipline} · ${n0(m.element_count)} cấu kiện)`,
          { indent: 12.7 },
        ),
      ),
    );
  }

  children.push(heading('TỔNG HỢP KHỐI LƯỢNG THEO LOẠI CẤU KIỆN'));
  children.push(
    h.simpleTable(
      [
        'TT',
        'Loại cấu kiện',
        'Số lượng',
        'Thể tích (m³)',
        'Diện tích (m²)',
        'Chiều dài (m)',
        'Khối lượng (kg)',
        'Nguồn',
      ],
      groupQuantities(quantities).map(([cat, v], i) => [
        String(i + 1),
        getIfcLabel(cat),
        num(v.so_luong, 0),
        num(v.the_tich),
        num(v.dien_tich),
        num(v.chieu_dai),
        num(v.trong_luong, 0),
        v.uoc_tinh ? 'Có ước tính từ hình học' : 'Bộ số lượng IFC',
      ]),
      [A.CENTER, A.LEFT, A.RIGHT, A.RIGHT, A.RIGHT, A.RIGHT, A.RIGHT, A.LEFT],
    ),
  );
  const lacking = (key: 'thieu_the_tich' | 'thieu_dien_tich', value: 'tong_the_tich' | 'tong_dien_tich') =>
    quantities.filter((r) => (r[key] ?? (r[value] === null ? 1 : 0)) > 0).length;
  children.push(
    h.p(
      `${quantities.length} nhóm khối lượng; thiếu thể tích ở ${lacking('thieu_the_tich', 'tong_the_tich')} nhóm, thiếu diện tích ở ${lacking('thieu_dien_tich', 'tong_dien_tich')} nhóm. Các tổng chỉ cộng phần có dữ liệu; mô hình ghép nhiều bộ môn cần kiểm tra trùng phạm vi.`,
      { italics: true, size: 22 },
    ),
  );
  children.push(
    h.p(
      'Khối lượng lấy từ bộ số lượng (Quantity Set) của tệp IFC; phần không có được ước tính từ hình học và chỉ để tham khảo.',
      {
        italics: true,
        size: 22,
        after: 200,
      },
    ),
  );

  if (costRows?.length) {
    children.push(heading('BÓC TÁCH CHI PHÍ SƠ BỘ TỪ MÔ HÌNH (5D)'));
    children.push(
      h.simpleTable(
        [
          'TT',
          'Loại cấu kiện',
          'Vật liệu',
          'Vị trí',
          'Mã định mức',
          'Khối lượng',
          'Đơn vị',
          'Đơn giá (₫)',
          'Thành tiền / Tình trạng',
        ],
        costRows.map((r, i) => [
          String(i + 1),
          getIfcLabel(r.loai_cau_kien),
          r.vat_lieu || '-',
          r.phan_doan_tang || '-',
          r.ma_dinh_muc || '-',
          num(r.khoi_luong),
          r.don_vi ? UNIT_LABELS[r.don_vi] : '-',
          num(r.don_gia, 0),
          r.issue ? COST_ISSUES[r.issue] : num(r.thanh_tien, 0),
        ]),
        [A.CENTER, A.LEFT, A.LEFT, A.LEFT, A.LEFT, A.RIGHT, A.CENTER, A.RIGHT, A.RIGHT],
      ),
    );
    children.push(
      h.p(`Tổng phần đã tính được: ${formatNumber(costTotal || 0, 2)} ₫ (${formatVnd(costTotal || 0)})`, {
        bold: true,
        alignment: A.RIGHT,
        before: 120,
      }),
    );
    const unpriced = costRows.filter((r) => r.thanh_tien === null).length;
    if (unpriced)
      children.push(
        h.p(`Còn ${unpriced} nhóm thiếu dữ liệu hoặc đơn giá chưa rõ, chưa tính vào tổng trên.`, {
          italics: true,
          size: 22,
        }),
      );
  }

  if (quality) {
    children.push(heading('KIỂM TRA CHẤT LƯỢNG THÔNG TIN MÔ HÌNH'));
    children.push(
      h.p(`Điểm chất lượng thông tin: ${quality.score}/100 trên ${n0(quality.totalElements)} cấu kiện được kiểm tra.`, {
        after: 120,
      }),
    );
    children.push(
      h.simpleTable(
        ['TT', 'Nội dung kiểm tra', 'Mức độ', 'Số cấu kiện', 'Tỷ lệ'],
        quality.rules.map((r, i) => [
          String(i + 1),
          r.label,
          r.severity === 'loi' ? 'Lỗi' : r.severity === 'canh_bao' ? 'Cảnh báo' : 'Thông tin',
          n0(r.count),
          quality.totalElements ? `${((r.count / quality.totalElements) * 100).toFixed(1)}%` : '-',
        ]),
        [A.CENTER, A.LEFT, A.CENTER, A.RIGHT, A.RIGHT],
      ),
    );
  }

  const open = (issues ?? []).filter((i) => i.status !== 'closed' && i.status !== 'resolved');
  if (open.length) {
    children.push(heading('VƯỚNG MẮC PHỐI HỢP CÒN MỞ'));
    children.push(
      h.simpleTable(
        ['TT', 'Nội dung', 'Loại', 'Ưu tiên', 'Trạng thái', 'Đơn vị xử lý', 'Hạn xử lý'],
        open
          .slice(0, 100)
          .map((it, i) => [
            String(i + 1),
            it.title,
            ISSUE_TYPE[it.issue_type] ?? it.issue_type,
            PRIORITY[it.priority] ?? it.priority,
            STATUS[it.status] ?? it.status,
            (it.don_vi_xu_ly && PARTY[it.don_vi_xu_ly]) || it.assigned_to_name || '-',
            it.due_date ? vnDate(it.due_date) : '-',
          ]),
        [A.CENTER, A.LEFT, A.CENTER, A.CENTER, A.CENTER, A.LEFT, A.CENTER],
      ),
    );
    if (open.length > 100) children.push(h.p(`Hiển thị 100/${open.length} vướng mắc mở.`, { italics: true, size: 22 }));
  }

  children.push(h.pEmpty(400));
  children.push(
    h.p(`Báo cáo lập lúc ${vnDateTime(now)}${preparedBy ? ` · Người lập: ${preparedBy}` : ''}.`, {
      italics: true,
      size: 22,
      alignment: A.RIGHT,
    }),
  );
  return h.buildDocument(children);
}

export async function exportBimReportDocx(input: BimReportInput): Promise<void> {
  const now = new Date();
  const [doc, { downloadDocx }] = await Promise.all([buildBimReportDocument(input, now), import('./docxHelpers')]);
  await downloadDocx(doc, bimReportFileName(input.model, now));
}

// ── Weekly report ──────────────────────────────────────────────────────────────────────────────────────────────────
const pendingSection = (index: number, label: string) =>
  `${index}. ${label}: báo cáo lập trước khi có mục này, hãy tạo lại tuần.`;

export function scheduleLine(c: WeeklyReportContent, index = 7): string {
  const t = c.tien_do;
  if (!t) return pendingSection(index, 'Tiến độ');
  return `${index}. Tiến độ: ${n0(t.tong)} công việc · ${n0(t.hoan_thanh)} hoàn thành · ${n0(t.cham)} chậm so với kế hoạch`;
}
export function costLine(c: WeeklyReportContent, index = 8): string {
  const k = c.chi_phi;
  if (!k) return pendingSection(index, 'Chi phí');
  return `${index}. Chi phí: ${n0(k.lenh_duyet_so)} lệnh thay đổi được duyệt (${n0(k.lenh_duyet_gia_tri)} đ) · ${n0(k.lenh_cho_so)} lệnh chờ duyệt · ${n0(k.hop_dong_ky_so)} hợp đồng ký trong tuần`;
}

/** Plain text of a weekly report (header, sections 1–8, footer). `issueList: false` leaves out the new-issue bullets. */
export function weeklyReportLines(r: WeeklyReport, opts: { projectName?: string; issueList?: boolean } = {}): string[] {
  const c = r.noi_dung;
  const issueList = opts.issueList ?? true;
  return [
    `BÁO CÁO TUẦN MÔ HÌNH BIM — ${opts.projectName || c.ten_du_an || r.project_id}`,
    `Tuần ${vnDate(c.tu_ngay)} – ${vnDate(c.den_ngay)}`,
    'Sự kiện theo tuần; trạng thái và chất lượng tại lúc lập báo cáo.',
    '',
    `1. Vướng mắc: ${n0(c.vuong_mac.moi)} mới · ${n0(c.vuong_mac.da_xu_ly)} đã xử lý · ${n0(c.vuong_mac.dang_mo)} đang mở (${n0(c.vuong_mac.qua_han)} quá hạn, ${n0(c.vuong_mac.uu_tien_cao)} ưu tiên cao)`,
    ...(issueList
      ? (c.vuong_mac.danh_sach_moi ?? [])
          .slice(0, 10)
          .map((i) => `   - ${i.tieu_de}${i.nguoi_xu_ly ? ` (${i.nguoi_xu_ly})` : ''}`)
      : []),
    `2. Va chạm: ${n0(c.va_cham.phien_moi)} phiên dò mới, ${n0(c.va_cham.so_va_cham_moi)} va chạm phát hiện` +
      (c.va_cham.phien_gan_nhat
        ? ` · gần nhất: ${c.va_cham.phien_gan_nhat.ten} (${n0(c.va_cham.phien_gan_nhat.so_va_cham)} va chạm, ${vnDate(c.va_cham.phien_gan_nhat.ngay)})`
        : ''),
    `3. Mô hình: ${n0(c.mo_hinh.tai_len_trong_tuan)} tải lên trong tuần · ${n0(c.mo_hinh.san_sang)} sẵn sàng · ${n0(c.mo_hinh.dang_xu_ly)} đang xử lý · ${n0(c.mo_hinh.loi)} lỗi`,
    ...(c.mo_hinh.ten_moi ?? []).map((t) => `   - ${t}`),
    `4. Chất lượng dữ liệu: ${c.chat_luong.ty_le_khai_bao != null ? `${c.chat_luong.ty_le_khai_bao}% cấu kiện có khối lượng khai báo` : 'chưa có thống kê'}` +
      (c.chat_luong.ty_le_vat_lieu != null ? ` · ${c.chat_luong.ty_le_vat_lieu}% có vật liệu` : '') +
      (c.chat_luong.so_mo_hinh_cu ? ` · ${n0(c.chat_luong.so_mo_hinh_cu)} mô hình cần chuyển đổi lại` : ''),
    `5. Nghiệm thu gắn cấu kiện: ${n0(c.nghiem_thu.bien_ban_moi)} biên bản mới · ${n0(c.nghiem_thu.dat)} đạt · ${n0(c.nghiem_thu.khong_dat)} không đạt · ${n0(c.nghiem_thu.cho_ket_luan)} chờ kết luận`,
    `6. Mức sử dụng: ${n0(c.su_dung.luot)} lượt · ${n0(c.su_dung.nguoi_dung)} người dùng` +
      ((c.su_dung.cong_cu ?? []).length
        ? ` · ${c.su_dung.cong_cu.map((t) => `${toolLabel(t.cong_cu)} (${n0(t.so_lan)})`).join(', ')}`
        : ''),
    scheduleLine(c),
    costLine(c),
    '',
    `Tạo lúc ${vnDateTime(r.tao_luc)}${c.tu_dong ? ' (tự động)' : ''}`,
  ];
}
export const weeklyReportText = (r: WeeklyReport, projectName?: string) =>
  weeklyReportLines(r, { projectName }).join('\n');

export const weeklyReportFileName = (r: Pick<WeeklyReport, 'tuan_bat_dau'>) =>
  `Bao_cao_tuan_BIM_${r.tuan_bat_dau}.docx`;

export async function buildWeeklyReportDocument(r: WeeklyReport, projectName?: string): Promise<Document> {
  const h = await import('./docxHelpers');
  const { AlignmentType: A } = h;
  const c = r.noi_dung;
  const name = projectName || c.ten_du_an || r.project_id;
  const lines = weeklyReportLines(r, { projectName: name, issueList: false });
  const children: DocBlock[] = [
    ...h.buildTitleBlock('BÁO CÁO TUẦN', `Mô hình thông tin công trình (BIM) — ${name}`),
    h.p(`Tuần ${vnDate(c.tu_ngay)} – ${vnDate(c.den_ngay)}. ${lines[2]}`, { italics: true }),
    // Body: the numbered sections and their bullets, without the text header and footer.
    ...lines
      .slice(4, -2)
      .filter(Boolean)
      .map((line) => (line.startsWith('   ') ? h.p(line.trim(), { indent: 12.7 }) : h.p(line))),
  ];
  const issues = c.vuong_mac.danh_sach_moi ?? [];
  if (issues.length) {
    children.push(h.pHeading('VƯỚNG MẮC MỚI TRONG TUẦN'));
    children.push(
      h.simpleTable(
        ['TT', 'Nội dung', 'Ưu tiên', 'Trạng thái', 'Người xử lý'],
        issues.map((i, idx) => [
          String(idx + 1),
          i.tieu_de,
          PRIORITY[i.uu_tien] ?? i.uu_tien,
          STATUS[i.trang_thai] ?? i.trang_thai,
          i.nguoi_xu_ly || '-',
        ]),
        [A.CENTER, A.LEFT, A.CENTER, A.CENTER, A.LEFT],
      ),
    );
  }
  children.push(h.pEmpty(300));
  children.push(h.p(lines[lines.length - 1], { italics: true, size: 22, alignment: A.RIGHT }));
  return h.buildDocument(children);
}

export async function exportWeeklyReportDocx(r: WeeklyReport, projectName?: string): Promise<void> {
  const [doc, { downloadDocx }] = await Promise.all([
    buildWeeklyReportDocument(r, projectName),
    import('./docxHelpers'),
  ]);
  await downloadDocx(doc, weeklyReportFileName(r));
}
