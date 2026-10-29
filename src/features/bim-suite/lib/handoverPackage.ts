import {formatDate as sxdFormatDate} from '@/lib/utils';
import { formatNumber, formatDateTime } from '@/lib/utils';
// Closeout package: ZIP with an Excel index (lib/xlsxWrite.ts), a Word review report (docx 9.9), the raw JSON data
// and a SHA-256 list of every file. Runs in the browser and in Node (tests). Replaces cic-hud exceljs/file-saver.
import JSZip from 'jszip';
import { AlignmentType, Packer } from 'docx';
import {
  buildDocument,
  buildTitleBlock,
  downloadBlob,
  p,
  pHeading,
  safeFileName,
  simpleTable,
  type DocBlock,
} from './docxHelpers';
import { writeXlsx } from './xlsxWrite';
import {
  ASSET_FIELDS,
  HANDOVER_BASIS,
  NHOM_MAU_09,
  STATUS_LABELS,
  assetCompleteness,
  checklistTotals,
  dmy,
  evaluateHandover,
  handoverModels,
  itemQualifier,
  latestAcceptances,
  type ChecklistRow,
  type HandoverData,
} from './handoverChecklist';

export { HANDOVER_BASIS };

export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PackageFile {
  path: string;
  mo_ta: string;
  bytes: Uint8Array;
  sha256: string;
}
export interface HandoverPackage {
  zip: Uint8Array;
  sha256: string;
  files: Omit<PackageFile, 'bytes'>[];
  checklist: ChecklistRow[];
  totals: ReturnType<typeof checklistTotals>;
  ten: string;
}

export const PACKAGE_SHEETS = [
  'Mục lục',
  'Phụ lục VII',
  'Tài liệu CDE',
  'Tài sản',
  'Bàn giao',
  'Mô hình và LOD',
  'Nghiệm thu',
  'Vướng mắc đã đóng',
] as const;

type Cell = string | number | null;
const NT_CAP: Record<string, string> = { cong_viec: 'Công việc', giai_doan: 'Giai đoạn', hoan_thanh: 'Hoàn thành' };
const NT_KL: Record<string, string> = { dat: 'Đạt', dat_co_dieu_kien: 'Đạt có điều kiện', khong_dat: 'Không đạt' };
const projectName = (d: HandoverData) => String(d.du_an?.ten ?? d.du_an?.id ?? 'Dự án');
const vnTime = (iso: string) => formatDateTime(new Date(iso));
const lodText = (d: HandoverData, modelId: string) => {
  const l = (d.lod ?? []).find((x) => x.model_id === modelId);
  return l ? `${l.dat ? 'Đạt' : 'Chưa đạt'} (${l.trong_pham_vi}/${l.cau_kien} cấu kiện)` : 'chưa đánh giá';
};
const ifcText = (d: HandoverData, modelId: string) => {
  const x = (d.xac_minh_ifc ?? []).find((v) => v.model_id === modelId);
  return x ? `${x.dat ? 'Đạt' : 'Chưa đạt'} (${x.diem_tong ?? '?'}/${x.diem_toi_thieu ?? '?'})` : 'chưa xác minh';
};

async function buildWorkbook(
  d: HandoverData,
  checklist: ChecklistRow[],
  inner: Omit<PackageFile, 'bytes'>[],
): Promise<Uint8Array> {
  const index: Cell[][] = [['Tệp trong gói', 'Nội dung', 'SHA-256'], ...inner.map((f) => [f.path, f.mo_ta, f.sha256])];
  index.push(
    [],
    ['Dự án', projectName(d), null],
    ['Lập lúc', vnTime(d.lap_luc), null],
    ['Căn cứ', HANDOVER_BASIS, null],
  );

  const cl: Cell[][] = [
    ['Mục', 'Thành phần hồ sơ', 'Áp dụng', 'Trạng thái', 'Nhóm mẫu 09', 'Căn cứ trong hệ thống'],
    ...checklist.map((r) => [
      r.ma,
      r.noi_dung,
      r.bat_buoc ? 'bắt buộc' : itemQualifier(r),
      STATUS_LABELS[r.trang_thai],
      `${r.nhom09}. ${NHOM_MAU_09[r.nhom09] ?? ''}`,
      r.can_cu.join('\n') || 'chưa có',
    ]),
  ];

  const cde: Cell[][] = [
    ['Mã tệp', 'Tiêu đề', 'Loại', 'Vùng', 'Mã phù hợp', 'Sửa đổi', 'Mục Phụ lục VII'],
    ...(d.cde ?? []).map((c) => [c.ma, c.ten, c.loai, c.vung, c.ma_phu_hop, c.sua_doi, c.muc]),
  ];

  const assets = d.tai_san ?? [];
  const comp = assetCompleteness(assets);
  const ts: Cell[][] = [
    [...ASSET_FIELDS.map((f) => f.label), 'Phòng', 'Đầy đủ dữ liệu'],
    ...assets.map((a, i) => [
      ...ASSET_FIELDS.map((f): Cell => {
        const v = a[f.key];
        if (f.key === 'co_tai_lieu') return v ? 'có' : 'chưa có';
        return v === null || v === undefined ? null : typeof v === 'number' ? v : String(v);
      }),
      a.phong,
      `${Math.round(comp.per[i] * 100)}%`,
    ]),
  ];

  const bg: Cell[][] = [
    ['Hệ thống', 'Mục', 'Loại', 'Bắt buộc', 'Xong', 'Ngày', 'Ghi chú'],
    ...(d.ban_giao ?? []).map((b) => [
      b.he_thong,
      b.muc,
      b.loai,
      b.bat_buoc ? 'x' : '',
      b.xong ? 'x' : '',
      dmy(b.ngay),
      b.ghi_chu,
    ]),
  ];

  const mh: Cell[][] = [
    ['Mô hình', 'Tệp', 'Bộ môn', 'Phiên bản', 'Cấu kiện', 'LOD 500', 'Xác minh IFC'],
    ...handoverModels(d).map((m) => [
      m.id,
      m.tep,
      m.bo_mon,
      m.phien_ban,
      m.cau_kien,
      lodText(d, m.id),
      ifcText(d, m.id),
    ]),
  ];

  const nt: Cell[][] = [
    ['Cấp', 'Tên', 'Hạng mục', 'Ngày', 'Kết luận'],
    ...latestAcceptances(d.nghiem_thu ?? []).map((x) => [
      NT_CAP[x.cap] ?? x.cap,
      x.ten,
      x.hang_muc,
      dmy(x.ngay),
      NT_KL[x.ket_luan ?? ''] ?? 'chưa kết luận',
    ]),
  ];

  const closed = d.van_de?.da_dong ?? [];
  const vd: Cell[][] = [
    ['Số', 'Nội dung', 'Loại', 'Đóng ngày'],
    ...(closed.length ? closed.map((x) => [x.so, x.ten, x.loai, dmy(x.dong_luc)]) : [[null, 'chưa có', null, null]]),
  ];

  return writeXlsx(
    [index, cl, cde, ts, bg, mh, nt, vd].map((rows, i) => ({ name: PACKAGE_SHEETS[i], rows, header: true, width: 24 })),
  );
}

async function buildReport(d: HandoverData, checklist: ChecklistRow[]): Promise<Uint8Array> {
  const t = checklistTotals(checklist);
  const assets = d.tai_san ?? [];
  const comp = assetCompleteness(assets);
  const children: DocBlock[] = [...buildTitleBlock('Báo cáo', `Rà soát gói hồ sơ bàn giao — ${projectName(d)}`)];
  children.push(
    p(
      `Lập tự động ngày ${sxdFormatDate(new Date(d.lap_luc))} từ dữ liệu phân hệ BIM. ${HANDOVER_BASIS}`,
    ),
  );
  children.push(pHeading('I. THÔNG TIN CHUNG'));
  children.push(p(`- Dự án: ${projectName(d)}`));
  children.push(p(`- Mô hình đưa vào gói: ${handoverModels(d).length}; tài sản, thiết bị: ${assets.length}.`));
  children.push(pHeading('II. KẾT QUẢ ĐỐI CHIẾU DANH MỤC PHỤ LỤC VII'));
  children.push(
    p(
      `${checklist.length} thành phần: ${t.du} đủ, ${t.chua_du} chưa đủ, ${t.chua_co} chưa có. Thành phần bắt buộc (không thuộc diện "nếu có", có điều kiện hoặc hồ sơ khác) còn thiếu hoặc chưa đủ: ${t.bat_buoc_thieu}.`,
    ),
  );
  children.push(
    p(
      '"Đủ" chỉ khi có tài liệu gắn mục trong CDE đã phát hành với mã A1–A5 hoặc CR, hoặc mọi biên bản nghiệm thu đã kết luận đạt. Mục "nếu có" hoặc có điều kiện mà không áp dụng thì chủ đầu tư ghi rõ lý do.',
      { italics: true },
    ),
  );
  children.push(
    simpleTable(
      ['Mục', 'Thành phần hồ sơ', 'Trạng thái', 'Căn cứ trong hệ thống'],
      checklist.map((r) => [
        r.ma,
        `${r.noi_dung}${itemQualifier(r) ? ` ${itemQualifier(r)}` : ''}`,
        STATUS_LABELS[r.trang_thai],
        r.can_cu.join('\n') || 'chưa có',
      ]),
      [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.LEFT],
    ),
  );
  children.push(pHeading('III. DỮ LIỆU VẬN HÀNH'));
  children.push(
    p(
      `- Tài sản, thiết bị: ${assets.length}; độ đầy đủ dữ liệu trung bình ${Math.round(comp.mean * 100)}% (${ASSET_FIELDS.length} trường).`,
    ),
  );
  const weak = comp.byField
    .filter((f) => assets.length && f.filled < assets.length)
    .map((f) => `${f.label} ${f.filled}/${assets.length}`);
  if (weak.length) children.push(p(`- Trường còn thiếu: ${weak.join('; ')}.`));
  const bg = d.ban_giao ?? [];
  children.push(p(`- Checklist bàn giao theo hệ thống: ${bg.filter((b) => b.xong).length}/${bg.length} mục xong.`));
  children.push(pHeading('IV. MÔ HÌNH HOÀN CÔNG, LOD 500 VÀ XÁC MINH IFC'));
  children.push(
    simpleTable(
      ['Mô hình', 'Bộ môn', 'Phiên bản', 'LOD 500', 'Xác minh IFC'],
      handoverModels(d).map((m) => [
        m.tep || m.id,
        m.bo_mon ?? '',
        String(m.phien_ban ?? ''),
        lodText(d, m.id),
        ifcText(d, m.id),
      ]),
    ),
  );
  children.push(pHeading('V. TỆP KÈM THEO'));
  children.push(
    p(
      '00_MUC_LUC.xlsx: mục lục và các bảng chi tiết; du_lieu/goi_ban_giao.json: dữ liệu gốc lúc lập; SHA256SUMS.txt: mã băm từng tệp.',
    ),
  );
  return new Uint8Array(await Packer.toArrayBuffer(buildDocument(children)));
}

export async function buildHandoverPackage(d: HandoverData): Promise<HandoverPackage> {
  const checklist = evaluateHandover(d);
  const enc = new TextEncoder();
  const ten = `Gói bàn giao ${projectName(d)} ${dmy(d.lap_luc.slice(0, 10))}`;
  const make = async (path: string, mo_ta: string, bytes: Uint8Array): Promise<PackageFile> => ({
    path,
    mo_ta,
    bytes,
    sha256: await sha256Hex(bytes),
  });
  const readme = [
    ten,
    HANDOVER_BASIS,
    'Kiểm tra toàn vẹn: so mã SHA-256 của từng tệp với SHA256SUMS.txt; mã của cả tệp ZIP ghi trong sổ gói bàn giao của phân hệ BIM.',
  ].join('\n');
  const parts: PackageFile[] = [
    await make('README.txt', 'Giới thiệu gói', enc.encode(readme)),
    await make('01_BAO_CAO_BAN_GIAO.docx', 'Báo cáo rà soát gói hồ sơ bàn giao', await buildReport(d, checklist)),
    await make('du_lieu/goi_ban_giao.json', 'Dữ liệu gốc lúc lập gói', enc.encode(JSON.stringify(d, null, 2))),
  ];
  const index = await make(
    '00_MUC_LUC.xlsx',
    'Mục lục, đối chiếu Phụ lục VII, tài liệu CDE, tài sản, bàn giao, mô hình, nghiệm thu, vướng mắc',
    await buildWorkbook(
      d,
      checklist,
      parts.map((f) => ({ path: f.path, mo_ta: f.mo_ta, sha256: f.sha256 })),
    ),
  );
  const all = [index, ...parts];
  const sums = all.map((f) => `${f.sha256}  ${f.path}`).join('\n') + '\n';
  const zip = new JSZip();
  const date = new Date(d.lap_luc);
  for (const f of all) zip.file(f.path, f.bytes, { date });
  zip.file('SHA256SUMS.txt', sums, { date });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return {
    zip: bytes,
    sha256: await sha256Hex(bytes),
    files: all.map((f) => ({ path: f.path, mo_ta: f.mo_ta, sha256: f.sha256 })),
    checklist,
    totals: checklistTotals(checklist),
    ten,
  };
}

export const handoverZipName = (pkg: Pick<HandoverPackage, 'ten' | 'sha256'>) =>
  `${safeFileName(pkg.ten)}_${pkg.sha256.slice(0, 8)}.zip`;

/** Saves the ZIP through an object URL (no file-saver). */
export function downloadHandoverPackage(pkg: HandoverPackage) {
  downloadBlob(handoverZipName(pkg), new Blob([pkg.zip as BlobPart], { type: 'application/zip' }));
}
