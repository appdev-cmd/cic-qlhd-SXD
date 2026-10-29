import { formatNumber, formatDateTime } from '@/lib/utils';
// Closeout: checks project data against the as-built record list of Phụ lục VII, Nghị định 207/2026/NĐ-CP.
// Source of every item code and wording: BuildSIA copy of NĐ 207/2026 (src/lib/legalSearchIndex.json key "218450",
// OCR pages 91–93 = Công báo số 351 ngày 27/6/2026, tr. 92–94). Items are numbered I.1–10, II.1–5, III.1–16 with
// III.10 split into its points a, b, c, d, đ, e, g, h (38 rows).
// Status rules: "Đủ" only when a Published CDE document tagged with the item exists (code A1–A5 or CR), or every
// system record for the item is concluded (acceptances); data without such a document is "Chưa đủ"; nothing is
// "Chưa có". Optional items ("nếu có", conditional, "khác") are never assumed not applicable: the owner states why.
// Pure module (no Supabase import) so scripts/verify-bim-handover.test.ts can load it.

export type Phan = 'I' | 'II' | 'III';

export const HANDOVER_BASIS =
  'Danh mục hồ sơ hoàn thành công trình theo Phụ lục VII Nghị định 207/2026/NĐ-CP; lưu trữ hồ sơ theo Điều 28.';

export const PHAN_LABELS: Record<Phan, string> = {
  I: 'I. Hồ sơ chuẩn bị đầu tư xây dựng và hợp đồng',
  II: 'II. Hồ sơ khảo sát xây dựng, thiết kế xây dựng công trình',
  III: 'III. Hồ sơ quản lý thi công xây dựng công trình',
};

/** Same pattern as the DB check on document_cde_containers.muc_phu_luc_vii. */
export const MUC_PHU_LUC_RE = /^(I|II|III)\.[0-9]{1,2}[a-zđ]?$/;

export interface AcceptanceRow {
  id: string | null;
  cap: string;
  ten: string;
  hang_muc: string | null;
  ngay: string | null;
  ket_luan: string | null;
  trang_thai: string | null;
  bim_guid: string | null;
  tao_luc: string | null;
}
export interface HandoverItemRow {
  id: string | null;
  he_thong: string | null;
  muc: string;
  loai: string;
  bat_buoc: boolean | null;
  xong: boolean;
  ngay: string | null;
  tai_lieu: unknown;
  ghi_chu: string | null;
  acceptance_id: string | null;
}
export interface AssetRow {
  ma: string | null;
  ten: string | null;
  nhom: string | null;
  he_thong: string | null;
  hang: string | null;
  model: string | null;
  serial: string | null;
  lap_dat: string | null;
  bao_hanh: string | null;
  tang: string | null;
  phong: string | null;
  guid: string | null;
  chu_ky_bt: number | null;
  ban_giao: string | null;
  co_tai_lieu: boolean;
}
export interface ModelRow {
  id: string;
  tep: string;
  bo_mon: string | null;
  phien_ban: number | null;
  cau_kien: number | null;
  ghi_chu: string | null;
}
export interface LodRow {
  model_id: string;
  muc: string;
  dat: boolean;
  cau_kien: number;
  trong_pham_vi: number;
  ngoai_pham_vi: number;
  ngay: string | null;
}
export interface IfcCheckRow {
  model_id: string;
  dat: boolean;
  diem_tong: number | null;
  diem_toi_thieu: number | null;
  giai_doan: string | null;
  ngay: string | null;
}
export interface CdeRow {
  id: string | null;
  ma: string;
  ten: string;
  loai: string | null;
  vung: string;
  ma_phu_hop: string;
  sua_doi: string | null;
  /** document_cde_containers.muc_phu_luc_vii */
  muc: string | null;
}
export interface ContractRow {
  so: string;
  ten: string | null;
  nha_thau: string | null;
  /** bim_contracts.trang_thai: nhap | da_ky | thanh_ly */
  trang_thai: string;
}
export interface ChangeOrderRow {
  so: string | null;
  tieu_de: string;
  trang_thai: string;
  gia_tri: number | null;
  ngay_duyet: string | null;
}

/** Result of RPC bim_goi_ban_giao_du_lieu(p_project uuid) plus the default model composition. */
export interface HandoverData {
  du_an: { id?: string | null; ten?: string | null } | null;
  nghiem_thu: AcceptanceRow[] | null;
  ban_giao: HandoverItemRow[] | null;
  tai_san: AssetRow[] | null;
  mo_hinh: ModelRow[] | null;
  lod: LodRow[] | null;
  xac_minh_ifc: IfcCheckRow[] | null;
  van_de: {
    theo_trang_thai: Record<string, number>;
    da_dong: { so: string | null; ten: string; loai: string | null; dong_luc: string | null }[];
  } | null;
  va_cham: Record<string, number> | null;
  hien_truong: { phieu_da_ky: number; sai_lech: number; xac_minh: number } | null;
  cde: CdeRow[] | null;
  lenh_thay_doi: ChangeOrderRow[] | null;
  /** Contracts of the BIM cost module (from `phat_sinh`). */
  hop_dong?: ContractRow[] | null;
  lap_luc: string;
  /** Models of the project's default composition (as-built set); when set only these go into the package. */
  to_hop?: string[] | null;
}

export type ItemStatus = 'du' | 'chua_du' | 'chua_co';
export const STATUS_LABELS: Record<ItemStatus, string> = { du: 'Đủ', chua_du: 'Chưa đủ', chua_co: 'Chưa có' };

export interface ChecklistRow {
  ma: string;
  phan: Phan;
  noi_dung: string;
  /** The decree marks the item (or its parent III.10) "(nếu có)". */
  neu_co: boolean;
  /** Applicability condition written in the item ("trừ trường hợp…", "đối với trường hợp…"). */
  dieu_kien: string | null;
  /** Catch-all "other related documents" item. */
  khac: boolean;
  /** Not optional, conditional or catch-all. */
  bat_buoc: boolean;
  /** Row group of the BuildSIA reference form quality-reference-09 (1–12). */
  nhom09: number;
  trang_thai: ItemStatus;
  can_cu: string[];
}

type Evidence = { du: boolean; lines: string[] } | null;
export interface PhuLucItem {
  ma: string;
  phan: Phan;
  /** Wording of the decree (abridged only where marked "…"). */
  noi_dung: string;
  /** Short label for selects and narrow tables. */
  ngan: string;
  neu_co?: boolean;
  dieu_kien?: string;
  khac?: boolean;
  nhom09: number;
  he_thong?: (d: HandoverData) => Evidence;
}

const n = (v: number) => formatNumber(v, 2);
export const dmy = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
const PASSED = new Set(['dat', 'dat_co_dieu_kien']);
const passed = (x: Pick<AcceptanceRow, 'trang_thai' | 'ket_luan'>) =>
  x.trang_thai === 'da_ket_luan' && PASSED.has(x.ket_luan ?? '');

/**
 * bim_nghiem_thu is append-only: a correction or a re-acceptance is a new record. Keep the latest record per
 * level (cap) + work item (ma_hang_muc, else the name); the latest by tao_luc wins.
 */
export function latestAcceptances(rows: AcceptanceRow[]): AcceptanceRow[] {
  const by = new Map<string, AcceptanceRow>();
  for (const r of rows) {
    const key = r.hang_muc ? `${r.cap}|hm|${r.hang_muc.trim()}` : `${r.cap}|ten|${r.ten.trim().toLowerCase()}`;
    const prev = by.get(key);
    // tao_luc is an ISO timestamp from the server; without it on either side the later row wins.
    if (!prev || !prev.tao_luc || !r.tao_luc || Date.parse(r.tao_luc) >= Date.parse(prev.tao_luc)) by.set(key, r);
  }
  return [...by.values()];
}

const acceptance =
  (cap: string, label: string) =>
  (d: HandoverData): Evidence => {
    const rows = latestAcceptances(d.nghiem_thu ?? []).filter((x) => x.cap === cap);
    if (!rows.length) return null;
    const ok = rows.filter(passed).length;
    const pending = rows.length - ok;
    return {
      du: pending === 0,
      lines: [
        `${label}: ${n(ok)}/${n(rows.length)} biên bản đã kết luận đạt${pending ? `, ${n(pending)} chưa kết luận đạt` : ''}`,
      ],
    };
  };

const handoverItems = (d: HandoverData, test: (x: HandoverItemRow) => boolean, label: string): Evidence => {
  const items = (d.ban_giao ?? []).filter(test);
  if (!items.length) return null;
  return { du: false, lines: [`${label}: ${n(items.filter((x) => x.xong).length)}/${n(items.length)} mục xong`] };
};

/** Published or archived CDE files not tagged with any item, by suitability code. */
const untaggedCde = (d: HandoverData, codes: string[]) =>
  (d.cde ?? []).filter((x) => !x.muc && ['published', 'archived'].includes(x.vung) && codes.includes(x.ma_phu_hop));

function merge(a: Evidence, b: Evidence): Evidence {
  if (!a) return b;
  if (!b) return a;
  return { du: a.du && b.du, lines: [...a.lines, ...b.lines] };
}

// Wording checked against NĐ 207/2026 Phụ lục VII (legalSearchIndex "218450", pages 91–93).
export const PHU_LUC_VII: PhuLucItem[] = [
  // page 91 (Công báo tr. 92)
  {
    ma: 'I.1',
    phan: 'I',
    nhom09: 1,
    neu_co: true,
    ngan: 'Chủ trương đầu tư, BC NC tiền khả thi',
    noi_dung: 'Quyết định chủ trương đầu tư xây dựng và Báo cáo nghiên cứu tiền khả thi đầu tư xây dựng',
  },
  {
    ma: 'I.2',
    phan: 'I',
    nhom09: 1,
    ngan: 'Phê duyệt dự án, BC NC khả thi / BC KT-KT',
    noi_dung:
      'Quyết định phê duyệt dự án đầu tư xây dựng công trình và Báo cáo nghiên cứu khả thi đầu tư xây dựng hoặc Báo cáo kinh tế - kỹ thuật đầu tư xây dựng',
  },
  {
    ma: 'I.3',
    phan: 'I',
    nhom09: 1,
    ngan: 'Nhiệm vụ thiết kế, thẩm định dự án, TKCS',
    noi_dung:
      'Nhiệm vụ thiết kế, các văn bản thẩm định, tham gia ý kiến của các cơ quan có liên quan trong việc thẩm định dự án đầu tư xây dựng và thiết kế cơ sở',
  },
  {
    ma: 'I.4',
    phan: 'I',
    nhom09: 1,
    neu_co: true,
    ngan: 'Đền bù GPMB, tái định cư',
    noi_dung: 'Phương án đền bù giải phóng mặt bằng và xây dựng tái định cư',
  },
  {
    ma: 'I.5',
    phan: 'I',
    nhom09: 1,
    neu_co: true,
    ngan: 'Thỏa thuận quy hoạch, đấu nối, ĐTM, an toàn',
    noi_dung:
      'Văn bản của các tổ chức, cơ quan nhà nước có thẩm quyền về: thỏa thuận quy hoạch, thỏa thuận hoặc chấp thuận sử dụng hoặc đấu nối với công trình kỹ thuật bên ngoài hàng rào; đánh giá tác động môi trường, bảo đảm an toàn (an toàn giao thông, an toàn cho các công trình lân cận) và các văn bản khác có liên quan',
  },
  {
    ma: 'I.6',
    phan: 'I',
    nhom09: 1,
    ngan: 'Giao đất, cho thuê đất / hợp đồng thuê đất',
    noi_dung:
      'Quyết định giao đất, cho thuê đất của cơ quan có thẩm quyền hoặc hợp đồng thuê đất đối với trường hợp không được cấp đất',
  },
  {
    ma: 'I.7',
    phan: 'I',
    nhom09: 1,
    dieu_kien: 'trừ những trường hợp được miễn giấy phép xây dựng',
    ngan: 'Giấy phép xây dựng',
    noi_dung: 'Giấy phép xây dựng, trừ những trường hợp được miễn giấy phép xây dựng',
  },
  {
    ma: 'I.8',
    phan: 'I',
    nhom09: 1,
    ngan: 'Lựa chọn nhà thầu, hợp đồng xây dựng',
    noi_dung:
      'Quyết định chỉ định thầu, phê duyệt kết quả lựa chọn các nhà thầu và hợp đồng xây dựng giữa chủ đầu tư với các nhà thầu',
    he_thong: (d) => {
      const c = d.hop_dong ?? [];
      if (!c.length) return null;
      const signed = c.filter((x) => x.trang_thai === 'da_ky' || x.trang_thai === 'thanh_ly').length;
      return {
        du: false,
        lines: [
          `${n(c.length)} hợp đồng trong phân hệ chi phí BIM (${n(signed)} đã ký); cần quyết định lựa chọn nhà thầu và văn bản hợp đồng`,
        ],
      };
    },
  },
  {
    ma: 'I.9',
    phan: 'I',
    nhom09: 1,
    ngan: 'Năng lực các nhà thầu',
    noi_dung: 'Các tài liệu chứng minh năng lực của các nhà thầu theo quy định',
  },
  {
    ma: 'I.10',
    phan: 'I',
    nhom09: 1,
    khac: true,
    ngan: 'Hồ sơ khác giai đoạn chuẩn bị đầu tư',
    noi_dung: 'Các hồ sơ, tài liệu khác có liên quan trong giai đoạn chuẩn bị đầu tư xây dựng',
  },
  {
    ma: 'II.1',
    phan: 'II',
    nhom09: 2,
    ngan: 'Nhiệm vụ, phương án, báo cáo khảo sát',
    noi_dung: 'Nhiệm vụ khảo sát, phương án kỹ thuật khảo sát, báo cáo kết quả khảo sát xây dựng',
  },
  {
    ma: 'II.2',
    phan: 'II',
    nhom09: 2,
    dieu_kien: 'đối với trường hợp không phê duyệt trực tiếp lên báo cáo khảo sát xây dựng',
    ngan: 'Văn bản phê duyệt báo cáo khảo sát',
    noi_dung:
      'Văn bản phê duyệt báo cáo kết quả khảo sát xây dựng đối với trường hợp không phê duyệt trực tiếp lên báo cáo khảo sát xây dựng',
  },
  // page 92 (Công báo tr. 93)
  {
    ma: 'II.3',
    phan: 'II',
    nhom09: 3,
    ngan: 'Thẩm tra, thẩm định, phê duyệt thiết kế, CDKT',
    noi_dung:
      'Kết quả thẩm tra, thẩm định thiết kế xây dựng; quyết định phê duyệt thiết kế xây dựng công trình kèm theo: hồ sơ thiết kế xây dựng công trình đã được phê duyệt (có danh mục bản vẽ kèm theo); chỉ dẫn kỹ thuật',
    he_thong: (d) => {
      const f = untaggedCde(d, ['A1', 'A2', 'B1', 'B2']);
      return f.length
        ? {
            du: false,
            lines: [`${n(f.length)} tệp thiết kế/thi công đã phát hành trong CDE, chưa gắn mục Phụ lục VII`],
          }
        : null;
    },
  },
  {
    ma: 'II.4',
    phan: 'II',
    nhom09: 3,
    ngan: 'Chấp thuận nghiệm thu thiết kế',
    noi_dung: 'Văn bản thông báo chấp thuận nghiệm thu thiết kế xây dựng công trình',
  },
  {
    ma: 'II.5',
    phan: 'II',
    nhom09: 3,
    khac: true,
    ngan: 'Hồ sơ khác giai đoạn khảo sát, thiết kế',
    noi_dung: 'Các văn bản, tài liệu, hồ sơ khác có liên quan đến giai đoạn khảo sát, thiết kế xây dựng công trình',
  },
  {
    ma: 'III.1',
    phan: 'III',
    nhom09: 4,
    ngan: 'Danh mục thay đổi thiết kế, văn bản phê duyệt',
    noi_dung:
      'Danh mục các thay đổi thiết kế trong quá trình thi công xây dựng công trình và các văn bản thẩm định, phê duyệt của cấp có thẩm quyền',
    he_thong: (d) => {
      const co = d.lenh_thay_doi ?? [];
      if (!co.length) return null;
      const approved = co.filter((c) => c.trang_thai === 'da_duyet').length;
      const pending = co.filter((c) => c.trang_thai === 'nhap' || c.trang_thai === 'de_xuat').length;
      return {
        du: false,
        lines: [
          `${n(co.length)} lệnh thay đổi trong phân hệ BIM (${n(approved)} đã duyệt, ${n(pending)} chờ quyết định); cần văn bản thẩm định, phê duyệt thay đổi thiết kế của cấp có thẩm quyền`,
        ],
      };
    },
  },
  {
    ma: 'III.2',
    phan: 'III',
    nhom09: 4,
    ngan: 'Bản vẽ hoàn công',
    noi_dung: 'Bản vẽ hoàn công (có danh mục bản vẽ kèm theo)',
    he_thong: (d) => {
      const lines: string[] = [];
      const f = untaggedCde(d, ['A3', 'B3', 'CR']);
      if (f.length) lines.push(`${n(f.length)} tệp hoàn công trong CDE (mã A3/B3/CR), chưa gắn mục Phụ lục VII`);
      const ids = new Set(handoverModels(d).map((m) => m.id));
      const lod = (d.lod ?? []).filter((x) => String(x.muc) === '500' && ids.has(x.model_id));
      if (lod.length)
        lines.push(`Mô hình hoàn công LOD 500: ${n(lod.filter((x) => x.dat).length)}/${n(lod.length)} mô hình đạt`);
      const ifc = (d.xac_minh_ifc ?? []).filter((x) => ids.has(x.model_id));
      if (ifc.length)
        lines.push(`Xác minh IFC: ${n(ifc.filter((x) => x.dat).length)}/${n(ifc.length)} mô hình đạt ngưỡng`);
      return lines.length ? { du: false, lines } : null;
    },
  },
  {
    ma: 'III.3',
    phan: 'III',
    nhom09: 5,
    ngan: 'Kế hoạch, biện pháp kiểm soát chất lượng',
    noi_dung: 'Các kế hoạch, biện pháp kiểm tra, kiểm soát chất lượng thi công xây dựng công trình',
  },
  {
    ma: 'III.4',
    phan: 'III',
    nhom09: 6,
    ngan: 'Xuất xứ, nhãn mác, hợp quy, hợp chuẩn',
    noi_dung:
      'Các chứng từ chứng nhận xuất xứ hàng hóa, nhãn mác hàng hóa, tài liệu công bố tiêu chuẩn áp dụng đối với sản phẩm, hàng hóa; chứng nhận hợp quy, công bố hợp quy, thông báo tiếp nhận hồ sơ công bố hợp quy của cơ quan chuyên ngành; chứng nhận hợp chuẩn (nếu có) theo quy định của Luật Chất lượng sản phẩm hàng hóa',
    he_thong: (d) =>
      handoverItems(
        d,
        (x) => /co\s*\/\s*cq|xuất xưởng|xuất xứ|hợp quy|hợp chuẩn/i.test(x.muc),
        'Checklist bàn giao (xuất xứ, CO/CQ, hợp quy)',
      ),
  },
  {
    ma: 'III.5',
    phan: 'III',
    nhom09: 7,
    ngan: 'Quan trắc, đo đạc, thí nghiệm',
    noi_dung: 'Các kết quả quan trắc (nếu có), đo đạc, thí nghiệm trong quá trình thi công',
    he_thong: (d) => {
      const h = d.hien_truong;
      if (!h || (!h.phieu_da_ky && !h.xac_minh)) return null;
      return {
        du: false,
        lines: [
          `${n(h.phieu_da_ky)} phiếu kiểm tra hiện trường đã ký (${n(h.sai_lech)} sai lệch); ${n(h.xac_minh)} bản ghi xác minh cấu kiện`,
        ],
      };
    },
  },
  {
    ma: 'III.6',
    phan: 'III',
    nhom09: 8,
    ngan: 'Nghiệm thu công việc, bộ phận, giai đoạn',
    noi_dung:
      'Các biên bản nghiệm thu công việc xây dựng, nghiệm thu bộ phận hoặc giai đoạn công trình (nếu có) trong quá trình thi công xây dựng',
    he_thong: (d) =>
      merge(acceptance('cong_viec', 'Nghiệm thu công việc')(d), acceptance('giai_doan', 'Nghiệm thu giai đoạn')(d)),
  },
  {
    ma: 'III.7',
    phan: 'III',
    nhom09: 7,
    neu_co: true,
    ngan: 'Thí nghiệm đối chứng, kiểm định, thử tải',
    noi_dung:
      'Các kết quả thí nghiệm đối chứng, kiểm định chất lượng công trình, thử nghiệm khả năng chịu lực kết cấu xây dựng',
  },
  {
    ma: 'III.8',
    phan: 'III',
    nhom09: 9,
    ngan: 'Quản lý chất lượng thiết bị lắp đặt',
    noi_dung: 'Hồ sơ quản lý chất lượng của thiết bị lắp đặt vào công trình',
    he_thong: (d) => {
      const a = d.tai_san ?? [];
      if (!a.length) return null;
      const docs = a.filter((x) => x.co_tai_lieu).length;
      return {
        du: false,
        lines: [
          `${n(a.length)} tài sản, thiết bị; ${n(docs)} có tài liệu đính kèm; độ đầy đủ dữ liệu trung bình ${Math.round(assetCompleteness(a).mean * 100)}%`,
        ],
      };
    },
  },
  {
    ma: 'III.9',
    phan: 'III',
    nhom09: 9,
    ngan: 'Quy trình vận hành, quy trình bảo trì',
    noi_dung: 'Quy trình vận hành, khai thác công trình (nếu có); quy trình bảo trì công trình',
    he_thong: (d) => handoverItems(d, (x) => x.loai === 'document', 'Checklist bàn giao, mục hồ sơ vận hành, bảo trì'),
  },
  // III.10: "Văn bản thỏa thuận, chấp thuận, xác nhận của các tổ chức, cơ quan nhà nước có thẩm quyền (nếu có) về:"
  {
    ma: 'III.10a',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    ngan: 'Di dân lòng hồ, khảo sát di tích',
    noi_dung: 'Di dân vùng lòng hồ, khảo sát các di tích lịch sử, văn hóa',
  },
  {
    ma: 'III.10b',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    ngan: 'An toàn phòng cháy, chữa cháy',
    noi_dung: 'An toàn phòng cháy, chữa cháy',
    he_thong: (d) =>
      handoverItems(d, (x) => /pccc|chữa cháy|phòng cháy/i.test(x.he_thong ?? ''), 'Checklist bàn giao hệ PCCC'),
  },
  {
    ma: 'III.10c',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    ngan: 'An toàn môi trường',
    noi_dung: 'An toàn môi trường',
  },
  {
    ma: 'III.10d',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    ngan: 'An toàn lao động, vận hành thiết bị',
    noi_dung: 'An toàn lao động, an toàn vận hành hệ thống thiết bị công trình, thiết bị công nghệ',
  },
  // page 93 (Công báo tr. 94)
  {
    ma: 'III.10đ',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    dieu_kien: 'đối với trường hợp phải có giấy phép xây dựng',
    ngan: 'Thực hiện giấy phép xây dựng',
    noi_dung: 'Thực hiện Giấy phép xây dựng (đối với trường hợp phải có giấy phép xây dựng)',
  },
  {
    ma: 'III.10e',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    ngan: 'Cho phép đấu nối hạ tầng kỹ thuật',
    noi_dung: 'Cho phép đấu nối với công trình hạ tầng kỹ thuật và các công trình khác có liên quan',
  },
  {
    ma: 'III.10g',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    ngan: 'Hoàn thành hạ tầng kỹ thuật của dự án',
    noi_dung:
      'Văn bản của cơ quan chuyên môn về xây dựng, quản lý phát triển đô thị về việc hoàn thành các công trình hạ tầng kỹ thuật có liên quan của dự án theo kế hoạch xây dựng nêu tại Báo cáo nghiên cứu khả thi đã được thẩm định, phê duyệt',
  },
  {
    ma: 'III.10h',
    phan: 'III',
    nhom09: 10,
    neu_co: true,
    ngan: 'Văn bản khác theo pháp luật liên quan',
    noi_dung: 'Các văn bản khác theo quy định của pháp luật có liên quan',
  },
  {
    ma: 'III.11',
    phan: 'III',
    nhom09: 11,
    neu_co: true,
    ngan: 'Giải quyết sự cố công trình',
    noi_dung: 'Hồ sơ giải quyết sự cố công trình',
  },
  {
    ma: 'III.12',
    phan: 'III',
    nhom09: 11,
    neu_co: true,
    ngan: 'Phụ lục tồn tại cần sửa chữa, khắc phục',
    noi_dung:
      'Phụ lục các tồn tại cần sửa chữa, khắc phục sau khi đưa hạng mục công trình, công trình xây dựng vào sử dụng',
    he_thong: (d) => {
      const lines: string[] = [];
      const conditional = latestAcceptances(d.nghiem_thu ?? []).filter((x) => x.ket_luan === 'dat_co_dieu_kien').length;
      if (conditional) lines.push(`${n(conditional)} biên bản nghiệm thu đạt có điều kiện: cần lập phụ lục tồn tại`);
      const open = Object.entries(d.van_de?.theo_trang_thai ?? {})
        .filter(([k]) => k === 'open' || k === 'in_progress')
        .reduce((s, [, v]) => s + Number(v), 0);
      if (open) lines.push(`${n(open)} vướng mắc BIM còn mở`);
      const clashes = Object.entries(d.va_cham ?? {})
        .filter(([k]) => k === 'moi' || k === 'dang_xu_ly')
        .reduce((s, [, v]) => s + Number(v), 0);
      if (clashes) lines.push(`${n(clashes)} va chạm chưa xử lý`);
      return lines.length ? { du: false, lines } : null;
    },
  },
  {
    ma: 'III.13',
    phan: 'III',
    nhom09: 12,
    ngan: 'Nghiệm thu hoàn thành hạng mục, công trình',
    noi_dung: 'Biên bản nghiệm thu hoàn thành hạng mục công trình, công trình xây dựng',
    he_thong: acceptance('hoan_thanh', 'Nghiệm thu hoàn thành'),
  },
  {
    ma: 'III.14',
    phan: 'III',
    nhom09: 12,
    neu_co: true,
    ngan: 'Thông báo của cơ quan có thẩm quyền (k4 Đ57)',
    noi_dung: 'Văn bản thông báo của cơ quan có thẩm quyền quy định tại khoản 4 Điều 57 Luật Xây dựng số 135/2025/QH15',
  },
  {
    ma: 'III.15',
    phan: 'III',
    nhom09: 12,
    neu_co: true,
    ngan: 'Hồ sơ kiểm tra công tác nghiệm thu',
    noi_dung: 'Các hồ sơ, tài liệu có liên quan trong quá trình thực hiện kiểm tra công tác nghiệm thu theo quy định',
  },
  {
    ma: 'III.16',
    phan: 'III',
    nhom09: 12,
    khac: true,
    ngan: 'Hồ sơ khác giai đoạn thi công, nghiệm thu',
    noi_dung:
      'Các hồ sơ/văn bản/tài liệu khác có liên quan trong giai đoạn thi công xây dựng và nghiệm thu công trình xây dựng',
  },
];

/** Row groups of the reference form quality-reference-09 (src/lib/legalForms/quality-form-specs.json). */
export const NHOM_MAU_09: Record<number, string> = {
  1: 'Chuẩn bị đầu tư, quyết định phê duyệt, đất đai, giấy phép và hợp đồng',
  2: 'Nhiệm vụ, kết quả khảo sát và hồ sơ nghiệm thu khảo sát',
  3: 'Thiết kế, thẩm tra, thẩm định, phê duyệt và chỉ dẫn kỹ thuật',
  4: 'Thay đổi thiết kế, bản vẽ hoàn công và danh mục bản vẽ',
  5: 'Kế hoạch, biện pháp kiểm tra và kiểm soát chất lượng',
  6: 'Hồ sơ nguồn gốc, tiêu chuẩn, hợp quy / hợp chuẩn của vật liệu, thiết bị',
  7: 'Kết quả quan trắc, đo đạc, thí nghiệm và kiểm định áp dụng',
  8: 'Biên bản nghiệm thu công việc, bộ phận, giai đoạn',
  9: 'Quản lý chất lượng thiết bị, quy trình vận hành và bảo trì',
  10: 'Chấp thuận / xác nhận chuyên ngành PCCC, môi trường, an toàn và đấu nối',
  11: 'Hồ sơ giải quyết sự cố và phụ lục tồn tại (nếu có)',
  12: 'Nghiệm thu hoàn thành, kiểm tra nghiệm thu của cơ quan có thẩm quyền và hồ sơ liên quan',
};

/** Codes and short labels for the CDE tag select. */
export const PHU_LUC_OPTIONS = PHU_LUC_VII.map((i) => ({ ma: i.ma, phan: i.phan, ngan: i.ngan }));

/** Models in the package: the default composition when set, otherwise every current model. */
export function handoverModels(d: HandoverData) {
  const all = d.mo_hinh ?? [];
  const pick = d.to_hop?.length ? all.filter((m) => d.to_hop!.includes(m.id)) : all;
  return pick.length ? pick : all;
}

const ZONE: Record<string, string> = {
  wip: 'đang thực hiện',
  shared: 'chia sẻ',
  published: 'phát hành',
  archived: 'lưu trữ',
};
/** A tagged CDE file proves the item when it was issued with an A (A1–A5) or CR code; B codes still carry comments. */
export const cdeDocumentDone = (c: Pick<CdeRow, 'vung' | 'ma_phu_hop'>) =>
  (c.vung === 'published' || c.vung === 'archived') && /^(A[1-5]|CR)$/.test(c.ma_phu_hop);

export function evaluateHandover(d: HandoverData): ChecklistRow[] {
  return PHU_LUC_VII.map((item) => {
    const docs = (d.cde ?? []).filter((c) => c.muc === item.ma);
    const lines = docs.map(
      (c) =>
        `Tài liệu CDE: ${c.ma}${c.ten && c.ten !== c.ma ? ` (${c.ten})` : ''}, ${ZONE[c.vung] ?? c.vung}, ${c.ma_phu_hop}${c.sua_doi ? ` ${c.sua_doi}` : ''}`,
    );
    const docDone = docs.some(cdeDocumentDone);
    const sys = item.he_thong?.(d) ?? null;
    if (sys) lines.push(...sys.lines);
    const trang_thai: ItemStatus = docDone || (sys?.du ?? false) ? 'du' : lines.length ? 'chua_du' : 'chua_co';
    const neu_co = !!item.neu_co;
    const khac = !!item.khac;
    return {
      ma: item.ma,
      phan: item.phan,
      noi_dung: item.noi_dung,
      neu_co,
      dieu_kien: item.dieu_kien ?? null,
      khac,
      bat_buoc: !neu_co && !item.dieu_kien && !khac,
      nhom09: item.nhom09,
      trang_thai,
      can_cu: lines,
    };
  });
}

export function checklistTotals(rows: ChecklistRow[]) {
  return {
    du: rows.filter((r) => r.trang_thai === 'du').length,
    chua_du: rows.filter((r) => r.trang_thai === 'chua_du').length,
    chua_co: rows.filter((r) => r.trang_thai === 'chua_co').length,
    /** Unconditional items still missing or incomplete. */
    bat_buoc_thieu: rows.filter((r) => r.bat_buoc && r.trang_thai !== 'du').length,
  };
}

/** Suffix shown after the item text: "(nếu có)", the condition, or the catch-all note. */
export function itemQualifier(r: Pick<ChecklistRow, 'neu_co' | 'dieu_kien' | 'khac'>) {
  const parts: string[] = [];
  if (r.neu_co) parts.push('nếu có');
  if (r.dieu_kien) parts.push(r.dieu_kien);
  if (r.khac) parts.push('hồ sơ khác, nếu phát sinh');
  return parts.length ? `(${parts.join('; ')})` : '';
}

/** Asset fields needed for operations (COBie-style handover information, reduced). */
export const ASSET_FIELDS: { key: keyof AssetRow; label: string }[] = [
  { key: 'ma', label: 'Mã tài sản' },
  { key: 'ten', label: 'Tên' },
  { key: 'nhom', label: 'Nhóm' },
  { key: 'he_thong', label: 'Hệ thống' },
  { key: 'hang', label: 'Hãng' },
  { key: 'model', label: 'Model' },
  { key: 'serial', label: 'Số seri' },
  { key: 'lap_dat', label: 'Ngày lắp đặt' },
  { key: 'bao_hanh', label: 'Hết bảo hành' },
  { key: 'tang', label: 'Tầng' },
  { key: 'guid', label: 'Cấu kiện BIM' },
  { key: 'chu_ky_bt', label: 'Chu kỳ bảo trì' },
  { key: 'co_tai_lieu', label: 'Tài liệu' },
];
const filled = (v: unknown) => (typeof v === 'boolean' ? v : v !== null && v !== undefined && String(v).trim() !== '');
export function assetCompleteness(assets: AssetRow[]) {
  const per = assets.map((a) => ASSET_FIELDS.filter((f) => filled(a[f.key])).length / ASSET_FIELDS.length);
  const byField = ASSET_FIELDS.map((f) => ({ ...f, filled: assets.filter((a) => filled(a[f.key])).length }));
  return { per, mean: per.length ? per.reduce((s, v) => s + v, 0) / per.length : 0, byField };
}

// ── Normalising the RPC result (tolerates missing keys and nulls from optional sources) ───────────────────────
const arr = <T>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null);
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function normalizeHandoverData(raw: unknown, to_hop: string[] | null = null): HandoverData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cde = arr<Record<string, unknown>>(r.cde)?.map((c): CdeRow => ({
    id: str(c.id),
    ma: String(c.ma ?? c.ma_tep ?? ''),
    ten: String(c.ten ?? c.tieu_de ?? ''),
    loai: str(c.loai),
    vung: String(c.vung ?? ''),
    ma_phu_hop: String(c.ma_phu_hop ?? ''),
    sua_doi: str(c.sua_doi ?? c.ma_sua_doi),
    muc: str(c.muc ?? c.muc_phu_luc_vii),
  }));
  const nghiem_thu = arr<Record<string, unknown>>(r.nghiem_thu)?.map((x): AcceptanceRow => ({
    id: str(x.id ?? x.ma_nghiem_thu),
    cap: String(x.cap ?? x.cap_nghiem_thu ?? ''),
    ten: String(x.ten ?? x.ten_nghiem_thu ?? ''),
    hang_muc: str(x.hang_muc ?? x.ma_hang_muc),
    ngay: str(x.ngay ?? x.ngay_nghiem_thu),
    ket_luan: str(x.ket_luan),
    trang_thai: str(x.trang_thai),
    bim_guid: str(x.bim_guid),
    tao_luc: str(x.tao_luc),
  }));
  const ban_giao = arr<Record<string, unknown>>(r.ban_giao)?.map((x): HandoverItemRow => ({
    id: str(x.id),
    he_thong: str(x.he_thong ?? x.system_name),
    muc: String(x.muc ?? x.label ?? ''),
    loai: String(x.loai ?? x.kind ?? 'check'),
    bat_buoc: typeof (x.bat_buoc ?? x.required) === 'boolean' ? Boolean(x.bat_buoc ?? x.required) : null,
    xong: Boolean(x.xong ?? x.done),
    ngay: str(x.ngay ?? x.done_at),
    tai_lieu: x.tai_lieu ?? x.document ?? null,
    ghi_chu: str(x.ghi_chu ?? x.note),
    acceptance_id: str(x.acceptance_id ?? x.nghiem_thu),
  }));
  const lod = arr<Record<string, unknown>>(r.lod)?.map((x): LodRow => ({
    model_id: String(x.model_id),
    muc: String(x.muc ?? x.muc_lod ?? '500'),
    dat: Boolean(x.dat),
    cau_kien: Number(x.cau_kien ?? x.so_cau_kien ?? 0),
    trong_pham_vi: Number(x.trong_pham_vi ?? x.so_trong_pham_vi ?? 0),
    ngoai_pham_vi: Number(x.ngoai_pham_vi ?? x.so_ngoai_pham_vi ?? 0),
    ngay: str(x.ngay ?? x.created_at),
  }));
  const ifc = arr<Record<string, unknown>>(r.xac_minh_ifc ?? r.ifc)?.map((x): IfcCheckRow => ({
    model_id: String(x.model_id),
    dat: Boolean(x.dat),
    diem_tong: num(x.diem_tong ?? x.diem),
    diem_toi_thieu: num(x.diem_toi_thieu ?? x.toi_thieu),
    giai_doan: str(x.giai_doan),
    ngay: str(x.ngay ?? x.created_at),
  }));
  // bim_phat_sinh_tong_hop: contracts with their change orders (`lenh`).
  const contracts = arr<Record<string, unknown>>(r.phat_sinh);
  const hop_dong = contracts?.map((c): ContractRow => ({
    so: String(c.so_hop_dong ?? c.so ?? ''),
    ten: str(c.ten),
    nha_thau: str(c.nha_thau),
    trang_thai: String(c.trang_thai ?? ''),
  }));
  const orders =
    arr<Record<string, unknown>>(r.lenh_thay_doi) ??
    (contracts ? contracts.flatMap((c) => arr<Record<string, unknown>>(c.lenh) ?? []) : null);
  const co = orders?.map((x): ChangeOrderRow => ({
    so: str(x.so),
    tieu_de: String(x.tieu_de ?? x.ten ?? ''),
    trang_thai: String(x.trang_thai ?? ''),
    gia_tri: num(x.gia_tri ?? x.gia_tri_dieu_chinh),
    ngay_duyet: str(x.ngay_duyet),
  }));
  const du_an = r.du_an && typeof r.du_an === 'object' ? (r.du_an as Record<string, unknown>) : null;
  return {
    du_an: du_an ? { id: str(du_an.id), ten: str(du_an.ten ?? du_an.name ?? du_an.ten_du_an) } : null,
    nghiem_thu: nghiem_thu ?? null,
    ban_giao: ban_giao ?? null,
    tai_san: arr<AssetRow>(r.tai_san),
    mo_hinh: arr<ModelRow>(r.mo_hinh),
    lod: lod ?? null,
    xac_minh_ifc: ifc ?? null,
    van_de: (r.van_de as HandoverData['van_de']) ?? null,
    va_cham: (r.va_cham as HandoverData['va_cham']) ?? null,
    hien_truong: (r.hien_truong as HandoverData['hien_truong']) ?? null,
    cde: cde ?? null,
    lenh_thay_doi: co ?? null,
    hop_dong: hop_dong ?? null,
    lap_luc: String(r.lap_luc ?? new Date().toISOString()),
    to_hop,
  };
}
