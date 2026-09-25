import { Settings, Shield, Database } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto text-xs">
      <div className="p-4 rounded-xl border border-border bg-surface shadow-xs">
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <Settings size={16} className="text-primary-500" />
          <span>Cấu hình Hệ thống & Phân quyền Tác nghiệp Sở Xây dựng</span>
        </h3>
        <p className="text-2xs text-ink-muted mt-0.5">
          Quản lý tài khoản, thẩm quyền phê duyệt và nhật ký an toàn thông tin
        </p>
      </div>

      {/* Phân quyền 4 cấp trong Sở */}
      <div className="p-5 rounded-xl border border-border bg-surface shadow-card space-y-4">
        <h4 className="font-bold text-ink uppercase tracking-wider text-2xs text-ink-muted flex items-center gap-1.5">
          <Shield size={14} className="text-primary-500" />
          <span>Phân quyền Tác nghiệp 4 Cấp trong Sở Xây dựng</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-ink">
          <div className="p-3.5 rounded-lg border border-border bg-subtle/50 space-y-1">
            <span className="font-bold text-primary-600">Cấp 1 — Lãnh đạo Sở:</span>
            <p className="text-2xs text-ink-secondary">
              Giám đốc & các Phó Giám đốc Sở: Toàn quyền xem Executive Dashboard, ký số phát hành kết quả thẩm định Mẫu 03 và Giấy phép xây dựng điện tử.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-subtle/50 space-y-1">
            <span className="font-bold text-primary-600">Cấp 2 — Lãnh đạo Phòng Chuyên môn:</span>
            <p className="text-2xs text-ink-secondary">
              Trưởng/Phó phòng QLXD, QLĐT: Phân công hồ sơ cho chuyên viên thụ lý, rà soát kết quả chuyên môn, ký duyệt chuyển Lãnh đạo Sở.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-subtle/50 space-y-1">
            <span className="font-bold text-primary-600">Cấp 3 — Chuyên viên Thụ lý:</span>
            <p className="text-2xs text-ink-secondary">
              Chuyên viên Phòng QLXD: Tác nghiệp trực tiếp, sử dụng AI Compliance Checker rà soát quy chuẩn, dự toán, PCCC, soạn thảo dự thảo Mẫu 03.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-subtle/50 space-y-1">
            <span className="font-bold text-primary-600">Cấp 4 — Văn thư & Bộ phận Một cửa:</span>
            <p className="text-2xs text-ink-secondary">
              Tiếp nhận hồ sơ điện tử tự động từ Cổng DVC Tân Dân, vào sổ quản lý, đóng dấu số Mẫu 14 và trả kết quả.
            </p>
          </div>
        </div>
      </div>

      {/* Thông số Tích hợp Cổng Dịch vụ công Tân Dân */}
      <div className="p-5 rounded-xl border border-border bg-surface shadow-card space-y-3">
        <h4 className="font-bold text-ink uppercase tracking-wider text-2xs text-ink-muted flex items-center gap-1.5">
          <Database size={14} className="text-emerald-500" />
          <span>Tích hợp Cổng Dịch vụ công Tỉnh Điện Biên (Nền tảng Tân Dân)</span>
        </h4>
        <div className="space-y-2 text-ink">
          <div className="flex justify-between py-1 border-b border-border">
            <span>Trạng thái kết nối API Tân Dân:</span>
            <span className="font-bold text-emerald-600">ĐANG HOẠT ĐỘNG (Online)</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border">
            <span>Webhook tiếp nhận hồ sơ mới:</span>
            <span className="font-mono text-primary-600">https://api.sxd.dienbien.gov.vn/v1/dvc-tandan/webhook</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Chu kỳ đồng bộ trạng thái SLA:</span>
            <span className="font-bold text-ink">Thời gian thực (Real-time Webhook)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
