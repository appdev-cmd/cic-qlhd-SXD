import { formatNumber, formatDateTime } from '@/lib/utils';
// Periodic BIM report (month / quarter / year) of ONE project from the bim_bao_cao_ky RPC: tables for screen, HTML
// print window (In / PDF) and Word. Replaces cic-hud's corporate cross-project report (portfolio, facility 7D).
import type { Document } from 'docx';
import type { DocBlock } from './docxHelpers';

export type ReportPeriodKind = 'thang' | 'quy' | 'nam';
export interface ReportPeriod {
  kind: ReportPeriodKind;
  year: number;
  /** Month 1–12 (thang) or quarter 1–4 (quy); ignored for nam. */
  index: number;
}

/** Period bounds in Vietnam time: instants [from, to) and the inclusive dates sent to bim_bao_cao_ky. */
export function periodBounds(p: ReportPeriod): { from: Date; to: Date; tu: string; den: string; label: string } {
  const at = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - 7 * 3600000);
  const [m0, m1, label] =
    p.kind === 'thang'
      ? [p.index - 1, p.index, `tháng ${p.index}/${p.year}`]
      : p.kind === 'quy'
        ? [(p.index - 1) * 3, p.index * 3, `quý ${['I', 'II', 'III', 'IV'][p.index - 1]}/${p.year}`]
        : [0, 12, `năm ${p.year}`];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: at(p.year, m0),
    to: at(p.year, m1),
    tu: iso(new Date(Date.UTC(p.year, m0, 1))),
    den: iso(new Date(Date.UTC(p.year, m1, 0))),
    label,
  };
}

/** bim_bao_cao_ky result (contract keys). Any key can be missing or null when its source has no data. */
export interface PeriodicReportData {
  mo_hinh?: { tong: number; moi: number } | null;
  vuong_mac?: { mo_moi: number; dong: number; dang_mo: number; qua_han: number } | null;
  va_cham?: { dang_mo: number } | null;
  cde?: { de_trinh: number; da_duyet: number; tra_lai: number } | null;
  xac_minh_ifc?:
    | {
        model_id: string;
        file_name: string | null;
        diem_tong: number | null;
        dat: boolean | null;
        created_at: string;
      }[]
    | null;
  tien_do?: { tong: number; hoan_thanh: number; cham: number } | null;
  evm?: {
    ngay_chot: string;
    spi: number | null;
    cpi: number | null;
    bac: number | null;
    ev: number | null;
    ac: number | null;
  } | null;
  lenh_thay_doi?: { duyet_so: number; duyet_gia_tri: number; cho_so: number } | null;
  carbon?: { tong_kgco2e: number | null; so_cau_kien: number | null } | null;
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: string[][];
  note?: string;
}
export interface PeriodicReport {
  title: string;
  subtitle: string;
  tables: ReportTable[];
}

const n = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : formatNumber(Number(v), d);
const vnDate = (iso?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const NO_DATA = 'Chưa có dữ liệu trong kỳ.';
const kv = (title: string, rows: [string, string][] | null, note?: string): ReportTable => ({
  title,
  headers: ['Chỉ tiêu', 'Giá trị'],
  rows: rows ?? [[NO_DATA, '']],
  note,
});

export interface PeriodicReportInput {
  period: ReportPeriod;
  projectName: string;
  data: PeriodicReportData | null;
  /** Error of the RPC: every table then shows it instead of figures. */
  error?: string | null;
  now?: Date;
}

export function buildPeriodicReport(input: PeriodicReportInput): PeriodicReport {
  const { label, tu, den } = periodBounds(input.period);
  const d = input.data ?? {};
  const now = input.now ?? new Date();
  const fail = input.error ? ([[input.error, '']] as [string, string][]) : null;
  const tables: ReportTable[] = [];
  const pick = <T>(value: T | null | undefined, rows: (v: T) => [string, string][]) =>
    fail ?? (value ? rows(value) : null);

  tables.push(
    kv(
      'I. Mô hình',
      pick(d.mo_hinh, (v) => [
        ['Mô hình hiện hành', n(v.tong)],
        ['Phiên bản tải lên trong kỳ', n(v.moi)],
      ]),
    ),
  );
  tables.push(
    kv(
      'II. Vướng mắc và va chạm',
      fail ??
        (d.vuong_mac || d.va_cham
          ? [
              ['Vướng mắc mở mới trong kỳ', n(d.vuong_mac?.mo_moi)],
              ['Vướng mắc đóng trong kỳ', n(d.vuong_mac?.dong)],
              ['Đang mở cuối kỳ / quá hạn', `${n(d.vuong_mac?.dang_mo)} / ${n(d.vuong_mac?.qua_han)}`],
              ['Va chạm chưa xử lý', n(d.va_cham?.dang_mo)],
            ]
          : null),
    ),
  );
  tables.push(
    kv(
      'III. Môi trường dữ liệu chung (CDE)',
      pick(d.cde, (v) => [
        ['Đệ trình mới', n(v.de_trinh)],
        ['Được duyệt', n(v.da_duyet)],
        ['Bị trả lại', n(v.tra_lai)],
      ]),
      'Đệ trình tài liệu của dự án tạo trong kỳ (thư viện tài liệu ISO 19650).',
    ),
  );
  tables.push({
    title: 'IV. Xác minh mô hình IFC (lần chấm gần nhất)',
    headers: ['Mô hình', 'Điểm', 'Kết quả', 'Chấm ngày'],
    rows: fail
      ? [[input.error!, '', '', '']]
      : (d.xac_minh_ifc ?? []).map((s) => [
          s.file_name || s.model_id,
          n(s.diem_tong, 1),
          s.dat == null ? '—' : s.dat ? 'Đạt' : 'Chưa đạt',
          vnDate(s.created_at),
        ]),
  });
  tables.push(
    kv(
      'V. Tiến độ và chi phí',
      fail ??
        (d.tien_do || d.evm || d.lenh_thay_doi
          ? [
              [
                'Công việc (lá) / hoàn thành / chậm',
                `${n(d.tien_do?.tong)} / ${n(d.tien_do?.hoan_thanh)} / ${n(d.tien_do?.cham)}`,
              ],
              ['Kỳ EVM chốt gần nhất', d.evm ? vnDate(d.evm.ngay_chot) : 'Chưa chốt kỳ'],
              ['SPI / CPI', d.evm ? `${n(d.evm.spi, 3)} / ${n(d.evm.cpi, 3)}` : '—'],
              ['BAC / EV / AC (đồng)', d.evm ? `${n(d.evm.bac)} / ${n(d.evm.ev)} / ${n(d.evm.ac)}` : '—'],
              [
                'Lệnh thay đổi duyệt trong kỳ',
                `${n(d.lenh_thay_doi?.duyet_so)} (${n(d.lenh_thay_doi?.duyet_gia_tri)} đ)`,
              ],
              ['Lệnh thay đổi chờ duyệt', n(d.lenh_thay_doi?.cho_so)],
            ]
          : null),
      'Chậm: công việc quá ngày kết thúc kế hoạch chưa đạt 100 %. SPI, CPI dưới 0,9 là chậm tiến độ hoặc vượt chi phí.',
    ),
  );
  tables.push(
    kv(
      'VI. Bền vững 6D',
      pick(d.carbon, (v) => [
        ['Carbon ngầm A1–A3 (tCO₂e)', n(v.tong_kgco2e != null ? v.tong_kgco2e / 1000 : null, 2)],
        ['Cấu kiện đã tính', n(v.so_cau_kien)],
      ]),
      'Theo hệ số có nguồn; cấu kiện thiếu hệ số không tính là 0.',
    ),
  );

  return {
    title: `BÁO CÁO TÌNH HÌNH ỨNG DỤNG BIM ${label.toUpperCase()}`,
    subtitle: `${input.projectName} · từ ${vnDate(tu)} đến ${vnDate(den)} · lập lúc ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(now)}`,
    tables,
  };
}

const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Standalone HTML for the print window (In / PDF); all text is escaped. */
export function reportHtml(r: PeriodicReport): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
body{font-family:'Times New Roman',serif;font-size:13px;margin:24px;color:#1d1c1c}h1{font-size:16px;text-align:center;margin:0}
.brand{text-align:right;color:#666;font-style:italic;font-size:11px;margin:0 0 8px}
.sub{text-align:center;color:#555;margin:4px 0 16px}h2{font-size:14px;margin:16px 0 4px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e2f0eb}p.note{color:#555;font-style:italic;margin:4px 0}
@page{size:A4;margin:22mm 20mm 20mm 30mm}@media print{body{margin:0}section{page-break-inside:avoid}}</style></head><body>
<p class="brand">BuildSIA · Quản lý thông tin công trình (BIM)</p>
<h1>${esc(r.title)}</h1><p class="sub">${esc(r.subtitle)}</p>
${r.tables
  .map(
    (t) =>
      `<section><h2>${esc(t.title)}</h2><table><thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
        t.rows.length
          ? t.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${t.headers.length}">Không có dòng nào.</td></tr>`
      }</tbody></table>${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}</section>`,
  )
  .join('')}
</body></html>`;
}

export const periodicReportFileName = (period: ReportPeriod) =>
  `Bao_cao_BIM_${period.kind === 'nam' ? `nam_${period.year}` : `${period.kind}_${period.index}_${period.year}`}.docx`;

export async function buildPeriodicDocument(r: PeriodicReport): Promise<Document> {
  const h = await import('./docxHelpers');
  const children: DocBlock[] = [
    ...h.buildTitleBlock('BÁO CÁO', r.title.replace(/^BÁO CÁO /, '')),
    h.p(r.subtitle, { italics: true }),
  ];
  for (const t of r.tables) {
    children.push(h.pHeading(t.title));
    children.push(h.simpleTable(t.headers, t.rows));
    if (t.note) children.push(h.p(t.note, { italics: true, size: 20 }));
  }
  return h.buildDocument(children);
}

export async function exportReportDocx(r: PeriodicReport, fileName: string): Promise<void> {
  const [doc, { downloadDocx }] = await Promise.all([buildPeriodicDocument(r), import('./docxHelpers')]);
  await downloadDocx(doc, fileName);
}
