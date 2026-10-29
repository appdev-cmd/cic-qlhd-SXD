import { formatNumber, formatDateTime } from '@/lib/utils';
'use client';
// Weekly BIM report on request: issues, clashes, models, data quality, acceptances, usage, schedule and cost. The
// snapshot is stored by project writers (bim_field_weekly_report); readers see the stored weeks. No e-mail schedule.
import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, CalendarRange, Copy, FileDown, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/features/bim-suite/adapters/toast';
import { useBimWeeklyReports } from '../hooks/useBimField';
import { BimFieldService } from '../services/BimFieldService';
import { costLine, exportWeeklyReportDocx, scheduleLine, toolLabel, vnDate, weeklyReportText } from '../lib/bimReport';

interface Props {
  projectId: string;
  projectName?: string;
  canEdit?: boolean;
  /** Week to open first (yyyy-mm-dd Monday). */
  initialWeek?: string | null;
  className?: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const btn =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2 py-1 text-2xs font-semibold text-txt-secondary hover:bg-bg-subtle disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700';
const n = (v: unknown) => formatNumber(Number(v || 0), 2);
/** Monday of the current week in Vietnam time, shifted by `weeks`. */
const mondayIso = (weeks: number) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + weeks * 7);
  return d.toISOString().slice(0, 10);
};

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({
  label,
  value,
  hint,
  tone = 'text-txt-primary dark:text-white',
}) => (
  <div className="rounded-xl border border-border bg-bg-subtle/60 p-2 dark:border-slate-700 dark:bg-slate-900">
    <p className="text-2xs text-txt-muted">{label}</p>
    <p className={`text-base font-bold tabular-nums ${tone}`}>{value}</p>
    {hint && (
      <p className="truncate text-2xs text-txt-muted" data-tooltip={hint}>
        {hint}
      </p>
    )}
  </div>
);

export const BimWeeklyReportPanel: React.FC<Props> = ({
  projectId,
  projectName,
  canEdit = false,
  initialWeek,
  className = '',
}) => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { data: reports = [], isLoading, error } = useBimWeeklyReports(projectId);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(initialWeek ?? null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const report = useMemo(
    () => reports.find((r) => r.tuan_bat_dau === selectedWeek) ?? reports[0] ?? null,
    [reports, selectedWeek],
  );

  const generate = async (weekStart: string) => {
    setBusy(true);
    try {
      await BimFieldService.createReport(projectId, weekStart);
      await queryClient.invalidateQueries({ queryKey: ['bim-weekly-reports', projectId] });
      setSelectedWeek(weekStart);
      addToast({ type: 'success', message: 'Đã tạo báo cáo tuần.' });
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const copy = () => {
    if (!report) return;
    navigator.clipboard.writeText(weeklyReportText(report, projectName)).then(
      () => addToast({ type: 'success', message: 'Đã sao chép nội dung báo cáo.' }),
      () => addToast({ type: 'error', message: 'Không sao chép được.' }),
    );
  };
  const exportDocx = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportWeeklyReportDocx(report, projectName);
    } catch (e) {
      addToast({ type: 'error', message: errorText(e) || 'Không xuất được Word.' });
    } finally {
      setExporting(false);
    }
  };

  const c = report?.noi_dung;
  return (
    <div className={`flex flex-col gap-2 text-xs ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-primary-600" aria-hidden />
        <span className="font-semibold text-txt-primary dark:text-white">Báo cáo tuần</span>
        <span className="flex-1" />
        {canEdit && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate(mondayIso(-1))}
              className={btn}
              data-tooltip="Tạo (lại) báo cáo của tuần trước"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3 w-3" aria-hidden />
              )}{' '}
              Tuần trước
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate(mondayIso(0))}
              className={btn}
              data-tooltip="Tạo báo cáo tạm của tuần này (tính đến hiện tại)"
            >
              <RefreshCw className="h-3 w-3" aria-hidden /> Tuần này
            </button>
          </>
        )}
      </div>
      <p className="text-2xs text-txt-muted">
        Sự kiện mới tính trong tuần đã chọn. Trạng thái đang mở, chất lượng, nghiệm thu và tiến độ là ảnh chụp tại lúc
        lập báo cáo.
      </p>
      {error && (
        <p role="alert" className="text-rose-600">
          Không tải được báo cáo: {error.message}
        </p>
      )}
      {reports.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {reports.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedWeek(r.tuan_bat_dau)}
              aria-pressed={report?.id === r.id}
              className={`doc-button shrink-0 px-2 py-1 text-2xs ${report?.id === r.id ? 'doc-primary' : ''}`}
              data-tooltip={`Tạo lúc ${formatDateTime(new Date(r.tao_luc))}`}
            >
              {vnDate(r.tuan_bat_dau)} – {vnDate(r.tuan_ket_thuc)}
              {r.noi_dung.tu_dong && <Bot className="ml-1 inline h-3 w-3" aria-label="tự động" />}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-1.5 p-4 text-txt-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Đang tải báo cáo…
        </div>
      ) : !report || !c ? (
        <div className="space-y-1 rounded-xl border border-dashed border-border p-4 text-txt-muted dark:border-slate-600">
          <p>Chưa có báo cáo tuần nào. Chọn tuần để tạo bản tổng hợp từ dữ liệu hiện có.</p>
          {canEdit && (
            <p>
              Bấm <b>Tuần trước</b> để tạo ngay báo cáo đầu tiên.
            </p>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-txt-muted">
              {projectName || c.ten_du_an || projectId} · {vnDate(c.tu_ngay)} – {vnDate(c.den_ngay)}
              {c.tu_dong && <span className="ml-1">(tự động)</span>}
            </span>
            <button
              type="button"
              onClick={copy}
              className={btn}
              data-tooltip="Sao chép văn bản để dán vào e-mail / biên bản giao ban"
            >
              <Copy className="h-3 w-3" aria-hidden /> Sao chép
            </button>
            <button
              type="button"
              onClick={() => void exportDocx()}
              disabled={exporting}
              className={btn}
              data-tooltip="Xuất Word"
            >
              {exporting ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <FileDown className="h-3 w-3" aria-hidden />
              )}{' '}
              Word
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Vướng mắc mới / đã xử lý"
              value={`${n(c.vuong_mac.moi)} / ${n(c.vuong_mac.da_xu_ly)}`}
              hint={`${n(c.vuong_mac.dang_mo)} đang mở · ${n(c.vuong_mac.qua_han)} quá hạn`}
              tone={c.vuong_mac.qua_han ? 'text-rose-600' : undefined}
            />
            <Stat
              label="Va chạm"
              value={`${n(c.va_cham.phien_moi)} phiên · ${n(c.va_cham.so_va_cham_moi)} va chạm`}
              hint={c.va_cham.phien_gan_nhat ? `Gần nhất: ${c.va_cham.phien_gan_nhat.ten}` : 'Chưa dò va chạm'}
            />
            <Stat
              label="Mô hình tải lên"
              value={n(c.mo_hinh.tai_len_trong_tuan)}
              hint={`${n(c.mo_hinh.san_sang)} sẵn sàng · ${n(c.mo_hinh.loi)} lỗi`}
              tone={c.mo_hinh.loi ? 'text-amber-600' : undefined}
            />
            <Stat
              label="Khối lượng khai báo"
              value={c.chat_luong.ty_le_khai_bao != null ? `${c.chat_luong.ty_le_khai_bao}%` : '—'}
              hint={
                c.chat_luong.so_mo_hinh_cu
                  ? `${n(c.chat_luong.so_mo_hinh_cu)} mô hình cần chuyển đổi lại`
                  : `${n(c.chat_luong.so_cau_kien)} cấu kiện`
              }
            />
            <Stat
              label="Nghiệm thu gắn cấu kiện"
              value={n(c.nghiem_thu.bien_ban_moi)}
              hint={`${n(c.nghiem_thu.dat)} đạt · ${n(c.nghiem_thu.khong_dat)} không đạt · ${n(c.nghiem_thu.cho_ket_luan)} chờ`}
            />
            <Stat
              label="Mức sử dụng"
              value={`${n(c.su_dung.luot)} lượt`}
              hint={`${n(c.su_dung.nguoi_dung)} người dùng`}
            />
            {c.tien_do ? (
              <Stat
                label="Công việc hoàn thành / tổng"
                value={`${n(c.tien_do.hoan_thanh)} / ${n(c.tien_do.tong)}`}
                hint={`${n(c.tien_do.cham)} chậm so với kế hoạch`}
                tone={c.tien_do.cham ? 'text-rose-600' : undefined}
              />
            ) : (
              <Stat label="Tiến độ" value="—" hint={scheduleLine(c).replace(/^7\. Tiến độ: /, '')} />
            )}
            {c.chi_phi ? (
              <Stat
                label="Lệnh thay đổi duyệt trong tuần"
                value={n(c.chi_phi.lenh_duyet_so)}
                hint={`${n(c.chi_phi.lenh_duyet_gia_tri)} đ · ${n(c.chi_phi.lenh_cho_so)} chờ duyệt · ${n(c.chi_phi.hop_dong_ky_so)} hợp đồng ký`}
              />
            ) : (
              <Stat label="Chi phí" value="—" hint={costLine(c).replace(/^8\. Chi phí: /, '')} />
            )}
          </div>

          {c.vuong_mac.danh_sach_moi.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-txt-primary dark:text-white">Vướng mắc mới trong tuần</p>
              <ul className="space-y-0.5">
                {c.vuong_mac.danh_sach_moi.map((i) => (
                  <li key={i.id} className="flex items-center gap-1.5 text-txt-secondary dark:text-slate-300">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${i.uu_tien === 'critical' || i.uu_tien === 'high' ? 'bg-rose-500 dark:bg-rose-500' : 'bg-amber-400 dark:bg-amber-400'}`}
                    />
                    <span className="truncate">{i.tieu_de}</span>
                    {i.nguoi_xu_ly && <span className="shrink-0 text-txt-muted">· {i.nguoi_xu_ly}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.su_dung.cong_cu.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-txt-primary dark:text-white">Công cụ dùng nhiều</p>
              <div className="flex flex-wrap gap-1">
                {c.su_dung.cong_cu.map((t) => (
                  <span
                    key={t.cong_cu}
                    className="rounded bg-bg-subtle px-1.5 py-0.5 text-txt-secondary dark:bg-slate-700 dark:text-slate-300"
                  >
                    {toolLabel(t.cong_cu)} <b>{n(t.so_lan)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
