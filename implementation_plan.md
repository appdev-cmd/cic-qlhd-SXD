# Kế hoạch Nâng cấp, Tối ưu & Hoàn thiện BuildAppraisal AI
*(Rà soát toàn bộ dự án — Sở Xây dựng tỉnh Điện Biên — lập ngày 25/09/2026)*

> Kế hoạch trước (bộ dữ liệu mẫu thẩm định cho 6 dự án) đã triển khai xong và được lưu tại `docs/plans/archive/2026-09_bo_du_lieu_mau_tham_dinh.md`.

---

## 0. Tóm tắt điều hành

Hiện tại dự án là một **bản demo giao diện (clickable prototype) chất lượng khá**: 9 màn hình, Slide Panel đa tầng, GIS, A4 preview, dark mode theo design token, TypeScript gần như sạch ở chế độ strict. Tuy nhiên **chưa phải phần mềm nghiệp vụ**:

| Khía cạnh | Tài liệu mô tả (README, CLAUDE.md, Kế hoạch v2.3) | Thực tế trong mã nguồn |
|---|---|---|
| Kiến trúc | Turborepo: `apps/web` (Next.js 15), `services/core` (NestJS), `ai/` (FastAPI), Redis, MinIO | **Một SPA Vite + React 19** ở thư mục gốc, gọi thẳng Supabase. Không có backend, không có AI worker |
| Dữ liệu | Supabase PostgreSQL, audit log, phân quyền theo phòng | 3/9 trang đọc Supabase (có fallback về mock); **6 trang còn lại đọc thẳng `MOCK_*`**. Không có bảng `audit_logs` / `ai_logs` |
| Đăng nhập / phân quyền | Chuyên viên, Trưởng phòng, Lãnh đạo Sở | **Không có đăng nhập**. RLS cho mọi user đã đăng nhập ghi toàn bộ bảng |
| Trợ lý AI pháp luật | RAG, trích dẫn kiểm chứng, nhật ký AI | **Câu trả lời soạn sẵn** theo từ khóa (`if/else` + `setTimeout`) nhưng hiển thị như AI có trích dẫn |
| SLA ngày làm việc | Đếm ngược theo NĐ 217/2026, trừ lễ Tết, tạm dừng/gia hạn | `slaStatus` là **giá trị gán cứng**, không có hàm tính ngày làm việc |
| Quy chuẩn UI ERP | 14 quy chuẩn bắt buộc | Khoảng một nửa đã có; **thiếu toàn bộ nhóm hook** (resize/sort cột, lưu bộ lọc, guard form, entity panel, audit tab) |

**Khuyến nghị:** nâng cấp theo 7 giai đoạn (GĐ 0 → GĐ 6, ~16–18 tuần). Đi từ **an toàn & dữ liệu thật**, sang **chuẩn hóa UI kit**, rồi **nghiệp vụ lõi NĐ 217**, **văn bản A4**, và cuối cùng là **AI thật + tích hợp**. GĐ 0 (≈1 tuần) nên làm ngay vì có lỗ hổng lộ dữ liệu cá nhân.

---

## ✅ TIẾN ĐỘ THỰC HIỆN (cập nhật 25/09/2026, nhánh `feat/nang-cap-toan-dien`)

**Quyết định đã chốt:** Supabase-first + lớp `data-access` (Q1) · Giai đoạn phát triển dùng Supabase Cloud, dữ liệu 100% demo, **chưa làm bảo mật** (Q2 — theo yêu cầu người dùng) · Giữ chế độ demo có banner (Q4) · Bắt đầu từ GĐ 0 (Q5). **Còn chờ:** Q3 (nhà cung cấp LLM cho RAG).

| GĐ | Trạng thái | Kết quả chính |
|---|---|---|
| 0 | ✅ Xong (trừ bảo mật — hoãn) | TS strict, ESLint, `lint:ui`, Vitest (31 test), CI; script `db:migrate/seed/check`; **sửa seed sai 26/26 dự án**; chống trắng trang khi thiếu `.env`; nhãn "AI minh họa"; README + đồng bộ file quy tắc |
| 1 | ✅ Xong (trừ đăng nhập/RLS — hoãn) | Schema v2 (unaccent, staff_users, material_prices, holidays, audit_logs + trigger, ai_logs, RPC dashboard); `src/data-access` + TanStack Query; 9/9 trang đọc DB; lọc/sắp xếp/phân trang tại DB |
| 2 | ✅ Xong | DataGrid (kéo cột, sắp xếp, lưu), GridToolbar 5 vị trí, useFilterState (URL + localStorage), useEntityPanel/EntityLink + deep link `/dossiers/{mã}`, Child-form & Unsaved guard, AutoTableTooltip, AuditHistoryTab; bundle đầu 392 → ~188 KB gzip; xóa 24 MB ảnh trùng |
| 3 | ✅ Xong phần lõi | SLA ngày làm việc (trừ lễ Tết), thẩm quyền Điều 32, form tiếp nhận + checklist Điều 35, quy trình theo vai trò (RPC `transition_dossier`), bổ sung 01 lần, gia hạn, phân công, lịch sử xử lý, dashboard số liệu thật |
| 4 | ✅ Xong | Mô hình văn bản NĐ 30, A4 tự phân trang, `print.css`, xuất DOCX, Mẫu 03 / GPXD / Yêu cầu bổ sung / Mẫu 14 dựng từ dữ liệu hồ sơ |
| 5 | ⏳ Chờ Q3 | RAG pháp luật, Compliance L1, golden set |
| 6 | ⏳ Chưa bắt đầu | Tân Dân, CSDL quốc gia, ký số, **bảo mật (Auth + RLS theo vai trò)**, hạ tầng trong nước |

**Đính chính rà soát:** mục A4 ở bảng 1.4 ghi "class `font-a4` chưa định nghĩa" là **sai** — `tailwind.config.js` đã có `fontFamily.a4`. Các thiếu sót thật (phân trang, print CSS, cỡ chữ thể thức) đã xử lý ở GĐ 4.

**Điểm cần lưu ý:**
- Vị trí số trang: quy tắc dự án ghi "góc phải lề dưới", NĐ 30/2020 quy định "canh giữa lề trên, không hiện trang 1". Hiện theo quy tắc dự án + không hiện trang 1; đổi vị trí chỉ cần sửa `AdminDocumentView.tsx` / `docx.ts`.
- Lịch nghỉ lễ 2026–2027 (`holidays`): ngày âm lịch / nghỉ bù đánh dấu `is_confirmed = false`, cần cán bộ xác nhận theo thông báo Bộ Nội vụ.
- Thời hạn kiểm tra nghiệm thu (20 ngày LV) đánh dấu "cần pháp chế xác nhận".

---

## 1. Kết quả rà soát chi tiết

Mức độ: 🔴 **P0** nghiêm trọng (làm ngay) · 🟠 **P1** cao · 🟡 **P2** trung bình · ⚪ **P3** dọn dẹp.

### 1.1. Bảo mật & dữ liệu cá nhân

| # | Mức | Phát hiện | Bằng chứng |
|---|---|---|---|
| S1 | 🔴 | Script mở quyền **đọc ẩn danh (anon)** cho bảng `personnel`, gồm **số CCCD (`id_card`)**, email, SĐT của 40 cá nhân. Ai có anon key (key này nằm công khai trong bundle JS) đều đọc được. Vi phạm Luật BVDLCN 2025 | `scripts/update_rls.ts:48-66` (`for select using (true)` không có `to authenticated`) |
| S2 | 🔴 | RLS ghi: `for all to authenticated using (true)`: mọi tài khoản đăng nhập đều sửa/xóa được mọi hồ sơ. Chưa phân quyền theo vai trò, phòng ban, `province_id` | `supabase/migrations/20260925000001_initial_schema.sql:246-265` |
| S3 | 🟠 | Mã project Supabase `cekaigfnriatarytvymb` ghi cứng trong script; script dùng `SUPABASE_ACCESS_TOKEN` (token quản trị toàn tài khoản) | `scripts/apply_supabase_schema.ts:313`, `scripts/update_rls.ts:746` |
| S4 | 🟠 | Google Maps API key lưu trong `localStorage` do người dùng nhập, không giới hạn referrer | `src/lib/googleMapsLoader.ts:338-358` |
| S5 | 🟠 | Không có đăng nhập, nên cũng không có dấu vết ai xem/sửa hồ sơ (trái yêu cầu audit log) | `src/App.tsx` (không có route auth) |
| S6 | 🟡 | Theo Kế hoạch v2.3 mục 7.2, **hồ sơ dự án phải lưu trong nước**. Supabase Cloud đang dùng vùng `ap-southeast-1` (Singapore) | `.env.example:6` |

### 1.2. Toàn vẹn dữ liệu

| # | Mức | Phát hiện | Bằng chứng |
|---|---|---|---|
| D1 | 🔴 | **Seed Supabase sai**: `generate_seed.ts` đọc các trường không tồn tại trên kiểu `Project` (`group`, `grade`, `field`, `deadline`, `investor`, `coordinates`…), nên **26/26 dự án đều thành "Nhóm B / Cấp II"**, hạn chót `2026-04-15`, chủ đầu tư `org-001`, tọa độ mặc định. Lỗi không bị phát hiện vì thư mục `scripts/` nằm ngoài `tsconfig` | `scripts/generate_seed.ts:111-143`; kiểm tra bằng `tsc` trên script cho ra 20 lỗi TS2339 |
| D2 | 🟠 | Lỗi được **che im lặng**: khi Supabase lỗi hoặc rỗng, service tự trả về mock. Người dùng không biết đang xem dữ liệu giả | `src/services/*.ts` (`fallback to mock data`) |
| D3 | 🟠 | `projectService` **trộn** bản ghi DB với mock theo `id` (tên và TMĐT lấy từ DB, còn lại lấy từ mock) → dữ liệu lai | `src/services/projectService.ts:26-33` |
| D4 | 🟠 | 6 trang đọc thẳng mock: Projects, Dashboard, GIS, Documents, CostDatabase; Organizations và Personnel đọc chéo `MOCK_PROJECTS` / `MOCK_PERSONNEL` | `src/pages/ProjectsPage.tsx:35`, `DashboardPage.tsx`, `GisMapPage.tsx`, `DocumentsPage.tsx`… |
| D5 | 🟠 | Kiểu dữ liệu (`Project`, `Organization`…) khai báo trong `data/mockData.ts`, còn schema DB đặt tên cột khác (`title`/`name`, `group_type`/`projectGroup`). Không có nguồn kiểu chung | `src/data/mockData.ts:18`, migration |
| D6 | 🟡 | Chưa tách **Dự án** và **Hồ sơ thẩm định (dossier)**: một dự án có nhiều lượt hồ sơ (BCNCKT → GPXD → nghiệm thu, bổ sung, gia hạn) | Schema `projects` gộp chung |
| D7 | 🟡 | Tải toàn bảng rồi lọc ở client (`select('*')` không phân trang, `getById` gọi `getAll`). Trái quy chuẩn Supabase 1000-Row Limit | `src/services/*.ts` |
| D8 | 🟠 | **Thiếu `.env` là trắng trang**: `createClient('')` ném lỗi `supabaseUrl is required` ngay khi import | `src/lib/supabase.ts:9` (đã kiểm chứng) |

### 1.3. Nghiệp vụ thẩm định (đối chiếu Kế hoạch v2.3 và NĐ 217/2026)

| # | Mức | Phát hiện |
|---|---|---|
| B1 | 🔴 | **Trợ lý AI giả lập nhưng hiển thị như thật**: câu trả lời có "trích dẫn" (Điều 32, 37 NĐ 217/2026…) được soạn sẵn theo từ khóa (`AiChatWidget.tsx:64-110`), còn `LegalAiPage` là danh sách tĩnh. Đây là rủi ro pháp lý theo Luật AI 2025 (nguyên tắc v2.3: "không có nguồn thì không kết luận", phải gắn nhãn nội dung AI). Cần gắn nhãn **"DEMO"** ngay, rồi thay bằng RAG thật ở GĐ 5 |
| B2 | 🟠 | Không có động cơ SLA: không tính ngày làm việc, lễ Tết, tạm dừng tối đa 01 lần (20 ngày làm việc), gia hạn; mốc 25/20 – 20/16 – 15/12 ngày theo nhóm A/B/C chưa được mã hóa |
| B3 | 🟠 | Không có quy trình trạng thái (state machine): Tiếp nhận → Kiểm tra hợp lệ (5 ngày làm việc) → Phân công → Thẩm định → Trưởng phòng duyệt → Lãnh đạo ký → Phát hành |
| B4 | 🟠 | Nút **"Tiếp nhận Hồ sơ Mới"** thực chất mở dự án đầu tiên trong mock (`ProjectsPage.tsx:185`). Chưa có form tiếp nhận |
| B5 | 🟡 | `EntityLink` không làm gì khi bấm (thân `handleClick` rỗng) và **chưa được dùng ở đâu**. Tên thực thể trong bảng là text thường | `src/components/ui/EntityLink.tsx:15-23` |
| B6 | 🟡 | Tra cứu CCHN dùng `alert()` giả lập kết nối CSDL Bộ XD | `src/pages/PersonnelPage.tsx:103` |
| B7 | 🟡 | Dashboard lấy số liệu tĩnh (`MOCK_DASHBOARD_STATS`, "trước ngày 05/10/2026" ghi cứng) |

### 1.4. Tuân thủ quy chuẩn UI (CLAUDE.md)

| Quy chuẩn | Trạng thái | Chi tiết |
|---|---|---|
| Universal Tooltip | ⚠️ Một phần | Có `Tooltip.tsx`, nhưng còn **24 thuộc tính `title=`** (SlidePanelStack 7, AppLayout 5, ProjectsPage, TT39InfoTab, GalleryTab). Chưa có `AutoTableTooltip` |
| Entity Link & Panel | ❌ | Chưa có `useEntityPanel`. URL `/projects` không có deep link `/projects/{id}` để chia sẻ hồ sơ |
| Child Form & Modal Guard | ❌ | Chưa có `useChildFormGuard` / `useUnsavedChangesGuard`. **Nhấn Esc khi đang mở lightbox ảnh sẽ đóng luôn Slide Panel cha** (`SlidePanelStack.tsx:128-139`, lightbox không chặn phím) |
| Searchable Select | ⚠️ | Còn 2 thẻ `<select>` native (`ProjectGalleryTab.tsx:491`, `ProjectTT39InfoTab.tsx:622`) |
| Currency Input / Date Picker | ⚠️ | `NumberInput`, `DateInput` đã có nhưng **chưa được dùng ở đâu** (chưa có form nhập) |
| Date Format | ⚠️ | 1 chỗ gọi `toLocaleDateString` (`ProjectGalleryTab.tsx:95`) |
| Dark Mode | ✅ Tốt | Dùng design token CSS (`text-ink`, `bg-surface`), đáp ứng tinh thần quy chuẩn. Lưu ý A4 preview cố ý nền trắng |
| Supabase 1000-Row | ❌ | Xem D7 |
| Audit History | ❌ | Chưa có bảng, chưa có `<AuditHistoryTab>`. Tab "Nhật ký AI Audit" hiện là dữ liệu mẫu |
| Persisted State, Resize, Sort | ❌ | `MasterTable` không resize, không sort, không lưu bộ lọc |
| Standard Filter Bar | ⚠️ | Vị trí 1, 2, 4 đạt; **thiếu vị trí 3** (Cán bộ/CĐT) và **vị trí 5** (khoảng ngày) |
| A4 Paper Standard | ⚠️ | Khung 210×297 và lề đạt. **Nhưng**: class `font-a4` chưa định nghĩa trong `tailwind.config.js` nên văn bản không ra Times New Roman; không có `@media print` / `@page`, nên **`window.print()` in cả giao diện ứng dụng**; chưa đánh số trang; cỡ chữ `text-xs` (12px) nhỏ hơn thể thức 13–14pt; `overflow: hidden` **cắt mất nội dung** khi văn bản dài quá 1 trang (cần phân trang) |
| Non-Overlapping UI | ✅ | Chưa thấy vi phạm rõ |
| `pnpm lint:ui` | ❌ | CLAUDE.md nhắc đến lệnh này nhưng **chưa có script** trong `package.json` |

### 1.5. Chất lượng kỹ thuật & hiệu năng

| # | Mức | Phát hiện |
|---|---|---|
| T1 | 🟠 | **Bundle JS gộp 1 file 1,42 MB** (gzip 392 KB). Chưa lazy-load route; recharts, leaflet, google maps đều nằm trong chunk chính |
| T2 | 🟡 | `public/images` nặng 48 MB, **ảnh bị nhân đôi** (`public/images/X` và `public/images/projects/X`), JPEG ~1,1 MB/ảnh, chưa có WebP hay kích thước thumbnail |
| T3 | 🟡 | `tsconfig` đang `strict: false`. Bật strict **chỉ có 1 lỗi** (`googleMapsLoader.ts:59`), nên có thể bật ngay |
| T4 | 🟡 | Không có ESLint, Prettier, test (unit/E2E), CI. `scripts/` không được type-check |
| T5 | ⚪ | Phụ thuộc thừa: `date-fns` không được import; dùng cả `leaflet` lẫn `@googlemaps/js-api-loader`. Ảnh fallback lấy từ Unsplash (mạng ngoài) |
| T6 | ⚪ | Dữ liệu mock ~160 KB nằm trong bundle production |

### 1.6. Vệ sinh repository & tài liệu

| # | Mức | Phát hiện |
|---|---|---|
| R1 | 🟡 | **README mô tả sai kiến trúc** (Turborepo/Next.js/NestJS/Docker), `pnpm db:push` / `docker:up` không tồn tại |
| R2 | 🟡 | 4 file quy tắc **giống hệt nhau** (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `RULES.md`, cùng MD5) cộng `.cursorrules`, dễ lệch khi sửa |
| R3 | 🟡 | Repo git chứa **~190 MB PDF/DOCX pháp luật** và `DinhMucXayDung.xlsx/.esd` (~21 MB). Nên chuyển sang Git LFS hoặc Supabase Storage |
| R4 | ⚪ | 7 file đang sửa dở và 5 file chưa track (hooks, scripts migration) chưa commit |

---

## 2. Quyết định kiến trúc đề xuất

**Chiến lược "Supabase-first, Adapter-ready"** cho giai đoạn thí điểm:

```
┌──────────────── Web SPA (Vite + React 19, cổng 3008) ────────────────┐
│ UI kit ERP (DataGrid, Guards, EntityPanel, A4 Engine)                 │
│ TanStack Query ─► lớp repository (src/data-access/*) ─► Supabase JS  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ JWT (Supabase Auth)
┌───────────────────────────────▼──────────────────────────────────────┐
│ Supabase (self-host trong nước khi go-live)                          │
│  • Postgres: schema nghiệp vụ + RLS theo vai trò/phòng/tỉnh           │
│  • audit_logs (trigger) · ai_logs · holidays · workflow_transitions   │
│  • RPC SQL: tính SLA ngày làm việc, thống kê dashboard                │
│  • Storage: hồ sơ, bản vẽ PDF, văn bản phát hành                      │
│  • pgvector: kho tri thức pháp luật (RAG)                            │
│  • Edge Functions: legal-rag, ký số/DVC adapter (mock)               │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ (GĐ 5–6)
                  AI worker Python (OCR, embedding bge-m3, LLM nội địa)
```

- **Lý do không dựng NestJS ngay:** với 1 đơn vị thí điểm, Supabase (Auth + RLS + RPC + Storage + Edge Functions) đủ đáp ứng và nhanh hơn 2–3 lần. Toàn bộ truy cập dữ liệu đi qua lớp `data-access` nên sau này đổi sang NestJS (theo v2.3) chỉ cần thay lớp này.
- **Chế độ Demo có kiểm soát:** giữ mock data nhưng chỉ bật bằng `VITE_DATA_MODE=demo`, luôn có **banner "DỮ LIỆU MẪU"**, và loại khỏi bundle production.

---

## 3. Lộ trình triển khai theo giai đoạn

### GĐ 0: Ổn định & Vá bảo mật khẩn cấp (≈ 1 tuần) 🔴

| Hạng mục | Nội dung |
|---|---|
| 0.1 | Thu hồi policy anon (`update_rls.ts`); tạo migration `…_revoke_anon_read.sql`. **Xoay (rotate) anon key và access token** nếu đã lộ |
| 0.2 | Sửa `generate_seed.ts` ánh xạ đúng trường (`projectGroup`, `buildingGrade`, `deadlineDate`, `investorId`, `getProjectCoordinates`); đưa `scripts/` vào `tsconfig.scripts.json` để type-check |
| 0.3 | `supabase.ts`: không `createClient` khi thiếu env, trả về chế độ demo kèm cảnh báo (hết trắng trang) |
| 0.4 | Gắn nhãn **"Chế độ minh họa – chưa kết nối AI"** cho AiChatWidget và LegalAiPage |
| 0.5 | Bật `strict: true` (sửa 1 lỗi); thêm ESLint + `typescript-eslint` + `eslint-plugin-react-hooks` |
| 0.6 | Tạo `pnpm lint:ui` (`scripts/lint-ui.ts`): quét `title=`, `<select`, `type="date"`, `type="number"`, `toLocaleDateString`, `<a href` nội bộ, `useNavigate` |
| 0.7 | CI GitHub Actions: `typecheck` → `lint` → `lint:ui` → `build` |
| 0.8 | Viết lại README theo kiến trúc thực tế; gộp 4 file quy tắc thành 1 nguồn (`RULES.md`), các file còn lại chỉ trỏ tới |
| 0.9 | Commit phần việc đang dở (hooks Supabase, migration scripts) thành các commit rõ ràng |

### GĐ 1: Nền tảng Dữ liệu, Đăng nhập & Phân quyền (≈ 2 tuần) 🟠

| Hạng mục | Nội dung |
|---|---|
| 1.1 | **Schema v2** (migration mới, không sửa migration cũ): `provinces`, `departments`, `dossiers` (tách khỏi `projects`, có `procedure_type`, `state`, `received_at`, `sla_deadline`, `paused_days`, `extension_count`), `dossier_assignments`, `workflow_transitions`, `holidays`, `audit_logs`, `ai_logs`, `document_versions` |
| 1.2 | Trigger `audit_log_trigger()` ghi `old/new jsonb`, `actor_id`, `action` cho mọi bảng nghiệp vụ. View `audit_logs_resolved` đổi UUID sang tên để hiển thị |
| 1.3 | **RLS theo vai trò**: `officer` chỉ thấy hồ sơ được phân công hoặc thuộc phòng mình; `head_of_department` thấy toàn phòng; `director` thấy toàn Sở; ghi hạn chế theo `state`. Hàm `auth_role()`, `auth_department()` |
| 1.4 | Supabase Auth: trang `/login`, `AuthProvider`, `ProtectedRoute`, hồ sơ người dùng (`profiles`), đăng xuất; hiển thị vai trò trên header |
| 1.5 | Sinh kiểu TS từ DB (`supabase gen types` → `src/types/database.ts`); tầng `src/data-access/` (repository + mapper DB↔UI); bỏ merge mock trong `projectService` |
| 1.6 | Thêm **TanStack Query** (cache, loading, error, retry); hiển thị trạng thái lỗi rõ ràng thay vì âm thầm dùng mock |
| 1.7 | Chuyển 6 trang đọc mock sang hook dữ liệu; phân trang và lọc ở DB (`.range()`, `.eq()`, `.ilike()`); RPC `search_dossiers()` hỗ trợ không dấu (`unaccent`) |
| 1.8 | Chuyển mock sang `src/demo/` và tải động (`import()`) chỉ khi `VITE_DATA_MODE=demo` |

### GĐ 2: Chuẩn hóa UI Kit ERP (≈ 2 tuần) 🟠

| Hạng mục | Nội dung |
|---|---|
| 2.1 | `DataGrid` thay `MasterTable`: `useColumnResize` / `useGridColumns` (lưu `localStorage`), `useGridSort` (click tiêu đề, 3 trạng thái), cột ẩn/hiện, sticky header, ảo hóa hàng khi > 200 dòng |
| 2.2 | `GridToolbar` 5 vị trí chuẩn + `GridSearchInput`, `GridResetButton`, `GridCount`; `useFilterState` (đồng bộ URL query + `localStorage`). Bổ sung **vị trí 3** (Cán bộ / CĐT) và **vị trí 5** (khoảng ngày bằng `DateInput`) |
| 2.3 | `useEntityPanel()` + đăng ký loại thực thể (`dossier`, `project`, `organization`, `personnel`); `EntityLink` gọi `open(type, {id})`; **deep link** `/dossiers/:id` mở panel khi tải trang |
| 2.4 | `useChildFormGuard(isOpen)`, `useUnsavedChangesGuard(isDirty)` (so sánh `JSON.stringify`), gắn `data-modal-open` lên `body`; SlidePanelStack bỏ qua Esc/backdrop khi có modal con. Sửa lightbox, `GoogleApiKeyModal` |
| 2.5 | Thay 24 thuộc tính `title=` bằng `<Tooltip>`; thêm `<AutoTableTooltip />` vào provider; thay 2 `<select>` native; sửa `toLocaleDateString` |
| 2.6 | `<AuditHistoryTab entityType entityId />` đọc `audit_logs_resolved`, gộp với `ai_logs` |
| 2.7 | **Hiệu năng:** lazy-load route (`React.lazy`), `manualChunks` (recharts, leaflet, maps), mục tiêu chunk đầu < 300 KB gzip; tối ưu ảnh (xóa bản trùng, WebP, thumbnail 480px) mục tiêu `public/` < 10 MB |

### GĐ 3: Nghiệp vụ lõi theo NĐ 217/2026 (≈ 3 tuần) 🟠

| Hạng mục | Nội dung |
|---|---|
| 3.1 | **Form Tiếp nhận hồ sơ** trên Slide Panel: `SearchableSelect` (CĐT, loại thủ tục, nhóm, cấp), `NumberInput suffix="VNĐ"` (TMĐT), `DateInput`; checklist thành phần hồ sơ Điều 35 (BCNCKT) / Điều 44 Luật XD (GPXD); tải file lên Storage |
| 3.2 | **Tự xác định thẩm quyền** (Điều 32): Sở / UBND cấp xã / Bộ chuyên ngành, dựa trên hình thức đầu tư, nhóm, cấp công trình; cảnh báo khi không thuộc thẩm quyền |
| 3.3 | **Workflow engine** (bảng `workflow_transitions` + RPC `transition_dossier(id, action, note)` kiểm tra vai trò và trạng thái hợp lệ): Tiếp nhận → Kiểm tra hợp lệ → (Yêu cầu bổ sung, **chỉ 01 lần**) → Phân công → Thẩm định → Trưởng phòng duyệt → Lãnh đạo ký → Phát hành / Trả hồ sơ |
| 3.4 | **SLA engine** (hàm SQL `add_working_days()`, `working_days_between()` cùng bảng `holidays`): mốc theo nhóm A/B/C × cấp công trình, GPXD 20 ngày; tạm dừng/gia hạn; cảnh báo T-5, T-2; job định kỳ (pg_cron) cập nhật `sla_status` |
| 3.5 | Phân công chuyên viên và bộ môn (`appraisal_disciplines` đã có); checklist quy chuẩn lưu DB thay vì mock |
| 3.6 | **Dashboard thật:** RPC thống kê (số hồ sơ theo trạng thái, tỷ lệ đúng hạn, thời gian xử lý trung bình, TMĐT tiết giảm); tách view **Lãnh đạo Sở** (Executive) và **Chuyên viên** (việc của tôi) |
| 3.7 | Thông báo trong ứng dụng (chuông) khi được phân công, sắp đến hạn, bị trả lại |

### GĐ 4: Văn bản hành chính & In ấn A4 (≈ 2 tuần) 🟡

| Hạng mục | Nội dung |
|---|---|
| 4.1 | Định nghĩa `fontFamily.a4 = ['"Times New Roman"', 'Times', 'serif']`; cỡ chữ thể thức NĐ 30/2020 (quốc hiệu 12–13pt, nội dung 13–14pt) |
| 4.2 | **A4 Engine phân trang**: đo chiều cao nội dung và chia nhiều trang cố định 210×297mm (không `overflow` cắt chữ); số trang góc dưới phải từ trang 2 |
| 4.3 | `print.css`: `@page { size: A4; margin: 22mm 20mm 20mm 30mm }`, ẩn toàn bộ UI khi in, chỉ in vùng `.a4-print-root` |
| 4.4 | Template hóa: **Mẫu 01** (Tờ trình), **Mẫu 03** (Kết quả thẩm định), **GPXD**, **Mẫu 14** (dấu thẩm định trên bản vẽ PDF, dùng `pdf-lib`). Nội dung điền từ dữ liệu hồ sơ và checklist |
| 4.5 | Xuất **DOCX** (thư viện `docx`, lề và phông đúng chuẩn) và **PDF**; lưu phiên bản văn bản vào Storage cùng `document_versions` |
| 4.6 | Mã QR trên văn bản trỏ về `/dossiers/{id}` (tra cứu hồ sơ bản cứng) |

### GĐ 5: AI thật (RAG pháp luật & Compliance L1) (≈ 3–4 tuần) 🟡

| Hạng mục | Nội dung |
|---|---|
| 5.1 | **Pipeline tri thức**: 122 file Markdown trong `01_phap_ly_quy_chuan/` → tách theo Điều/Khoản (giữ số hiệu, ngày hiệu lực, trạng thái hiệu lực) → embedding (bge-m3) → bảng `legal_chunks` (pgvector + full-text tiếng Việt) |
| 5.2 | Edge Function / Python worker `legal-rag`: truy xuất lai (vector + BM25), rerank, sinh câu trả lời **bắt buộc có trích dẫn**; **từ chối trả lời khi không có nguồn**; hiển thị đoạn gốc khi bấm vào trích dẫn |
| 5.3 | Ghi `ai_logs` (câu hỏi, chunk truy xuất, phiên bản model/prompt/KB, câu trả lời, phản hồi 👍/👎 của cán bộ). Gắn nhãn "Nội dung do AI tạo" |
| 5.4 | **Compliance Checker L1** (quy tắc dạng dữ liệu, không hard-code): mật độ xây dựng, hệ số sử dụng đất, tầng cao, khoảng lùi, PCCC checklist QCVN 06:2022 + SĐ1:2023. Chọn phiên bản QCVN 01:2021 hay 01:2026 theo ngày phê duyệt đồ án. Cán bộ **chấp nhận / bác bỏ kèm lý do** |
| 5.5 | Golden set ≥ 100 câu hỏi pháp lý + ≥ 30 bộ hồ sơ; script `evals/` đo độ chính xác, độ chính xác trích dẫn, tỷ lệ ảo giác (mục tiêu theo v2.3: ≥ 85%, ≥ 95%, < 2%) |
| 5.6 | Tuân thủ Hybrid AI: dữ liệu hồ sơ chỉ xử lý trên LLM nội địa; cloud API chỉ dùng cho truy vấn văn bản pháp luật công khai (tách 2 endpoint) |

### GĐ 6: Tích hợp & Vận hành (≈ 3 tuần) ⚪ (phụ thuộc đối tác)

| Hạng mục | Nội dung |
|---|---|
| 6.1 | Adapter **Cổng DVC Tân Dân** (bản mock trước, thật khi có API): kéo hồ sơ, đẩy trạng thái và kết quả |
| 6.2 | Đồng bộ **CSDL quốc gia về hoạt động xây dựng** (TT 39/2026, khoản 4 Điều 7 NĐ 217/2026); tra cứu CCHN thật thay `alert()` |
| 6.3 | Ký số chuyên dùng (Ban Cơ yếu) cho Lãnh đạo Sở; thông báo email |
| 6.4 | Sao lưu định kỳ, giám sát lỗi (Sentry self-host), nhật ký truy cập; **chuyển Supabase sang hạ tầng trong nước** (Viettel/VNPT/Trung tâm dữ liệu tỉnh) |
| 6.5 | Kiểm thử ATTT (pentest), đánh giá độc lập theo Luật AI 2025, UAT với Phòng QLXD |
| 6.6 | Dọn repo: tài liệu pháp luật gốc (PDF/DOCX/XLSX ~210 MB) chuyển sang Git LFS hoặc Storage |

---

## 4. Danh sách file chính cần thêm / sửa

| GĐ | Thao tác | Đường dẫn |
|---|---|---|
| 0 | Sửa | `scripts/generate_seed.ts`, `scripts/update_rls.ts` (loại bỏ), `src/lib/supabase.ts`, `src/lib/googleMapsLoader.ts`, `tsconfig.json`, `package.json`, `README.md`, `AGENTS.md`/`GEMINI.md`/`CLAUDE.md` |
| 0 | Thêm | `supabase/migrations/20260926000001_revoke_anon_read.sql`, `tsconfig.scripts.json`, `eslint.config.js`, `scripts/lint-ui.ts`, `.github/workflows/ci.yml` |
| 1 | Thêm | `supabase/migrations/2026100x_*_schema_v2.sql` (dossiers, workflow, holidays, audit, ai_logs, RLS), `src/types/database.ts`, `src/data-access/{dossiers,projects,organizations,personnel}.ts`, `src/context/AuthContext.tsx`, `src/pages/LoginPage.tsx`, `src/components/ProtectedRoute.tsx` |
| 1 | Sửa | `src/services/*` → gộp vào `data-access`, `src/hooks/useSupabaseData.ts` → TanStack Query, 6 trang đang đọc mock, `src/App.tsx` |
| 2 | Thêm | `src/components/grid/{DataGrid,GridToolbar,GridSearchInput,GridResetButton,GridCount}.tsx`, `src/hooks/{useColumnResize,useGridSort,useFilterState,useEntityPanel,useChildFormGuard,useUnsavedChangesGuard}.ts`, `src/components/ui/AutoTableTooltip.tsx`, `src/components/audit/AuditHistoryTab.tsx` |
| 2 | Sửa | `src/components/SlidePanelStack.tsx`, `src/components/ui/EntityLink.tsx`, `src/layouts/AppLayout.tsx`, `src/pages/projects/ProjectGalleryTab.tsx`, `ProjectTT39InfoTab.tsx`, `vite.config.ts`, `public/images/**` |
| 3 | Thêm | `src/pages/dossiers/{DossierIntakeForm,DossierWorkflowBar}.tsx`, `src/lib/sla.ts` (và SQL tương ứng), `src/lib/jurisdiction.ts`, migration RPC thống kê |
| 4 | Thêm | `src/components/documents/a4/{A4Paginator,templates/Mau01,Mau03,Gpxd,Mau14Stamp}.tsx`, `src/styles/print.css`, `src/lib/export/{docx,pdf}.ts` |
| 5 | Thêm | `ai/` (worker Python: ingest, embed, rag), `supabase/functions/legal-rag/`, `evals/`, migration `legal_chunks` + pgvector |

---

## 5. Kế hoạch kiểm thử & tiêu chí nghiệm thu

| Loại | Công cụ | Tiêu chí |
|---|---|---|
| Kiểm tra tĩnh | `tsc --strict`, ESLint, `pnpm lint:ui` | 0 lỗi; 0 vi phạm quy chuẩn UI |
| Unit test | Vitest | `sla.ts` (lễ Tết, tạm dừng, gia hạn, biên nhóm A/B/C), `jurisdiction.ts`, `smartSearch`, mapper DB↔UI: độ phủ ≥ 80% cho `lib/` |
| DB test | pgTAP / script SQL | RLS: chuyên viên phòng A **không đọc được** hồ sơ phòng B; anon không đọc được `personnel`; trigger audit ghi đúng |
| E2E | Playwright | Luồng Tiếp nhận → Phân công → Thẩm định → Duyệt → Phát hành Mẫu 03; Esc trong modal con không đóng panel; resize/sort cột được lưu sau khi tải lại |
| In ấn | Playwright PDF + đối chiếu mắt | Khổ A4, lề 30/20/22/20mm, Times New Roman, không cắt chữ, có số trang |
| Hiệu năng | `vite build` + Lighthouse | Chunk đầu < 300 KB gzip; LCP < 2,5s; `public/` < 10 MB |
| AI | `evals/run.py` | Pháp lý ≥ 85%, trích dẫn ≥ 95%, ảo giác < 2%; phản hồi < 10s |
| UAT | Chuyên viên Phòng QLXD | ≥ 30 hồ sơ golden set chạy trọn quy trình |

---

## 6. Rủi ro & các quyết định cần anh/chị chốt

| # | Quyết định | Phương án đề xuất |
|---|---|---|
| Q1 | **Backend**: giữ Supabase-first cho thí điểm hay dựng NestJS ngay theo Kế hoạch v2.3? | **Supabase-first** + lớp `data-access` để dễ chuyển về sau (nhanh hơn, ít vận hành hơn) |
| Q2 | **Hạ tầng lưu trữ**: tiếp tục Supabase Cloud Singapore trong giai đoạn phát triển, hay chuyển sớm sang self-host trong nước? | Dev/demo dùng Cloud **với dữ liệu giả hoàn toàn**; self-host trong nước trước khi nhập hồ sơ thật (GĐ 6) |
| Q3 | **LLM cho RAG pháp luật** (dữ liệu công khai): API cloud hay model nội địa (Qwen 3 / Llama)? | API cloud cho RAG pháp luật công khai; model nội địa cho mọi xử lý liên quan hồ sơ |
| Q4 | **Chế độ demo**: vẫn cần bản trình diễn cho Sở/khách hàng song song với bản thật? | Giữ `VITE_DATA_MODE=demo` + banner, tách build |
| Q5 | **Phạm vi đợt tới**: làm GĐ 0 + GĐ 1 trước, hay ưu tiên khác (ví dụ A4/văn bản cho buổi demo)? | **GĐ 0 ngay** (bảo mật), tiếp theo GĐ 1 → GĐ 2 |

**Rủi ro chính:** (1) API Cổng DVC Tân Dân và ký số phụ thuộc đối tác, nên có mock adapter để không chặn tiến độ; (2) bản quyền TCVN khi đưa vào kho tri thức AI; (3) văn bản pháp luật năm 2026 thay đổi nhanh, nên KB phải quản lý theo phiên bản và ngày hiệu lực; (4) seed và migration hiện đã chạy lên DB thật, nên khi sửa schema phải dùng migration mới, không sửa file cũ.

---

## 🛑 TRẠNG THÁI

Kế hoạch đã được phê duyệt ngày 25/09/2026 và GĐ 0–4 đã triển khai (xem mục **Tiến độ thực hiện** ở đầu tài liệu).
GĐ 5 chờ chốt nhà cung cấp LLM (Q3); GĐ 6 phụ thuộc đối tác tích hợp.
