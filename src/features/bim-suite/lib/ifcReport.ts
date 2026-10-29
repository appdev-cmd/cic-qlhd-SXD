import { formatNumber, formatDateTime } from '@/lib/utils';
// Báo cáo xác minh IFC dạng HTML để in hoặc lưu PDF từ trình duyệt (giữ đúng chữ tiếng Việt, không cần nhúng phông).
import type { BimIssue } from '@/features/bim-suite/types/bim.types';
import type { IfcResult, OpenClash } from '../services/BimCheckService';

const STAGE_LABELS: Record<string, string> = {
  chuan_bi: 'Chuẩn bị',
  thiet_ke: 'Thiết kế',
  thi_cong: 'Thi công',
  ban_giao: 'Bàn giao',
  van_hanh: 'Vận hành',
};
const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const pct = (v: number) => `${formatNumber(Number(v) * 100, 1)}%`;

export function ifcReportHtml(
  results: { result: IfcResult; fileName: string; projectName: string; cdeName?: string }[],
  generatedBy?: string,
): string {
  const now = formatDateTime(new Date());
  const sections = results
    .map(
      ({ result: r, fileName, projectName, cdeName }) => `
<section>
  <h2>${esc(cdeName || fileName)}</h2>
  <p class="meta">${esc(projectName)} · Tệp ${esc(fileName)} · ${esc(formatNumber(r.so_cau_kien, 2))} cấu kiện · Giai đoạn ${esc(STAGE_LABELS[r.giai_doan] ?? r.giai_doan)} · Chấm lúc ${esc(formatDateTime(new Date(r.created_at)))}</p>
  <p class="verdict ${r.dat ? 'ok' : 'fail'}">Điểm tổng ${esc(formatNumber(Number(r.diem_tong), 2))}/100 · Ngưỡng ${esc(formatNumber(Number(r.diem_toi_thieu), 2))} · ${r.dat ? 'ĐẠT' : 'CHƯA ĐẠT'}</p>
  ${r.ly_do_khong_dat.length ? `<ul class="reasons">${r.ly_do_khong_dat.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <table>
    <thead><tr><th>Nhóm tiêu chí</th><th>Trọng số</th><th>Điểm nhóm</th><th>Tối thiểu</th><th>Tiêu chí</th><th>Tỷ lệ đạt</th><th>Khuyến nghị</th></tr></thead>
    <tbody>${r.nhom.map((g) => g.tieu_chi.map((c, i) => `<tr>${i === 0 ? `<td rowspan="${g.tieu_chi.length}">${esc(g.ten)}</td><td rowspan="${g.tieu_chi.length}">${esc(g.trong_so)}</td><td rowspan="${g.tieu_chi.length}">${esc(g.diem)}</td><td rowspan="${g.tieu_chi.length}">${esc(g.toi_thieu ?? '—')}</td>` : ''}<td>${esc(c.ten)}</td><td>${pct(c.ty_le)}</td><td>${esc(c.khuyen_nghi ?? '')}</td></tr>`).join('')).join('')}</tbody>
  </table>
</section>`,
    )
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo xác minh IFC</title>
<style>
body{font-family:'Times New Roman',serif;color:#1d1c1c;margin:24px;font-size:12px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 2px;font-family:'JetBrains Mono',monospace}
.meta{color:#555;margin:0 0 6px}.verdict{font-weight:700;margin:4px 0}.ok{color:#047857}.fail{color:#b91c1c}
table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f3f0e8}.reasons{margin:4px 0;color:#b91c1c}section{page-break-inside:avoid}
footer{margin-top:24px;color:#666;font-size:11px}
@page{size:A4;margin:22mm 20mm 20mm 30mm}@media print{body{margin:0}}
</style></head><body>
<h1>Báo cáo xác minh mô hình IFC</h1>
<p class="meta">Lập lúc ${esc(now)}${generatedBy ? ` · Người lập: ${esc(generatedBy)}` : ''}. 7 nhóm, 14 tiêu chí; trọng số và ngưỡng theo giai đoạn của dự án.</p>
${sections}
<footer>Tỷ lệ đạt tính trên cấu kiện trong CSDL sau chuyển đổi. Tiêu chí khối lượng bỏ qua IfcSpace, IfcOpeningElement, IfcAnnotation, IfcGrid, IfcVirtualElement.</footer>
</body></html>`;
}

/** Mở báo cáo trong cửa sổ mới và gọi hộp thoại in (chọn "Lưu dưới dạng PDF"). */
export function printIfcReport(html: string): boolean {
  const w = window.open('', '_blank', 'noopener=no,width=1000,height=800');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

/** Va chạm chưa xử lý → chủ đề BCF (loại va chạm, cấu kiện A là đích, cấu kiện B ghi trong mô tả). */
export function clashesToBcfItems(clashes: OpenClash[]): { issue: BimIssue; comments: [] }[] {
  return clashes.map((c) => ({
    issue: {
      id: c.id,
      project_id: c.project_id,
      title: `Va chạm: ${c.ten_a || c.loai_a || c.guid_a} × ${c.ten_b || c.loai_b || c.guid_b}`,
      description: `GUID A ${c.guid_a} (${c.loai_a ?? '—'}) · GUID B ${c.guid_b} (${c.loai_b ?? '—'})${c.do_sau != null ? ` · độ cắm sâu ${Number(c.do_sau).toFixed(3)} m` : ''}`,
      status: c.trang_thai === 'dang_xu_ly' ? 'in_progress' : 'open',
      priority: (c.do_sau ?? 0) >= 0.05 ? 'high' : 'normal',
      issue_type: 'va_cham',
      target_element_guid: c.guid_a,
      created_at: c.lan_cuoi,
      updated_at: c.lan_cuoi,
    } as BimIssue,
    comments: [],
  }));
}
