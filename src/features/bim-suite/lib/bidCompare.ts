// So sánh giá dự thầu theo từng dòng công việc giữa các nhà thầu của một gói thầu.

export interface BidLine {
  nha_thau: string;
  stt: number;
  ma_hieu: string | null;
  ten_cong_viec: string;
  don_vi: string | null;
  khoi_luong: number | null;
  don_gia: number | null;
}

export interface BidCompareRow {
  key: string;
  ma_hieu: string | null;
  ten_cong_viec: string;
  don_vi: string | null;
  gia: Record<string, number | null>;
  khoi_luong: Record<string, number | null>;
  thap_nhat: number | null;
  cao_nhat: number | null;
  trung_vi: number | null;
  /** Nhà thầu có đơn giá lệch quá ngưỡng so với trung vị. */
  lech: { nha_thau: string; ty_le: number }[];
  /** Khối lượng giữa các nhà thầu không bằng nhau. */
  khac_khoi_luong: boolean;
  /** Nhà thầu không chào dòng này. */
  thieu: string[];
}

export interface BidCompare {
  bidders: string[];
  rows: BidCompareRow[];
  tong: Record<string, number>;
  /** Dòng thiếu đơn giá hoặc khối lượng, không vào tổng. */
  dong_thieu: Record<string, number>;
}

const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Ghép dòng theo mã hiệu (hoặc tên chuẩn hóa khi thiếu mã); lệch giá tính so với trung vị, ngưỡng mặc định 15%. */
export function compareBids(lines: BidLine[], threshold = 0.15): BidCompare {
  const bidders = [...new Set(lines.map((l) => l.nha_thau))].sort((a, b) => a.localeCompare(b, 'vi'));
  const groups = new Map<string, BidLine[]>();
  const order: string[] = [];
  for (const l of [...lines].sort((a, b) => a.stt - b.stt)) {
    const key = l.ma_hieu ? `ma:${l.ma_hieu.toUpperCase()}` : `ten:${normName(l.ten_cong_viec)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(l);
  }
  const tong: Record<string, number> = Object.fromEntries(bidders.map((b) => [b, 0]));
  const dongThieu: Record<string, number> = Object.fromEntries(bidders.map((b) => [b, 0]));
  const rows = order.map((key) => {
    const g = groups.get(key)!;
    const gia: Record<string, number | null> = {};
    const kl: Record<string, number | null> = {};
    for (const b of bidders) {
      const line = g.find((l) => l.nha_thau === b);
      gia[b] = line ? line.don_gia : null;
      kl[b] = line ? line.khoi_luong : null;
      if (line) {
        if (line.don_gia === null || line.khoi_luong === null) dongThieu[b]++;
        else tong[b] += line.don_gia * line.khoi_luong;
      }
    }
    const prices = bidders.map((b) => gia[b]).filter((v): v is number => v !== null);
    const med = median(prices);
    const qty = bidders.map((b) => kl[b]).filter((v): v is number => v !== null);
    return {
      key,
      ma_hieu: g[0].ma_hieu,
      ten_cong_viec: g[0].ten_cong_viec,
      don_vi: g[0].don_vi,
      gia,
      khoi_luong: kl,
      thap_nhat: prices.length ? Math.min(...prices) : null,
      cao_nhat: prices.length ? Math.max(...prices) : null,
      trung_vi: med,
      lech:
        med && prices.length >= 2
          ? bidders
              .filter((b) => gia[b] !== null && Math.abs(gia[b]! - med) / med > threshold)
              .map((b) => ({ nha_thau: b, ty_le: (gia[b]! - med) / med }))
          : [],
      khac_khoi_luong: qty.length >= 2 && qty.some((q) => Math.abs(q - qty[0]) > 1e-9),
      thieu: bidders.filter((b) => !g.some((l) => l.nha_thau === b)),
    };
  });
  return { bidders, rows, tong, dong_thieu: dongThieu };
}
