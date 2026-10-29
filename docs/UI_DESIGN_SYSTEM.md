# Chuẩn thiết kế giao diện — BuildAppraisal AI

**Cập nhật:** 29/10/2026 (U1).
**Nguồn gốc:**
- **Bộ màu và component nền:** đồng bộ với dự án **cic-hud** (`config/palettes.ts`, `components/ui/*`).
- **Quy tắc nghiệp vụ UI:** theo bảng rà soát trong `CLAUDE.md`.
- **Xem trực quan:** trang `/dev/ui` khi chạy `pnpm dev`. Trang có mọi component, đổi được bộ màu và chế độ nền.

## 1. Màu

| Nhóm | Token Tailwind | Dùng cho |
| --- | --- | --- |
| Màu chủ đạo | `primary-50…900` | Nút chính, liên kết, tab đang chọn, viền focus. Thang tự đổi theo bộ màu đang chọn. |
| Khung ứng dụng | `brand-sidebar`, `brand-sidebar-active`, `brand-sidebar-panel`, `brand-sidebar-border`, `brand-accent`, `brand-hero-*` | Menu trái, màn đăng nhập. Không dùng trong nội dung trang. |
| Ngữ nghĩa | `success-*`, `warning-*`, `danger-*`, `info-*` (50…900) | Trạng thái, hạn xử lý, thông báo. `bg-success` / `text-danger` (DEFAULT) vẫn dùng được. |
| Bề mặt | `bg-page`, `bg-surface`, `bg-subtle`, `bg-muted`, `bg-elevated`, `bg-bg-hover-row`, `bg-bg-stripe`, `bg-bg-overlay` | Tự đổi theo chế độ Sáng / Bảo vệ mắt / Tối. |
| Chữ | `text-ink`, `text-ink-secondary`, `text-ink-muted` (hoặc `text-txt-*`) | Chữ chính / phụ / mờ. |
| Viền | `border-border`, `border-border-subtle` | |

**Bộ màu chủ đạo:**
- Có 12 bộ hai tông, khai báo trong `src/config/palettes.ts`, giữ nguyên giá trị như cic-hud.
- Mặc định là **Lam công vụ** (`#00668c` + vàng đồng).
- Người dùng đổi bộ màu trong menu Cài đặt cá nhân, hoặc ở màn đăng nhập.
- Khi sửa giá trị màu, sửa đồng thời ở cả hai dự án.

**Ý nghĩa màu của hạn xử lý:**

| Trạng thái | Màu |
| --- | --- |
| Trong hạn | `success` |
| Sắp đến hạn | `warning` |
| Quá hạn / quá hạn bổ sung | `danger` |
| Tạm dừng | `violet` |
| Hoàn tất đúng hạn | `info` |
| Hoàn tất quá hạn | `orange` |
| Đã dừng, chưa xác định | `slate` |

Nguồn duy nhất của bảng này là `SLA_STATES` trong `components/appraisal/SlaBadge.tsx`.

**Chế độ tối:**
- Mọi lớp màu nền dạng bảng màu (`bg-slate-100`…) phải có `dark:bg-…` trong cùng chuỗi class. `lint:ui` chặn nếu thiếu.
- Nền tối phải đặc (`dark:bg-slate-800/900`, `dark:bg-success-900`), không dùng `dark:bg-x/50`.

## 2. Chữ, khoảng cách, bo góc, đổ bóng

| Thành phần | Quy định |
| --- | --- |
| Font | Inter; số liệu, mã hồ sơ, tiền dùng `font-mono tabular-nums`; văn bản A4 dùng `font-a4` (Times New Roman) |
| Thang chữ | `text-2xs` 10px (nhỏ nhất, chỉ cho nhãn phụ) · `text-xs` 12px · `text-sm` 14px (nội dung chính) · `text-base` 16px · `text-lg` 18px · `text-xl` 20px · `text-2xl` 24px. **Cấm** `text-[Npx]`. `text-3xs` cũ đã nâng lên 10px. |
| Khoảng cách | Bậc 4px của Tailwind; khoảng cách giữa nút bấm `gap-2`/`gap-3` |
| Bo góc | `rounded-lg` 8px: badge, nhãn · `rounded-xl` 12px: nút, ô nhập, chip · `rounded-2xl` 16px: thẻ, khung lọc, hộp thoại · `rounded-full`: pill trạng thái, avatar |
| Đổ bóng | `shadow-card` (thẻ) · `shadow-card-hover` · `shadow-dropdown` (popover, toast) · `shadow-modal` (hộp thoại) · `shadow-button` |
| Focus | `focus-visible:ring-2 focus-visible:ring-focus`; không dùng `outline-none` mà thiếu vòng focus |

## 3. Component nền (`src/components/ui`, import từ `components/ui`)

| Component | Khi nào dùng |
| --- | --- |
| `Button`, `IconButton`, `ButtonGroup` | Mọi nút. Kiểu: `primary` (1 nút chính / vùng), `secondary`, `outline`, `ghost`, `success`, `danger`, `link`. Mặc định `type="button"`; nút gửi form truyền `type="submit"`. `IconButton` bắt buộc `aria-label`, nên có `tooltip`. |
| `PageHeader` | Đầu trang: tiêu đề, mô tả, breadcrumb (chữ, không dùng link), vùng nút. |
| `Card`, `CardHeader`, `SectionHeader` | Khung nội dung, tiêu đề mục. |
| `Tabs` | Tab trong trang / panel; có đếm số, dùng phím ←/→. Kiểu `underline` hoặc `pills`. |
| `Modal` | Mọi hộp thoại. Đã gắn sẵn Child Form Guard và chặn mất dữ liệu (`dirty`). Esc chỉ đóng lớp trên cùng. `ReviewModal` cũ là lớp vỏ của `Modal`. |
| `confirm()` | Xác nhận trước thao tác không hoàn tác được: `if (await confirm({ title, tone: 'danger' }))`. |
| `toast` | Phản hồi sau thao tác: `toast.success('Đã lưu')`, `toast.error(...)`. Gọi được cả ngoài React. |
| `Badge` | Nhãn ngắn trung tính / ngữ nghĩa. |
| `SlaBadge` | Hạn xử lý: mặc định gọn một dòng ("Quá 43 NLV"), chi tiết trong Tooltip; `variant="full"` trong panel chi tiết. |
| `StatusBadge` | Trạng thái hồ sơ kiểu cũ (giữ tương thích). |
| `KpiTile` | Ô chỉ số dashboard; có `trend`, bấm được để mở danh sách đã lọc. |
| `Stepper` | Tiến trình theo bước pháp lý của hồ sơ. |
| `Timeline` | Lịch sử xử lý / audit (hiển thị tên người, không hiển thị UUID). |
| `EmptyState` | Danh sách rỗng: nói lý do và nút bước tiếp theo. |
| `Skeleton`, `SkeletonText`, `TableSkeleton`, `LoadingSpinner` | Trạng thái đang tải. Ưu tiên skeleton thay cho spinner. |
| `ProgressBar` | Tiến độ (phiếu thẩm định, tải tệp). |
| `ErrorMessage`, `ErrorBoundary` | Lỗi thân thiện kèm "Thử lại". |
| `FormSection`, `FormField` | Bố cục form: nhóm trường, nhãn, bắt buộc, giải thích, lỗi. |
| `NumberInput suffix="VNĐ"`, `DateInput`, `SearchableSelect` | Ô nhập tiền / ngày / danh sách (bắt buộc theo `CLAUDE.md`). |
| `PaginationBar` | Phân trang. |
| `DataTable` | Mọi bảng dữ liệu: kéo đổi độ rộng cột, sắp xếp, header dính, chọn cột, mật độ, dùng được bằng bàn phím. `MasterTable`, `DossierGrid` là lớp vỏ của nó. |
| `Tooltip`, `EntityLink`, `PalettePicker` | Như quy định trong `CLAUDE.md`. |

## 4. Mẫu bố cục

- **Trang danh sách:** `PageHeader` → `Tabs` (góc nhìn nhanh) → `GridToolbar` (thứ tự: tìm kiếm → phân loại → cán bộ → trạng thái → thời gian → nút) → `DataTable` → `PaginationBar`.
- **Hộp thoại form:** `Modal` có `footer` (Hủy = `ghost`, Lưu = `primary`), nội dung dùng `FormSection` + `FormField`, tính `dirty` bằng `JSON.stringify`.
- **Thao tác:** lưu xong gọi `toast.success`; thao tác nguy hiểm gọi `confirm` trước; lỗi gọi `toast.error` kèm mô tả.

## 5. Kiểm tra tự động

`pnpm lint:ui` (chạy trong CI) chặn:
- thuộc tính `title=` HTML;
- `<select>` gốc;
- `input type="date"` / `"number"` (cả dạng `{'date'}`);
- `<table>` ngoài `DataTable`;
- `Link` / `NavLink` / `useNavigate` ngoài khung ứng dụng;
- `toLocaleDateString`, `toLocaleString` (dùng `formatDate`, `formatNumber`);
- `minHeight` theo mm trong khung A4;
- `fixed inset-0` ngoài `Modal`;
- cỡ chữ `text-[Npx]`;
- nền dark mờ;
- màu nền bảng màu thiếu `dark:bg-`.

Thêm ngoại lệ vào `ALLOW` trong `scripts/lint-ui.mjs` kèm lý do.
