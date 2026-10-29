# Kế hoạch nâng cấp UI/UX và hoàn thiện bản demo

**Ngày lập:** 29/10/2026 (bản chỉnh lần 2, theo yêu cầu: ưu tiên UI/UX đẹp, chuẩn; bản demo chưa cần email, phân quyền hay bảo mật mở rộng).
**Trạng thái:** ĐÃ DUYỆT qua chat 29/10/2026 ("Làm bộ màu giống bên dự án cic-hud; Làm thẳng"). 
- **Xong 29/10:** B0 (commit `5b446cd`, 128/128 test Worker đạt) và bộ màu cic-hud và menu trái hai tông (commit `a5224e7`), trên nhánh `feat/ui-ux-cic-hud-palette`.
- **Xong 29/10:** U1, bộ component nền, `DataTable`, `lint:ui` mở rộng, `/dev/ui`, `docs/UI_DESIGN_SYSTEM.md` (commit `f1ed145`).
- **Xong 29/10:** U2, khung ứng dụng:
  - menu nhóm theo nghiệp vụ, có số hồ sơ quá hạn / sắp đến hạn;
  - thanh trên có breadcrumb, tìm nhanh Ctrl+K / `/`, chuông báo hạn dẫn tới danh sách đã lọc `?sla=`, menu tài khoản;
  - nút Trợ lý AI lên thanh trên;
  - tách `LoginPage` khỏi `RequireAuth`.
- **Tiếp theo:** U3 (danh sách và bộ lọc), sau đó U4–U7, B1, B2, B4.
- **Ghi nhận cho B2:** trên cloud staging, `GET /cases/{id}` mất khoảng 4 giây, danh sách khoảng 1,5 giây, trong khi xử lý trong tiến trình Worker chỉ mất 20–40 ms. Thời gian dồn vào các vòng truy vấn tới Supabase (Tokyo), cần gộp truy vấn hoặc cache.
**Quyết định đã chốt:**
1. **Bộ màu theo cic-hud:** 12 bộ màu hai tông (`config/palettes.ts` của cic-hud — nền menu tối trầm + màu nhấn ánh kim + màu chủ đạo), bộ chọn bộ màu, menu trái nền tối theo bộ màu, nền "bảo vệ mắt" cát ấm của cic-hud. Mặc định cho Sở Xây dựng: **"Lam công vụ"** (teal `#00668c` + vàng đồng), đổi được sang bộ "HUD" hoặc bộ khác.
2. **Bỏ bước mockup U0:** làm thẳng trên ứng dụng, duyệt trên giao diện thật; vẫn chụp ảnh "trước" để so sánh.
**Bản trước:**
- [H0–H8, bản nháp chưa duyệt](docs/plans/20261029-ke-hoach-H0-H8-ban-nhap-truoc-uu-tien-UI.md)
- [N0–N6, ba nghiệp vụ lõi](docs/plans/20261029-ke-hoach-N0-N6-truoc-hoan-thien-full-stack.md)

---

## 1. Thay đổi so với bản trước

| Bỏ hoặc hoãn (không cần cho demo) | Giữ lại | Thêm mới hoặc nâng lên trọng tâm |
| --- | --- | --- |
| Email/SMS, job nhắc hạn chạy nền | Sửa các lỗi làm demo hiển thị sai (mất loại hồ sơ con, lệch ngày, trùng số GP) | **Hệ thống thiết kế và bộ component nền** |
| Ủy quyền, chuyển giao khi vắng | Hoàn thiện N4 (nghiệm thu) ở mức đủ trình diễn | **Thiết kế lại khung ứng dụng, danh sách, không gian xử lý hồ sơ, dashboard** |
| Test RLS, chạy test Postgres trong CI, dọn migration quyền anon | Tách bước Trưởng phòng / Lãnh đạo, cấp số văn bản (để văn bản in ra đẹp, đủ số) | **Mockup để anh/chị duyệt trước khi code** |
| Adapter DVC, trang công khai GP, Git LFS | AI thật (khi có credential) | **Dữ liệu demo "sống"**: ngày tháng tính theo hôm nay, đủ các trạng thái hạn |
| Tách đoạn OCR ra bảng riêng (để sau khi có dữ liệu thật) | Tăng tốc những chỗ người dùng cảm nhận được | **Hộp việc, tìm nhanh toàn cục (Ctrl+K), toast, skeleton, trạng thái rỗng** |

Phân quyền và bảo mật **giữ nguyên như hiện có**: không làm thêm, cũng không gỡ bỏ.

---

## 2. Hiện trạng giao diện đã quan sát

Nguồn: chụp màn hình ở khổ 1024×768, đọc nội dung dashboard và quét mã `src/`.

| # | Vấn đề | Bằng chứng |
| --- | --- | --- |
| 1 | **Chưa có bộ component nền dùng chung.** `components/ui` mới có Tooltip, EntityLink, SearchableSelect, NumberInput, DateInput, StatusBadge, GridToolbar. Nút, modal, tab, thẻ, trạng thái rỗng, skeleton, toast đều viết tay ở từng trang | `src/components/ui/` |
| 2 | **Thiếu nhất quán về chữ, bo góc, đổ bóng:** 12 cỡ chữ (có `text-[8px]`, `text-[8.5px]`, `text-[9px]` — quá nhỏ); bo góc trộn `rounded-lg` (87) / `rounded-xl` (65) / `rounded-md` (19); 8 kiểu bóng | quét `src/` |
| 3 | **Danh sách hồ sơ chật ở 1024px:** các cột xuống dòng nhiều, nhãn hạn "Quá 43 ngày làm việc" vỡ thành 5 dòng, bộ lọc chiếm 3 hàng | `/projects/appraisal` |
| 4 | **Nút trợ lý nổi che nút "Trang sau"** ở góc phải dưới | `/projects/appraisal` |
| 5 | **Menu trái đánh số "1. Dashboard", "2. Quản lý dự án"…** trông như mục lục văn bản; breadcrumb đầu trang bị cắt chữ | `AppLayout.tsx` |
| 6 | **Không gian xử lý hồ sơ quá tải:** `AppraisalWorkspace.tsx` 1.131 dòng, khoảng 10 tab, 7 loại modal trong một component; chưa có thanh tiến trình theo các bước pháp lý; tài liệu và phiếu không đặt cạnh nhau | `pages/projects/appraisal/AppraisalWorkspace.tsx` |
| 7 | **Dashboard nhiều số nhưng thiếu thứ bậc:** 13 ô số cùng cỡ; không phân theo vai trò (chuyên viên cần "việc của tôi", lãnh đạo cần KPI); bấm vào số không dẫn tới danh sách đã lọc | `CloudDashboard.tsx` |
| 8 | **Dữ liệu demo cũ theo ngày:** Quá hạn 10, Sắp đến hạn 0, Trong hạn 0 — khi trình diễn trông như hệ thống toàn hồ sơ trễ hạn | dashboard ngày 29/10/2026 |
| 9 | Khoảng 96 chỗ màu cứng không có `dark:`; 5 tên thực thể chưa dùng `EntityLink`; bảng, tab, dòng chưa dùng được bằng bàn phím | báo cáo rà soát Web |
| 10 | Trạng thái rỗng cụt ("Chưa có dữ liệu trong phạm vi đã chọn."), không gợi ý bước tiếp theo; thao tác thành công/lỗi chưa có toast thống nhất | `DossierGrid`, `SlaBadge` |
| 11 | Chưa có trang hướng dẫn trong ứng dụng; tài liệu hướng dẫn còn ghi cổng cũ | `docs/HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md` |

Điểm tốt cần giữ:
- Màu thương hiệu teal `#00668c` và đỏ cờ.
- Token màu theo theme (sáng, bảo vệ mắt, tối) trong `tokens.css`.
- Khung A4 khóa cứng.
- `GridToolbar` đúng thứ tự.
- Route nạp lười (lazy), cache danh sách.

---

## 3. Nguyên tắc thiết kế

1. **Phong cách hành chính hiện đại:** nghiêm túc, sạch, nhiều khoảng trắng, chữ đủ lớn (tối thiểu 12px, nội dung chính 14px). Màu dùng để chỉ ý nghĩa (trạng thái, hạn), không dùng để trang trí.
2. **Một hệ token duy nhất** cho chữ, khoảng cách, bo góc, đổ bóng, màu ngữ nghĩa. Màu trạng thái và hạn xử lý thống nhất trên mọi màn hình.
3. **Việc chính lên trước:** mỗi màn hình trả lời "tôi cần làm gì tiếp" (nút chính rõ ràng, hạn xử lý nổi bật, hồ sơ của tôi lên đầu).
4. **Tuân thủ bảng rà soát trong `CLAUDE.md`:** Tooltip, EntityLink, guard form con, SearchableSelect, NumberInput, DateInput, dark mode, A4, thứ tự thanh lọc. Các quy tắc này được đóng gói sẵn vào component nền, nên trang mới tự đúng chuẩn.
5. **Khổ màn hình:** thiết kế cho 1366–1920px, dùng tốt ở 1024px; tablet 768px xem được.
6. **Duyệt bằng hình trước khi code:** mỗi màn hình lớn có mockup để anh/chị duyệt.
7. **Đổi tính năng thì sửa luôn dữ liệu mẫu** trong cùng đợt.

---

## 4. Lộ trình

```
B0 Sửa lỗi demo ─► U0 Chuẩn thiết kế + mockup (anh/chị duyệt) ─► U1 Bộ component nền ─► U2 Khung ứng dụng
                                                                                          │
                          ┌───────────────────────────────────────────────────────────────┘
                          ├─► U3 Danh sách & bộ lọc ──┐
                          ├─► U5 Dashboard ───────────┼─► U6 Trải nghiệm chung ─► U7 Kiểm tra hình ảnh & responsive
                          └─► U4 Không gian xử lý hồ sơ (cùng B1 nghiệp vụ)
B2 Tăng tốc: rải theo U3–U5            B3 AI thật: khi có credential            B4 Dữ liệu demo sống: cuối mỗi đợt
```

### B0 — Sửa lỗi làm demo hiển thị sai (1–2 ngày)

| # | Việc | File chính |
| --- | --- | --- |
| B0.1 | Lưu "loại hồ sơ con" trên lần nộp. Tải tệp hoặc OCR không còn xóa trường này, nên SLA và số lần kiểm tra không còn bị tính sai. Backfill dữ liệu demo | `domain.py`, `ocr_jobs.py`, `sla.py`, `store.py`, `procedure_review.py` |
| B0.2 | Ngày theo giờ Việt Nam (`Asia/Ho_Chi_Minh`) thay cho cắt chuỗi UTC và `date.today()` của máy chủ | `domain.py`, `sla.py`, `workflow.py`, `store.py` |
| B0.3 | Cấp số GP (và số văn bản ở B1) trong một giao dịch, không trùng | `permits.py`, `store.py`, migration nhỏ |
| B0.4 | Launcher: hạn chờ dài hơn cho Web (90 giây, cấu hình được), báo rõ dịch vụ nào chưa lên | `scripts/appraisal.mjs` |
| B0.5 | Worker ghi log lỗi thay vì nuốt lỗi, để dễ dò khi demo | `jobs.py`, `deps.py`, `ocr_jobs.py`, `sla.py`, `gallery.py` |

### U0 — Chuẩn thiết kế (0,5–1 ngày) — *đã bỏ mockup theo quyết định 29/10; phần dưới chỉ giữ chụp ảnh "trước" và tài liệu chuẩn*

- Chụp toàn bộ màn hình hiện tại ở chế độ sáng và tối, khổ 1366 và 1920, làm ảnh "trước" để so sánh.
- Viết `docs/UI_DESIGN_SYSTEM.md`:
  - **Chữ:** 6 cỡ (12/13/14/16/20/24px) và độ đậm.
  - **Khoảng cách:** bậc 4px.
  - **Bo góc:** 3 mức (6/10/14px).
  - **Đổ bóng:** 3 mức.
  - **Màu ngữ nghĩa** cho trạng thái quy trình và hạn xử lý (trong hạn / sắp đến hạn / quá hạn / tạm dừng / hoàn tất).
  - **Mật độ bảng:** thoáng / gọn.
  - **Icon:** lucide, cỡ 16/20.
- **Mockup tương tác (HTML) cho 4 màn hình:**
  1. Khung ứng dụng (menu trái, thanh trên, tìm nhanh);
  2. Danh sách hồ sơ;
  3. Không gian xử lý hồ sơ BCNCKT;
  4. Dashboard theo vai trò.

  Có cả bản sáng và tối.
- **Gate:** anh/chị duyệt mockup và chuẩn thiết kế, sau đó mới bắt đầu U1.

### U1 — Bộ component nền (3–4 ngày)

Thêm vào `src/components/ui/`, mỗi component đã có sẵn dark mode, điều hướng bàn phím, Tooltip (không dùng `title`) và đúng quy chuẩn `CLAUDE.md`:

| Component | Ghi chú |
| --- | --- |
| `Button`, `IconButton` | 4 kiểu (chính, phụ, viền mờ, nguy hiểm), 3 cỡ, trạng thái đang xử lý |
| `PageHeader` | Tiêu đề, breadcrumb không cắt chữ, mô tả ngắn, vùng nút thao tác |
| `Card`, `Section` | Khung nội dung thống nhất |
| `Tabs` | Có `role="tab"`, phím mũi tên, đếm số trên tab |
| `Modal`, `ConfirmDialog` | Tích hợp sẵn `useChildFormGuard` / `useUnsavedChangesGuard`; Esc chỉ đóng lớp trên cùng |
| `SlidePanel` chuẩn | Header `pr-14`, nút X `absolute top-3 right-3 z-30`, chân panel có thanh thao tác cố định |
| `StatusPill`, `SlaPill` | Một nơi định nghĩa màu và chữ cho mọi trạng thái; nhãn hạn gọn một dòng ("Quá 43 NLV"), chi tiết trong Tooltip |
| `EmptyState` | Hình minh họa nhỏ, câu giải thích, nút bước tiếp theo |
| `Skeleton` | Cho bảng, thẻ, panel |
| `Toast` | Thông báo thành công/lỗi thống nhất, thay các thông báo tự chế |
| `Field`, `FormRow`, `FormSection` | Nhãn, bắt buộc, gợi ý, lỗi; dùng chung cho `NumberInput`, `DateInput`, `SearchableSelect` |
| `KpiTile`, `Stepper`, `Timeline` | Dùng cho dashboard, tiến trình hồ sơ, lịch sử |
| `DataTable` | Gộp `MasterTable` và `DossierGrid`: kéo đổi độ rộng cột, sắp xếp, header dính, chọn cột hiển thị, mật độ, dòng bấm được bằng Enter, `aria-sort`, số thứ tự theo trang, lưu cấu hình vào `localStorage` |

- Thêm trang `/dev/ui` (chỉ bật ở demo) liệt kê mọi component để duyệt và so sánh.
- Mở rộng `lint:ui` để bắt:
  - `title` trên component;
  - `text-[8px]` và mọi cỡ chữ ngoài thang;
  - màu nền thiếu `dark:`;
  - nút hoặc modal tự viết khi đã có component chuẩn.

### U2 — Khung ứng dụng (2–3 ngày)

- **Menu trái:**
  - bỏ đánh số;
  - nhóm theo nghiệp vụ (Tổng quan · Hồ sơ: BCNCKT, GPXD, Nghiệm thu · Danh mục · Kho văn bản · Trợ lý pháp luật · Cài đặt);
  - thu gọn còn biểu tượng;
  - hiện số việc đang chờ cạnh từng mục.
- **Thanh trên:**
  - breadcrumb đầy đủ;
  - **tìm nhanh toàn cục Ctrl+K** (hồ sơ theo mã, tên dự án, chủ đầu tư; viết tắt kiểu `sxd`, `gpxd` qua `smartSearch`);
  - chuông "việc sắp đến hạn" (tính khi mở trang, không gửi email);
  - menu người dùng;
  - gộp chọn theme vào một chỗ.
- **Nút trợ lý AI nổi:** không che phân trang. Nút tự né thanh phân trang, hoặc chuyển thành nút trên thanh trên.
- **Đăng nhập:** tách `LoginPage` khỏi `RequireAuth`; tinh chỉnh bố cục; giữ chọn nhanh tài khoản thử.

### U3 — Màn hình danh sách và bộ lọc (3–4 ngày)

Áp dụng cho các trang: BCNCKT, GPXD, Nghiệm thu, Dự án, Sổ GP, Danh mục, Kho văn bản.

- **Thanh lọc gọn một hàng** theo thứ tự chuẩn (tìm kiếm → phân loại → cán bộ → trạng thái → thời gian). Bộ lọc ít dùng nằm trong "Thêm bộ lọc". Bộ lọc đang áp dụng hiện dạng chip, xóa được từng cái.
- **Góc nhìn nhanh dạng tab:**
  - **Tất cả**
  - **Của tôi** — hồ sơ được phân công cho tôi
  - **Chờ tôi xử lý** — trưởng phòng: chờ rà soát; lãnh đạo: chờ duyệt
  - **Sắp đến hạn**
  - **Quá hạn**
- **Bảng dùng `DataTable`:**
  - cột hạn gọn một dòng;
  - cột phụ tự ẩn ở 1024px;
  - di chuột lên dòng hiện nút thao tác nhanh (mở, phân công, xuất);
  - chọn cột hiển thị;
  - phân trang có chọn số dòng mỗi trang.
- **Dự án** có thêm dạng thẻ; **Sổ GP** phân trang ở server.
- **Tạo hồ sơ mới:** biểu mẫu chia bước (chọn dự án → thủ tục → thành phần hồ sơ), có guard dữ liệu chưa lưu.

### U4 — Không gian xử lý hồ sơ (4–5 ngày, làm cùng B1)

- **Header hồ sơ:** mã, dự án (`EntityLink`), thủ tục, trạng thái, hạn (`SlaPill`), người phụ trách, nút chính theo bước hiện tại (ví dụ "Trình Trưởng phòng").
- **Thanh tiến trình theo bước pháp lý** (`Stepper`): Tiếp nhận → Kiểm tra hợp lệ → Thẩm định → Dự thảo → Rà soát → Ban hành. Bấm vào bước để xem việc của bước đó.
- **Chia đôi màn hình:** tài liệu PDF bên trái, phiếu thẩm định / đề xuất AI bên phải. Bấm vào trích dẫn thì PDF nhảy tới trang và tô sáng đoạn văn.
- **Đề xuất AI dạng thẻ:** nguồn, mức tin cậy, nút "Chấp nhận / Sửa / Bỏ qua"; đếm số đề xuất đã xử lý.
- **Danh sách việc cần xong trước khi trình** (checklist), thanh thao tác dính dưới cùng, chỉ báo "đã lưu lúc…".
- **Tách mã:** `AppraisalWorkspace.tsx` thành hook `useAppraisalCase` và các tab riêng; `SubmissionWorkspace` (GPXD/nghiệm thu) dùng cùng khung.
- **Xem trước A4:** thanh công cụ (phóng to/thu nhỏ, trang trước/sau, ảnh thu nhỏ các trang), tải PDF/DOCX; khung giữ đúng 210×297mm.

### U5 — Dashboard theo vai trò (2–3 ngày)

- **Chuyên viên:** việc của tôi hôm nay, hồ sơ sắp/đã quá hạn, hồ sơ chờ bổ sung, hoạt động gần đây.
- **Trưởng phòng / Lãnh đạo:**
  - 4 KPI chính có so sánh kỳ trước (hồ sơ đang xử lý, tỷ lệ đúng hạn, thời gian xử lý bình quân, số lần bổ sung);
  - biểu đồ hạn xử lý theo chuyên viên;
  - xu hướng theo tháng;
  - cơ cấu theo nghiệp vụ.
- **Mỗi số bấm được:** mở danh sách đã lọc tương ứng.
- **Biểu đồ:** bảng màu thống nhất cho cả sáng và tối, tooltip chuẩn, nạp sau khung trang (trang đầu nhẹ hơn).
- **Xuất báo cáo tháng/quý** ra Excel và Word A4 (bản đơn giản, phục vụ demo).

### U6 — Trải nghiệm chung (2–3 ngày)

- **Trạng thái:** skeleton khi tải; toast sau mỗi thao tác; xác nhận trước thao tác không hoàn tác được; lỗi hiển thị thân thiện kèm nút "Thử lại".
- **Trạng thái rỗng** có hướng dẫn và nút bước tiếp theo.
- **Câu chữ tiếng Việt:** rà toàn bộ, thống nhất thuật ngữ (lần nộp, hồ sơ gốc, ngày làm việc…), viết tắt đều có Tooltip giải thích.
- **Trang "Hướng dẫn"** trong ứng dụng, lấy từ tài liệu quy trình đã sửa cổng mới; tour giới thiệu 5 bước cho người mới (có thể tắt).
- **Bàn phím:** Ctrl+K tìm nhanh, `/` tìm trong danh sách, Esc đóng lớp trên cùng; có viền focus rõ.
- **Theme:** rà 3 chế độ sáng / bảo vệ mắt / tối trên mọi trang; sửa khoảng 96 chỗ màu cứng; 5 chỗ `EntityLink` còn thiếu; nội dung gây hiểu nhầm (chấm xanh cạnh "Chưa xác minh chứng chỉ").
- **Gallery:** ảnh thu nhỏ, xem ảnh lớn, sửa/xóa có guard.

### U7 — Kiểm tra hình ảnh và responsive (2 ngày)

- Chụp so sánh tự động (Playwright) cho các màn hình chính, chế độ sáng và tối, khổ 1024 / 1366 / 1920. Ảnh chuẩn lưu trong repo; CI báo khi giao diện lệch.
- Kiểm tra tablet 768px.
- Đối chiếu ảnh "trước / sau" với mockup U0.
- Viết `docs/UI_DELIVERY_*.md` gồm ảnh trước/sau.

### B1 — Hoàn thiện nghiệp vụ cho demo (4–6 ngày, song song U3/U4)

| # | Việc |
| --- | --- |
| B1.1 | **Hai bước duyệt:** Trưởng phòng rà soát → Lãnh đạo Sở duyệt, mỗi bước trả lại được kèm lý do |
| B1.2 | **Cấp số văn bản** khi Lãnh đạo duyệt cho Mẫu 03, 15, 16, Phụ lục VIII và số đóng dấu Mẫu 14, để văn bản in ra không còn "Số: [chưa cấp]"; thêm sổ văn bản đi đơn giản |
| B1.3 | Bộ lọc theo người phụ trách và theo bước, phục vụ tab "Của tôi" / "Chờ tôi xử lý" (U3) |
| B1.4 | **N4 nghiệm thu, đủ để trình diễn trọn luồng:** tách 3 nội dung đối chiếu khởi công (Điều 67); chọn BCNCKT/GP liên quan bằng `SearchableSelect`; sinh kế hoạch 2–3 lần kiểm tra; phiếu hiện trường có ảnh; danh mục Phụ lục VII; Phụ lục VIII điền từ kết luận; theo dõi khắc phục tồn tại |
| B1.5 | E2E luồng chính cho 3 nghiệp vụ (tạo → xử lý → trình → duyệt → xuất A4) |

### B2 — Tăng tốc những chỗ người dùng cảm nhận được (2–3 ngày, rải theo U3–U5)

- Danh sách trên cloud chỉ đọc cột tóm tắt, không đọc cả payload; bỏ việc tải 100 hồ sơ đầy đủ chỉ để đếm tài liệu.
- Gọi `health` một lần mỗi phiên, không gọi lại mỗi lần gõ tìm kiếm.
- Ảnh thu nhỏ cho gallery (thay ảnh gốc 5 MB).
- Sổ GP phân trang ở server; index cho loại hồ sơ con và số GP.
- Dashboard dùng cache ngắn (60 giây).
- Đo trước/sau bằng `scripts/benchmark_http.py`.

### B3 — AI thật (5–7 ngày, khi có credential)

- Đếm token và chi phí mỗi lần gọi.
- Kho văn bản có phiên bản và hiệu lực (thêm NĐ 212, Phụ lục II/III/IV NĐ 217, TT 34/39, QCVN).
- AI phân loại tệp, trích Tờ trình Mẫu 01 / Đơn GPXD.
- AI rà soát chéo hồ sơ nghiệm thu.
- Bộ đánh giá 20 tình huống/thủ tục.
- **Giao diện thẻ đề xuất (U4) làm trước, chạy được với chế độ quy tắc khi chưa có AI.**

### B4 — Dữ liệu demo "sống" (1–2 ngày, cập nhật cuối mỗi đợt)

- Ngày tháng trong dữ liệu mẫu **tính tương đối theo ngày chạy seed**, để dashboard luôn có đủ: trong hạn, sắp đến hạn, quá hạn, tạm dừng, hoàn tất đúng hạn.
- Mỗi nghiệp vụ có ít nhất 1 hồ sơ ở mỗi bước, có ảnh hiện trường, văn bản đã cấp số, đề xuất AI mẫu.
- Script `pnpm samples:refresh` làm mới dữ liệu demo trước buổi trình diễn (có bản chụp trước khi ghi đè).

---

## 5. Danh sách file dự kiến

| Nhóm | Sửa | Thêm |
| --- | --- | --- |
| B0 | `ai/app/{domain,ocr_jobs,sla,store,procedure_review,permits,workflow,jobs,deps,gallery}.py`, `scripts/appraisal.mjs` | migration bộ đếm số văn bản, test tương ứng |
| U0 | — | `docs/UI_DESIGN_SYSTEM.md`, mockup HTML (Artifact) |
| U1 | `tailwind.config.js`, `src/styles/tokens.css`, `scripts/lint-ui.mjs`, `MasterTable.tsx`, `DossierGrid.tsx` | `src/components/ui/{Button,IconButton,PageHeader,Card,Tabs,Modal,ConfirmDialog,SlidePanel,StatusPill,SlaPill,EmptyState,Skeleton,Toast,Field,KpiTile,Stepper,Timeline,DataTable}.tsx`, `src/pages/dev/UiGallery.tsx` |
| U2 | `layouts/AppLayout.tsx`, `components/auth/RequireAuth.tsx`, `App.tsx` | `components/layout/{Sidebar,Topbar,CommandPalette,DeadlineBell}.tsx`, `pages/LoginPage.tsx` |
| U3 | `pages/AppraisalPage.tsx`, `ProjectsPage.tsx`, `PermitRegister.tsx`, `CatalogPage.tsx`, `DocumentHub.tsx`, `GridToolbar.tsx` | `components/ui/grid/{FilterChips,SavedViews}.tsx`, biểu mẫu tạo hồ sơ theo bước |
| U4 | `AppraisalWorkspace.tsx`, `SubmissionWorkspace.tsx`, `ProcedureReview.tsx`, `WorkflowPanel.tsx`, `PdfPreview.tsx` | `pages/projects/appraisal/tabs/*`, `hooks/useAppraisalCase.ts`, `components/appraisal/{CaseHeader,SuggestionCard,DocumentSplitView}.tsx` |
| U5 | `CloudDashboard.tsx`, `ai/app/catalog.py` | `components/dashboard/*`, route KPI theo chuyên viên, xuất báo cáo |
| U6 | các trang còn màu cứng, `ProjectGalleryTab.tsx`, `ProjectDetailSlidePanel.tsx` | `pages/HelpPage.tsx`, tour giới thiệu |
| U7 | `.github/workflows/quality.yml` | `tests/e2e/visual/*`, ảnh chuẩn |
| B1 | `workflow.py`, `reporting.py`, `procedure_*.py`, `authority.py`, `routes/cases.py` | `components/appraisal/{InspectionPlan,SiteInspectionSheet}.tsx`, spec E2E |
| B2 | `store.py`, `routes/cases.py`, `AppraisalPage.tsx`, `ProjectGalleryTab.tsx` | migration index |
| B3 | `provider.py`, `legal_assistant.py`, `evidence_selection.py` | `ai/app/ai/*`, `knowledge-base/legal-manifest.json`, `ai/evaluation/*` |
| B4 | `ai/app/samples.py`, các script seed | `scripts/refresh_demo_dates.py` |

---

## 6. Kiểm thử và tiêu chí nghiệm thu

| Nhóm | Tiêu chí |
| --- | --- |
| Chuẩn thiết kế | Chỉ dùng cỡ chữ, bo góc, bóng trong thang; `lint:ui` mở rộng đạt 0 vi phạm |
| Hình ảnh | Ảnh so sánh U7 khớp mockup đã duyệt; sáng/tối/bảo vệ mắt đều đúng màu |
| Khổ màn hình | 1024px: danh sách không vỡ dòng nhãn hạn, bộ lọc một hàng, không có nút bị che; tablet 768px xem được |
| Thao tác | Việc chính (tìm hồ sơ, mở, xử lý, trình, duyệt, xuất A4) làm được bằng bàn phím; mọi thao tác có phản hồi (toast/skeleton) |
| Nghiệp vụ | E2E 3 nghiệp vụ qua 3 vai trò; văn bản có số không trùng; tải tệp/OCR không làm đổi hạn |
| Tốc độ | Danh sách < 500 ms; dashboard < 1 giây; trang đầu không nạp thư viện biểu đồ |
| Dữ liệu demo | Sau `samples:refresh`, dashboard có đủ 5 trạng thái hạn |
| Hồi quy | Toàn bộ test hiện có (116 Worker, 6 Web, 5 E2E) vẫn đạt |

---

## 7. Điểm cần anh/chị quyết định

1. **Phong cách màu:** đề xuất giữ teal `#00668c` làm màu chính, đỏ cờ làm điểm nhấn, giữ 3 chế độ sáng / bảo vệ mắt / tối. Bộ chọn 3 bảng màu (Teal / Đỏ cờ / Xanh hoàng gia) ở màn đăng nhập: giữ hay bỏ cho gọn?
2. **Mockup U0:** anh/chị muốn xem mockup trước (đề xuất), hay làm thẳng component rồi duyệt trên ứng dụng thật?
3. **Bản demo trên Vercel:** hiện chỉ có Web, chưa có API nên không dùng được. Đề xuất demo chạy local hoặc qua một máy chủ nhỏ (Docker) khi cần trình diễn từ xa; hạng mục này để ngoài kế hoạch cho tới khi anh/chị cần.
4. **Credential AI/OCR cho B3:** khi có thì làm; trước đó giao diện đề xuất vẫn chạy bằng quy tắc.

**Ngoài phạm vi đợt này:**
- email/SMS;
- job nhắc hạn chạy nền;
- ủy quyền;
- mở rộng phân quyền và bảo mật;
- test RLS;
- ký số;
- kết nối DVC và CSDL quốc gia;
- hosting trong nước.

---

## 8. Ước lượng

| Giai đoạn | Ngày công |
| --- | --- |
| B0 Sửa lỗi demo | 1–2 |
| U0 Chuẩn thiết kế + mockup | 1–2 (+ thời gian duyệt) |
| U1 Bộ component nền | 3–4 |
| U2 Khung ứng dụng | 2–3 |
| U3 Danh sách, bộ lọc | 3–4 |
| U4 Không gian xử lý hồ sơ | 4–5 |
| U5 Dashboard theo vai trò | 2–3 |
| U6 Trải nghiệm chung | 2–3 |
| U7 Kiểm tra hình ảnh, responsive | 2 |
| B1 Nghiệp vụ cho demo | 4–6 |
| B2 Tăng tốc | 2–3 |
| B4 Dữ liệu demo sống | 1–2 |
| **Tổng đợt UI/UX + demo** | **27–39 ngày công** |
| B3 AI thật (khi có credential) | 5–7 |

**Mốc đề xuất:**
- Tuần 1: B0 + U0, anh/chị duyệt mockup.
- Tuần 2–3: U1 + U2 + U3, cả hệ thống có giao diện mới ở khung và danh sách.
- Tuần 4–5: U4 + U5 + B1, không gian xử lý và dashboard mới, đủ luồng nghiệp vụ.
- Tuần 6: U6 + U7 + B2 + B4, hoàn thiện, kiểm tra hình ảnh, dữ liệu demo sống.

**Dừng theo Plan-First của CLAUDE.md. Chờ tin nhắn phê duyệt trực tiếp của anh/chị trước khi triển khai.**
