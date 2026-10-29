# Kế hoạch chỉnh sửa, nâng cấp và hoàn thiện full stack

**Ngày lập:** 29/10/2026.
**Trạng thái:** CHỜ DUYỆT — chưa sửa code.
**Kế hoạch trước:** [N0–N6, ba nghiệp vụ lõi](docs/plans/20261029-ke-hoach-N0-N6-truoc-hoan-thien-full-stack.md) (N0–N3 đã bàn giao; N4 đã commit `3fc4fee` nhưng chưa có báo cáo bàn giao; N5–N6 chưa làm).
**Phạm vi rà soát:** Web (`src/`), Core gateway (`services/core`), AI Worker (`ai/app`), Supabase (migration, baseline, RLS), test, CI, triển khai Vercel, tài liệu, dữ liệu mẫu.

---

## 1. Kết luận nhanh

Đã rà soát toàn bộ mã nguồn và chạy kiểm tra trên máy. Kết quả kiểm tra: typecheck Web và Core đạt, `lint:ui` đạt, format đạt, 6/6 test Web đạt, 116/116 test Worker đạt. Ứng dụng chạy được tại `localhost:8208`.

Nền tảng nghiệp vụ đã tốt: có bằng chứng nguồn, chuyên viên xác nhận, revision chống ghi đè, chuỗi lần nộp, SLA theo NĐ 217/207, phiếu Điều 38, sổ GPXD, A4. Còn các nhóm việc chính sau:

1. **4 lỗi cần sửa ngay (P0)**, đã kiểm chứng trong code:
   - Mỗi lần tải tệp hoặc chạy OCR, phiếu chuyên môn bị xóa, kéo theo mất "loại hồ sơ con". Hệ quả: SLA tính sai (rơi về mặc định 10 ngày) và vượt qua được giới hạn 2–3 lần kiểm tra trong thi công (`domain.py:152-155`, `ocr_jobs.py:88`, `sla.py:230`).
   - Hạn xử lý lệch 1 ngày với các thao tác từ 0h đến 7h sáng, do ngày bị cắt từ chuỗi giờ UTC (`domain.py:12`, `sla.py:194`). Ngoài ra `date.today()` dùng giờ của máy chủ.
   - Số giấy phép được cấp bằng cách đếm số đã có (`permits.py:268-271`). Hai yêu cầu cấp cùng lúc có thể nhận trùng số, và DB không có ràng buộc duy nhất.
   - Bản Web trên Vercel không có API phía sau. Mọi lệnh gọi `/api/appraisal/*` nhận về `index.html`, nên trang đã triển khai không dùng được (`vercel-build.mjs:18-24`, `.vercelignore` loại `ai/`, `services/`).
2. **Quy trình vai trò chưa đủ cho vận hành:**
   - Trưởng phòng rà soát và Lãnh đạo Sở duyệt đang gộp làm một bước (`workflow.py`, nhóm `LEADERS`).
   - Chưa cấp số cho Mẫu 03/15/16/Phụ lục VIII, văn bản vẫn in "Số: [chưa cấp]" (`reporting.py:57,153`).
   - Chưa có hộp việc "Của tôi" / "Chờ tôi duyệt".
   - Chưa có nhắc hạn, chưa có ủy quyền khi vắng.
   - Chưa có màn hình quản trị lịch nghỉ. Lịch hiện chỉ có đến hết năm 2027.
3. **N4 (hậu kiểm, nghiệm thu) mới xong khoảng một nửa:**
   - 3 nội dung đối chiếu khởi công đang gộp làm một.
   - Liên kết sang BCNCKT và GP chỉ là văn bản tự do.
   - Chưa có kế hoạch kiểm tra tự sinh, chưa có phiếu hiện trường có ảnh và vị trí.
   - Chưa có danh mục Phụ lục VII; Phụ lục VIII chưa điền từ kết luận.
   - Chưa chọn đối tượng kiểm tra theo Phụ lục IX; chưa có E2E.
4. **Hiệu năng sẽ xuống khi dữ liệu thật tăng:**
   - Mỗi dòng văn bản OCR nằm trong JSONB `payload` của lần nộp, nên một hồ sơ 300 trang thành vài MB, và mỗi lần lưu là ghi lại toàn bộ.
   - Danh sách trên cloud đọc cả payload.
   - Sổ GP không phân trang.
   - Dashboard tổng hợp lại từ đầu mỗi lần mở.
5. **Web:**
   - Còn 3 component quá lớn (`AppraisalWorkspace` 1.131 dòng).
   - Khoảng 96 chỗ thiếu `dark:`, 5 chỗ tên thực thể chưa dùng `EntityLink`.
   - Bảng, tab và dòng chưa dùng được bằng bàn phím.
   - Bộ quét `lint:ui` có nhiều điểm mù, nên "đạt" chưa chứng minh tuân thủ quy chuẩn.
6. **AI (N5) và Báo cáo/liên thông (N6) chưa làm:**
   - Chưa theo dõi token/chi phí.
   - Kho văn bản chưa có phiên bản và hiệu lực.
   - Chưa có AI cho GPXD và nghiệm thu.
   - Chưa có KPI theo chuyên viên, báo cáo năm 15/12, xuất dữ liệu TT 39.
7. **Kiểm thử và vận hành còn mỏng:**
   - Test Worker chỉ chạy chế độ demo SQLite; chưa có test RLS và test luồng ghi E2E.
   - Worker không ghi log, còn nuốt lỗi ở 6 chỗ.
   - Migration `20260928000001` mở quyền anon vẫn còn trong repo.
   - Tài liệu còn ghi cổng cũ.

**Đề xuất:** làm theo 9 giai đoạn H0–H8 (mục 4). H0 làm trước, sau đó các nhóm chạy song song. Tổng ước lượng **38–55 ngày công**.

---

## 2. Hiện trạng đã kiểm chứng

| Mảng | Đã tốt | Vấn đề chính (bằng chứng) |
| --- | --- | --- |
| Nghiệp vụ BCNCKT | Phiếu 4 nhóm Điều 38, kết luận 3 mức, vòng đóng dấu Mẫu 14, lưu trữ khoản 9 Điều 36 | Chưa tải bản vẽ đã sửa kèm đề nghị đóng dấu; Mẫu 03/15/16 chưa có số |
| Nghiệp vụ GPXD | Lấy ý kiến 02 ngày làm việc, cấp số, sổ GP, điều chỉnh/gia hạn/cấp lại/thu hồi | Số GP có thể trùng; sổ GP không phân trang (`appraisalService.permits()`, `PermitRegister.tsx:44-56`); chưa có trang công khai Điều 66 |
| Nghiệp vụ nghiệm thu | Khởi công, giới hạn lần kiểm tra, hạn 10 ngày làm việc, Phụ lục VI | Xem mục 1.3; `inspection_count` đếm cả bản nháp, hồ sơ đã dừng, đếm theo dự án chứ không theo công trình (`store.py:381-400`); vượt giới hạn chỉ cần lý do ≥10 ký tự |
| Quy trình, vai trò | Phân công, trả xử lý, revision/CAS, lịch sử lần nộp | Xem mục 1.2 |
| SLA | Bảng thời hạn theo Điều 37/54 NĐ 217, Điều 27 NĐ 207; tính lại từ đầu sau bổ sung | Lệch múi giờ; lịch nghỉ hết năm 2027; bảng SLA vẫn chờ chuyên viên xác nhận (`POLICY_STATUS='requires_confirmation'`) |
| AI | Vertex/OpenAI thật, Tesseract `vie+eng`, kiểm tra trích dẫn khớp nguồn, đánh dấu tài liệu là dữ liệu không tin cậy | Kho pháp lý chỉ 7 văn bản, cùng ghi hiệu lực 01/7/2026 (`legal_assistant.py:101`); không đếm token; giới hạn 55.000 ký tự / 8 nhận xét; bộ đánh giá chỉ có 14 câu truy hồi |
| Lưu trữ, hiệu năng | Phân trang 50 dòng, hàng đợi có lease/retry, `listCache` SWR, route lazy | Phình payload; tải 100 payload đầy đủ chỉ để đếm tài liệu (`routes/cases.py:76`); OCR đọc lại hồ sơ mỗi trang (`ocr_jobs.py:64`); thiếu index cho `subtype` và số GP |
| Web | `lint:ui` đạt quy tắc của nó, khung A4 khóa cứng, GridToolbar đúng thứ tự, `NumberInput` VNĐ | Xem mục 1.5; `api.health()` gọi lại mỗi lần gõ tìm kiếm (`AppraisalPage.tsx:81`); gallery tải ảnh gốc 5 MB cho mỗi ô; recharts nạp ngay trang đầu |
| Core gateway | Gọn, kiểm tra origin/method | Ép `Content-Type: application/json` (`main.ts:45`); không có test |
| DB, migration | Baseline `supabase/baselines/20260928.sql` dựng lại được 22 bảng; CI kiểm tra RLS trên baseline | Chuỗi `migrations/` không tự dựng được DB trống; sổ migration trong baseline sai (thiếu 000004/000005/20260929, thừa 3 bản `20260926*`); `20260928000001_restore_dev_anon_read.sql` vẫn còn |
| Test, CI | 3 job: baseline, quality, e2e (5 test chỉ đọc) | Không test Postgres/RLS, không replay migration; không chạy `build:vercel`; không kiểm tra lại `api.gen.ts` |
| Triển khai | Build tĩnh Vercel đã chạy | Không có API; không có tài liệu nơi chạy Core/Worker |
| Tài liệu, repo | README, RUNBOOK đúng cổng mới | 7 tài liệu còn cổng 3008/3001/8000 (gồm hướng dẫn người dùng `HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md`); 133 tệp nhị phân trong Git (khoảng 207 MB); `output/` sinh tự động vẫn bị theo dõi |
| Launcher | Kiểm tra cổng, chờ từng dịch vụ | Hạn chờ cứng 30 giây; Vite khởi động lạnh hôm nay đã vượt hạn và làm tắt cả bộ; thông báo lỗi không nói dịch vụ nào |

---

## 3. Nguyên tắc thực hiện

1. **Không mở rộng bảo mật ngoài yêu cầu, nhưng không làm lùi phần đã có:** giữ RLS, đóng quyền anon, đăng nhập DB không phải superuser.
2. **Số ngày, mẫu biểu, thẩm quyền do chuyên viên chốt.** Code chỉ mã hóa và đánh dấu "chờ xác nhận".
3. **Mỗi thay đổi nghiệp vụ phải sửa dữ liệu mẫu trong cùng đợt:** `ai/app/samples.py`, các script seed, bản ghi demo cloud.
4. **AI chỉ đề xuất có nguồn, chuyên viên quyết định.** Khi thiếu AI hoặc OCR, quy trình vẫn chạy bằng quy tắc.
5. **Mọi giao diện mới tuân thủ bảng rà soát trong `CLAUDE.md`:** Tooltip, EntityLink, guard form con, SearchableSelect, NumberInput, DateInput, dark mode, A4.
6. **Migration theo kiểu cộng thêm, có backfill kèm bản chụp trước khi ghi.** Không sửa migration đã áp; muốn đổi thì thêm migration mới.
7. **Mỗi giai đoạn có:** test tự động, cập nhật dữ liệu mẫu, báo cáo bàn giao `docs/H*_DELIVERY_*.md`, commit riêng.

---

## 4. Lộ trình

```
H0 (sửa P0, nền ổn định) ─┬─► H2 Quy trình vai trò ──► H7 Báo cáo & liên thông
                          ├─► H3 Hoàn thiện N4
                          ├─► H4 Hiệu năng & dữ liệu
                          ├─► H5 Web: tái cấu trúc & quy chuẩn UI
H1 Triển khai có API (cần quyết định hạ tầng)
H6 AI thật (cần credential)          H8 Test, CI, tài liệu: làm xuyên suốt, chốt UAT cuối
```

### H0 — Sửa lỗi P0 và ổn định nền (2–3 ngày)

| # | Việc | File chính | Tiêu chí xong |
| --- | --- | --- | --- |
| H0.1 | Lưu "loại hồ sơ con" thẳng trên lần nộp (`case.subtype`), không chỉ trong `procedureReview`. `invalidate()` và OCR không xóa trường này. Backfill từ `procedureReviewHistory` cho dữ liệu cũ (có bản chụp trước khi ghi). SLA, `inspection_count`, sổ GP đọc từ trường mới | `domain.py`, `ocr_jobs.py`, `sla.py`, `store.py`, `procedure_review.py`, `scripts/backfill_subtype.py` (mới), migration thêm cột sinh/index | Test: tải tệp, OCR, rồi SLA và số lần kiểm tra không đổi |
| H0.2 | `inspection_count` chỉ đếm lần kiểm tra trong thi công đã có kết quả, không đếm bản nháp hay hồ sơ đã dừng. Đếm theo công trình nếu có mã công trình, nếu không thì theo dự án. Thêm lọc `procedure` cho nhánh demo. Vượt giới hạn phải chọn lý do theo danh mục (sự cố / nghiệm thu từng phần / có điều kiện), không nhập tự do | `store.py`, `procedure_review.py` | Test ranh giới 2/3 lần |
| H0.3 | Múi giờ: thêm `vn_today()` và hàm chuyển mốc giờ sang `Asia/Ho_Chi_Minh`. Thay toàn bộ `date.today()` và `[:10]` trên chuỗi UTC | `domain.py`, `sla.py`, `workflow.py`, `store.py` | Test mốc 23:30 UTC = ngày hôm sau ở Việt Nam |
| H0.4 | Bộ đếm số văn bản dùng chung, tăng nguyên tử: bảng `document_counters(scope, kind, year, last)`, trong đó `scope` là tỉnh/đơn vị cấp số. Cấp số bằng `update … returning`. Thêm ràng buộc duy nhất cho số GP. SQLite demo dùng transaction tương đương | migration mới, `permits.py`, `store.py` | Test cấp 20 số song song, không trùng |
| H0.5 | Vô hiệu hóa `20260928000001_restore_dev_anon_read.sql` (giữ tên tệp, thay nội dung bằng chú thích no-op). Sửa sổ migration trong baseline. Ghi rõ trong RUNBOOK cách dựng DB trống: baseline rồi đến các migration sau mốc baseline | `supabase/migrations/…000001…sql`, `supabase/baselines/20260928.sql`, `docs/RUNBOOK_*` | Job `baseline` của CI vẫn đạt; tệp không còn câu GRANT |
| H0.6 | Launcher: hạn chờ cấu hình qua `APPRAISAL_READY_TIMEOUT_MS` (mặc định 90 giây cho Web, 30 giây cho Worker/Core); báo rõ dịch vụ nào hết hạn | `scripts/appraisal.mjs` | Khởi động lạnh không tự tắt cả bộ |
| H0.7 | Ghi log Worker bằng `logging` có cấu trúc (JSON một dòng); bỏ nuốt lỗi ở `jobs.py:82,129`, `deps.py:137-145`, `ocr_jobs.py:100`, `sla.py:180`, `gallery.py:140` | `ai/app/logging_config.py` (mới), các file trên | Lỗi xuất hiện trong log, kèm mã lần nộp |

### H1 — Triển khai Web có API (1–2 ngày, **cần quyết định hạ tầng — mục 6.1**)

- Chạy Core + Worker trên một máy chủ staging (Docker Compose, gồm Tesseract), cùng Supabase hiện tại.
- Vercel chuyển tiếp `/api/appraisal/*` sang máy chủ API (rewrite trong `vercel-build.mjs` / `config.json`). Core thêm origin Vercel vào `APPRAISAL_ORIGIN`.
- Thêm `Dockerfile` cho Core và Worker, `docker-compose.staging.yml`, endpoint health cho giám sát.
- Khi chưa có API, trang Vercel hiện thông báo "Máy chủ nghiệp vụ chưa kết nối" thay vì lỗi đọc JSON.
- Thêm job CI chạy `build:vercel` và tài liệu `docs/DEPLOYMENT.md`.
- **Tiêu chí:** đăng nhập, danh sách, mở hồ sơ, xuất A4 chạy được trên URL Vercel.

### H2 — Hoàn thiện quy trình theo vai trò (5–7 ngày)

| # | Việc | Ghi chú |
| --- | --- | --- |
| H2.1 | Tách 2 bước: **Trưởng phòng rà soát** (`pending_review` → `head_reviewed`), sau đó **Lãnh đạo Sở duyệt** (`head_reviewed` → `reviewed`). Mỗi bước có quyền trả lại kèm lý do. Ánh xạ dữ liệu cũ | `workflow.py`, `WorkflowPanel.tsx`; chờ xác nhận theo quy chế nội bộ (mục 6.2) |
| H2.2 | Cấp số khi Lãnh đạo duyệt cho Mẫu 03, 15, 16, Phụ lục VIII và số đóng dấu Mẫu 14, dùng bộ đếm H0.4. Thêm **sổ văn bản đi** (danh sách, lọc, xuất Excel). Mẫu số do chuyên viên chốt | `reporting.py`, `procedure_templates.py`, trang sổ mới |
| H2.3 | **Hộp việc:** "Của tôi" (chuyên viên được phân công), "Chờ tôi rà soát" (trưởng phòng), "Chờ tôi duyệt" (lãnh đạo), "Sắp/đã quá hạn". Đếm số trên menu trái | `AppraisalPage.tsx`, bộ lọc `assignee`, `routes/cases.py` |
| H2.4 | **Nhắc hạn trong ứng dụng:** job chạy hằng ngày (dùng hàng đợi hiện có) quét hồ sơ còn ≤3 ngày làm việc hoặc đã quá hạn, tạo thông báo cho người phụ trách. Có biểu tượng chuông và trang thông báo. Email/SMS để sau (mục 6.3) | bảng `notifications` (migration, có RLS theo người nhận) |
| H2.5 | **Ủy quyền, chuyển giao:** trưởng phòng chuyển hồ sơ sang chuyên viên khác (ghi lý do, audit). Lãnh đạo ủy quyền duyệt theo khoảng ngày | `workflow.py`, `WorkflowPanel.tsx` |
| H2.6 | **Quản trị lịch nghỉ, làm bù:** màn hình cho vai trò Quản trị, đọc/ghi `public.holidays`; bật cảnh báo khi lịch năm tới chưa nhập (trước 01/11 hằng năm) | `CatalogPage` (thêm loại `holidays`), `sla.py` |
| H2.7 | Dữ liệu mẫu: thêm hồ sơ ở từng trạng thái mới, sổ văn bản đi, thông báo | `samples.py`, seed |

**Tiêu chí:** E2E 3 vai trò (chuyên viên → trưởng phòng → lãnh đạo) cho mỗi nghiệp vụ, văn bản có số không trùng, thông báo sinh đúng hạn.

### H3 — Hoàn thiện N4: hậu kiểm và kiểm tra nghiệm thu (4–6 ngày)

| # | Việc |
| --- | --- |
| H3.1 | Tiếp nhận khởi công: tách **3 nội dung đối chiếu** theo điểm c khoản 2 Điều 67 (đủ điều kiện miễn phép; phù hợp quy hoạch; phù hợp thông số chủ yếu của BCNCKT đã thẩm định), mỗi nội dung có kết luận và bằng chứng riêng |
| H3.2 | Liên kết BCNCKT và GP bằng `SearchableSelect` theo id, không nhập tự do; kiểm tra GP còn hiệu lực (chưa thu hồi, chưa hết hạn) |
| H3.3 | **Sinh kế hoạch kiểm tra** từ thông báo khởi công theo cấp công trình (2 hoặc 3 lần): ngày dự kiến, giai đoạn, người kiểm tra; hiển thị trên lịch hiện trường hiện có |
| H3.4 | **Phiếu kiểm tra hiện trường:** ảnh (dùng lại kho ảnh của gallery, có ảnh thu nhỏ), vị trí GPS, thời điểm, người kiểm tra, tồn tại phát hiện. SLA 10 ngày làm việc tính từ ngày kiểm tra thực tế (`sla.py:242` đang lấy ngày dự kiến) |
| H3.5 | **Danh mục hồ sơ Phụ lục VII** dạng có cấu trúc (từng mục: có/thiếu/không áp dụng, tài liệu đính kèm) |
| H3.6 | **Yêu cầu thí nghiệm đối chứng/kiểm định** có cấu trúc (hạng mục, đơn vị, hạn, kết quả) theo Điều 8 NĐ 207 và TT 32 |
| H3.7 | Phụ lục VIII điền từ kết luận đã xác nhận (chấp thuận/không chấp thuận, tồn tại, việc còn lại). Nghiệm thu có điều kiện/từng phần: theo dõi tồn tại có hạn khắc phục, liên kết tới lần kiểm tra hoàn thành cuối |
| H3.8 | Chọn đối tượng kiểm tra theo **Phụ lục IX NĐ 207** (Hội đồng kiểm tra nhà nước) trong `authority.py`, bên cạnh Phụ lục IV NĐ 217 |
| H3.9 | Hạn chờ bổ sung cho hồ sơ nghiệm thu (chờ chuyên viên chốt số ngày) |
| H3.10 | Gom giới hạn 3/2 lần về một chỗ (`procedure_policy.py`); thay chuỗi `'2026-07-01'` lặp ở 3 file bằng `legal.CUTOFF` |
| H3.11 | Dữ liệu mẫu đủ luồng; E2E: khởi công → 2 lần kiểm tra → hoàn thành có điều kiện → khắc phục → chấp thuận; báo cáo `docs/N4_H3_DELIVERY_*.md` |

### H4 — Hiệu năng và mô hình dữ liệu (4–6 ngày)

| # | Việc | Lợi ích |
| --- | --- | --- |
| H4.1 | Tách **đoạn văn bản OCR** khỏi `payload` sang bảng `appraisal_segments(case_id, document_id, page, idx, text)` có RLS kế thừa lần nộp. Payload chỉ giữ thống kê. Đọc theo trang khi cần trích dẫn | Payload nhỏ hơn hàng chục lần; lưu nhanh hơn |
| H4.2 | Chuyển `audit` và `procedureReviewHistory` sang `audit_logs` (đã có bảng); payload chỉ giữ 20 mục gần nhất | Không phình theo thời gian |
| H4.3 | Danh sách trên cloud đọc cột chiếu (projection) như `case_summaries` của demo, không đọc payload. Bỏ việc tải 100 payload để đếm tài liệu | Danh sách nhanh |
| H4.4 | Thêm cột sinh và index: `subtype`, `permit_number`, `(project_id, procedure)` | Truy vấn sổ GP, kiểm tra nhanh |
| H4.5 | Sổ GP phân trang và lọc ở server; giấy phép xuất Excel theo trang | Bỏ lọc bằng JS |
| H4.6 | Dashboard: bảng tổng hợp cập nhật khi lưu lần nộp (hoặc cache 60 giây theo phạm vi) | Dashboard mở tức thì |
| H4.7 | OCR đọc hồ sơ một lần cho cả job; finalize upload đọc một lần | Giảm truy vấn |
| H4.8 | Web: gọi `health` một lần mỗi phiên; ảnh thu nhỏ cho gallery (tạo ở Worker khi tải lên); dashboard nạp recharts sau khung trang; bỏ fetch trùng `getTT39Data` | Trang đầu nhẹ hơn |
| H4.9 | Đo lại bằng `scripts/benchmark_http.py` trước và sau; ghi số liệu vào báo cáo | Có bằng chứng |

Có backfill kèm bản chụp. Giữ tương thích đọc dữ liệu cũ trong một phiên bản.

### H5 — Web: tái cấu trúc và quy chuẩn giao diện (5–7 ngày)

| # | Việc |
| --- | --- |
| H5.1 | Tách `AppraisalWorkspace.tsx` (1.131 dòng) thành hook `useAppraisalCase` và các tab riêng (`IntakeTab`, `FactsTab`, `FindingsTab`, `CostTab`, `LegalTab`, `SheetTab`, `StampingTab`); `ReviewModal` tách theo loại. Tách `AppraisalPage` (danh sách / tạo mới / liên kết dự án) và `RequireAuth` (thêm `LoginPage` riêng) |
| H5.2 | `EntityLink` cho 5 vị trí còn sót (`ProjectDetailSlidePanel.tsx:87,235,238`, `ProjectsPage.tsx:409`, `AppraisalWorkspace.tsx:318`) |
| H5.3 | Dark mode: sửa khoảng 96 chỗ màu cứng không có `dark:` (tập trung ở `ProjectTT39InfoTab`, `AppLayout`, `ProjectDetailSlidePanel`, `ProjectsPage`) |
| H5.4 | Định dạng: `formatDate` thay `formatDateTime(...).split(' ')[0]`; hàm `formatNumber` thay `toLocaleString('vi-VN')` thô |
| H5.5 | Header Slide Panel theo chuẩn `pr-14`/`pr-16`; nền header có `dark:` |
| H5.6 | Truy cập bằng bàn phím: dòng bảng bấm được bằng Enter, header có `aria-sort`, tách cột kéo được bằng phím mũi tên, tab có `role="tab"`/`aria-selected`, nhãn cho bộ lọc, viền focus thay cho `outline-none` |
| H5.7 | **Mở rộng `lint:ui`:** bắt `title` trên component, `type={'date'}`, màu nền thiếu `dark:`, `minHeight` trong khung A4, `pr-24`/`right-0` trên header panel, dark opacity thấp. Thêm danh sách ngoại lệ có lý do |
| H5.8 | Sửa nội dung gây hiểu nhầm: chấm xanh cạnh "Chưa xác minh chứng chỉ" (`ProjectDetailSlidePanel.tsx:223,240`); thêm lựa chọn nhóm `QG`; xóa/sửa ảnh trong gallery có guard; số thứ tự dòng tính theo trang (`MasterTable`); bỏ import thừa |
| H5.9 | **Trợ giúp trong ứng dụng:** trang "Hướng dẫn" từ `HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md` (đã sửa cổng); trạng thái rỗng có gợi ý việc tiếp theo |
| H5.10 | Dọn dẹp: chuyển `src/data/mock*.ts` (khoảng 4.000 dòng, chỉ script seed dùng) sang `scripts/data/`; chuyển `express` và `@types/leaflet` sang đúng nhóm dependency |
| H5.11 | Màn hình hẹp (≥1280px là chính; ≥768px dùng được): thanh lọc xuống dòng, panel toàn màn hình trên tablet |

### H6 — AI thật (N5) (6–9 ngày, **cần credential — mục 6.4**)

| # | Việc |
| --- | --- |
| H6.1 | Ghi nhận token và chi phí mỗi lần gọi (`usageMetadata`/`usage`), hạn mức theo ngày/đơn vị, retry có giới hạn, trạng thái kết nối theo từng tiến trình |
| H6.2 | **Kho văn bản có phiên bản và hiệu lực:** manifest (số hiệu, ngày ban hành, hiệu lực, thay thế/bị thay thế); đăng ký thêm NĐ 212, Phụ lục II/III/IV NĐ 217, TT 34/39, các QCVN; chia đoạn theo điều/khoản; cảnh báo khi trích văn bản hết hiệu lực |
| H6.3 | Provenance thêm phiên bản kho văn bản và bộ quy tắc; nhật ký trợ lý pháp luật ghi cả ở demo |
| H6.4 | AI phân loại tệp vào thành phần hồ sơ; trích Tờ trình Mẫu 01 / Đơn đề nghị cấp GP |
| H6.5 | AI cho GPXD: kiểm giấy tờ đất; trích thông số bản vẽ (cốt nền, khoảng lùi, chiều cao, số tầng) so với quy hoạch |
| H6.6 | AI cho nghiệm thu: rà soát chéo hồ sơ chất lượng (đủ Phụ lục VII, logic ngày nhật ký – thí nghiệm – biên bản, thành phần ký, kết quả ngoài ngưỡng); đề xuất trọng tâm kiểm tra hiện trường |
| H6.7 | Hồ sơ lớn: chọn đoạn theo mục lục và từ khóa thay vì lấy đoạn đầu đến 55.000 ký tự; xử lý nhiều lượt cho hồ sơ vượt ngân sách |
| H6.8 | **Bộ đánh giá:** 20 tình huống mỗi thủ tục (chuyên viên gán nhãn), đo độ chính xác trích xuất theo trường, tỷ lệ trích dẫn khớp, tỷ lệ chuyên viên chấp nhận; chạy trong CI ở chế độ ghi sẵn (không gọi mô hình) |

### H7 — Báo cáo, KPI và liên thông (N6) (4–6 ngày, sau H2)

| # | Việc |
| --- | --- |
| H7.1 | KPI: đúng hạn/quá hạn theo chuyên viên, phòng, thủ tục; số lần bổ sung/tạm dừng; thời gian xử lý bình quân; tồn đọng theo tuổi hồ sơ |
| H7.2 | Báo cáo định kỳ (tháng/quý) và **báo cáo năm 15/12** (khoản 10 Điều 73 NĐ 217), xuất Excel và Word A4 |
| H7.3 | **Xuất dữ liệu kết quả thủ tục theo TT 39** (tệp theo cấu trúc quy định); nhắc hạn 05 ngày làm việc qua thông báo H2.4 |
| H7.4 | Trang công khai GP (Điều 66) chỉ đọc, không cần đăng nhập, chỉ hiển thị trường được phép công khai |
| H7.5 | Giao diện adapter DVC (hợp đồng dữ liệu, chưa kết nối thật) theo `YEU_CAU_TICH_HOP_DICH_VU_CONG.md`; chờ Sở chỉ định đầu mối |

### H8 — Kiểm thử, CI, tài liệu, dọn repo (4–5 ngày, rải theo các giai đoạn)

| # | Việc |
| --- | --- |
| H8.1 | Test Worker ở chế độ Postgres trong CI: service Postgres, sau đó baseline, các migration sau baseline, rồi chạy các test N2–N4 |
| H8.2 | Test RLS theo vai trò, tỉnh, phòng (tự động hóa `verify_access_hardening.py`) |
| H8.3 | E2E luồng ghi: tạo hồ sơ, tải tệp, chạy kiểm tra, trình, duyệt, xuất A4 cho 3 nghiệp vụ; GPXD cấp/thu hồi; nghiệm thu (H3.11) |
| H8.4 | Test đơn vị Web: `useGridSort`, `useColumnResize`, `useCaseProgress`, `mapProject`, `apiClient`; test Core gateway (origin, method, timeout) |
| H8.5 | API: thêm `response_model` dần cho các route chính; định dạng lỗi thống nhất `{code, message, details}`; CI kiểm tra `api.gen.ts` sinh lại không đổi |
| H8.6 | Tài liệu: sửa cổng cũ trong 7 tài liệu; README đổi "NestJS" thành Express; `docs/DEPLOYMENT.md`; cập nhật RUNBOOK; báo cáo bàn giao từng giai đoạn |
| H8.7 | Repo: ngừng theo dõi `output/` sinh tự động; tệp nhị phân mới dùng Git LFS (không viết lại lịch sử nếu chưa được đồng ý — mục 6.5); thêm chặn an toàn cho `supabase/seed.sql` (dừng nếu URL không phải local) |
| H8.8 | **UAT** với chuyên viên phòng Quản lý xây dựng theo 3 kịch bản ẩn danh; chốt phiếu `PHIEU_DUYET_NGHIEP_VU_DEMO.md` |

---

## 5. Danh sách file dự kiến

| Nhóm | Sửa | Thêm |
| --- | --- | --- |
| H0 | `ai/app/{domain,ocr_jobs,sla,store,procedure_review,permits,workflow,jobs,deps,gallery}.py`, `scripts/appraisal.mjs`, `supabase/migrations/20260928000001_*.sql`, `supabase/baselines/20260928.sql` | `ai/app/logging_config.py`, `scripts/backfill_subtype.py`, migration `document_counters` + cột sinh `subtype`, test tương ứng |
| H1 | `vercel-build.mjs`, `services/core/main.ts`, `src/services/apiClient.ts`, `.github/workflows/quality.yml` | `Dockerfile.core`, `Dockerfile.worker`, `docker-compose.staging.yml`, `docs/DEPLOYMENT.md` |
| H2 | `workflow.py`, `reporting.py`, `procedure_templates.py`, `routes/cases.py`, `sla.py`, `WorkflowPanel.tsx`, `AppraisalPage.tsx`, `AppLayout.tsx`, `CatalogPage.tsx` | migration `notifications`, `ai/app/notifications.py`, trang sổ văn bản đi, trung tâm thông báo |
| H3 | `procedure_rules.py`, `procedure_review.py`, `procedure_templates.py`, `procedure_policy.py`, `authority.py`, `sla.py`, `ProcedureReview.tsx` | `components/appraisal/InspectionPlan.tsx`, `SiteInspectionSheet.tsx`, test và spec E2E |
| H4 | `store.py`, `ingestion.py`, `catalog.py`, `ocr_jobs.py`, `routes/{cases,documents}.py`, `PermitRegister.tsx`, `ProjectGalleryTab.tsx`, `CloudDashboard.tsx` | migration `appraisal_segments`, cột sinh/index, script backfill |
| H5 | `AppraisalWorkspace.tsx`, `AppraisalPage.tsx`, `RequireAuth.tsx`, `ProjectDetailSlidePanel.tsx`, `ProjectsPage.tsx`, `ProjectTT39InfoTab.tsx`, `AppLayout.tsx`, `SlidePanelStack.tsx`, `MasterTable.tsx`, `DossierGrid.tsx`, `scripts/lint-ui.mjs`, `package.json` | `pages/projects/appraisal/tabs/*`, `hooks/useAppraisalCase.ts`, `pages/LoginPage.tsx`, `pages/HelpPage.tsx` |
| H6 | `provider.py`, `vertex.py`, `legal_assistant.py`, `evidence_selection.py` | `ai/app/ai/{classify,extract_forms,permit_checks,quality_crosscheck}.py`, `knowledge-base/legal-manifest.json`, `ai/evaluation/*` |
| H7 | `catalog.py`, `CloudDashboard.tsx` | `ai/app/reports.py`, `ai/app/tt39_export.py`, `routes/reports.py`, `pages/ReportsPage.tsx`, trang công khai GP, `ai/app/dvc_adapter.py` |
| H8 | `quality.yml`, tài liệu trong `docs/`, `README.md`, `.gitignore`, `.gitattributes` | test Postgres/RLS, spec E2E ghi, test Web/Core |

---

## 6. Điểm cần anh/chị quyết định

1. **Hạ tầng chạy Core + Worker cho bản Vercel (H1).** Đề xuất: một máy chủ staging (VPS hoặc Google Cloud Run khu vực Singapore) chạy Docker; khi go-live chuyển sang hạ tầng trong nước như đã hoãn trước đây. Phương án khác: tạm thời chỉ dùng local, gỡ bản Vercel.
2. **Tách 2 bước Trưởng phòng / Lãnh đạo Sở (H2.1)** và mẫu cấp số văn bản (H2.2). Cần QĐ 48/2025/QĐ-UBND hoặc quy chế nội bộ để chốt; nếu chưa có, làm theo luồng chuyên viên → trưởng phòng → lãnh đạo và đánh dấu "chờ xác nhận".
3. **Kênh nhắc hạn (H2.4):** đợt này chỉ làm thông báo trong ứng dụng. Email/SMS/Zalo cần SMTP hoặc nhà cung cấp, đã hoãn trước đây.
4. **Tách đoạn OCR ra bảng riêng (H4.1)** là thay đổi schema lớn nhất. Đề xuất làm ngay khi dữ liệu còn là demo, chi phí chuyển đổi thấp.
5. **Tệp nhị phân lớn trong Git (H8.7):** đề xuất chỉ áp dụng Git LFS cho tệp mới và ngừng theo dõi `output/`. Viết lại lịch sử để giảm khoảng 207 MB là thao tác không đảo ngược, chỉ làm khi anh/chị đồng ý riêng.
6. **Credential AI và OCR (H6):** Vertex/OpenAI và Tesseract `vie+eng` trên máy chủ staging.
7. **Còn chờ chuyên viên chốt** (không chặn việc làm code, chỉ chặn trạng thái "đã xác nhận"):
   - bảng SLA và lịch nghỉ 2026–2027;
   - quy tắc Phụ lục IV và miễn phép đầu tư công;
   - số ngày chờ bổ sung hồ sơ nghiệm thu;
   - bộ mẫu văn bản Sở đang dùng;
   - gate N2 (hồ sơ 0182/0189/0201);
   - 20 tình huống trong `PHIEU_DUYET_NGHIEP_VU_DEMO.md`;
   - phạm vi hậu kiểm có gồm trật tự xây dựng hay không.

**Ngoài phạm vi đợt này** (ghi nhận cho go-live): ký số với nhà cung cấp chứng thư; kết nối thật Cổng DVC và CSDL quốc gia; hosting trong nước; mở rộng bảo mật ngoài phần đã có.

---

## 7. Kiểm thử và tiêu chí nghiệm thu

| Nhóm | Tình huống | Tiêu chí |
| --- | --- | --- |
| Lỗi P0 | Tải tệp/OCR sau khi chọn loại hồ sơ con; thao tác lúc 0h–7h; cấp 20 số GP song song | Loại hồ sơ con, SLA, số lần kiểm tra giữ nguyên; ngày đúng giờ Việt Nam; không trùng số |
| Vai trò | Chuyên viên → trưởng phòng (trả lại / chuyển tiếp) → lãnh đạo (trả lại / duyệt); ủy quyền | Đúng quyền từng bước; audit ghi tên người, không ghi UUID |
| Thời hạn, nhắc hạn | Còn 3/1/0 ngày làm việc; quá hạn; năm chưa nhập lịch nghỉ | Thông báo sinh đúng người, đúng ngày; có cảnh báo lịch |
| N4 | Khởi công → kế hoạch 2/3 lần → phiếu hiện trường có ảnh → hoàn thành có điều kiện → khắc phục → chấp thuận | Phụ lục VII/VIII đúng dữ liệu đã xác nhận; chặn lần vượt giới hạn khi không có lý do hợp lệ |
| Hiệu năng | Hồ sơ 300 trang; danh sách 1.000+ lần nộp; dashboard | Lưu < 1 giây; danh sách < 500 ms; dashboard < 1 giây (đo bằng `benchmark_http.py`, so trước/sau) |
| Giao diện | `lint:ui` mở rộng; dark mode; bàn phím; A4 | 0 vi phạm; thao tác chính làm được không cần chuột |
| AI | Bộ 20 tình huống/thủ tục; trích dẫn giả; prompt injection; bản scan | 100% trích dẫn khớp nguồn; 0 kết luận không nguồn; có số liệu chi phí/token |
| DB | Dựng DB trống từ baseline + migration; RLS theo vai trò/tỉnh/phòng | CI đạt; anon bị từ chối |
| Triển khai | URL Vercel | Đăng nhập, danh sách, mở hồ sơ, xuất A4 đạt |
| Hồi quy | Toàn bộ test hiện có (116 Worker, 6 Web, 5 E2E) | Vẫn đạt |

---

## 8. Ước lượng

| Giai đoạn | Ngày công | Phụ thuộc |
| --- | --- | --- |
| H0 Sửa P0, nền ổn định | 2–3 | — |
| H1 Triển khai có API | 1–2 | Quyết định 6.1 |
| H2 Quy trình vai trò | 5–7 | H0.4; quyết định 6.2 |
| H3 Hoàn thiện N4 | 4–6 | H0.1–H0.2 |
| H4 Hiệu năng, dữ liệu | 4–6 | H0.1; quyết định 6.4 |
| H5 Web, quy chuẩn UI | 5–7 | Làm song song; tránh sửa cùng file với H2/H3 cùng lúc |
| H6 AI thật | 6–9 | Credential 6.6 |
| H7 Báo cáo, liên thông | 4–6 | H2 |
| H8 Test, CI, tài liệu, UAT | 4–5 + UAT | Rải theo các giai đoạn |
| **Tổng** | **38–55 ngày công** | |

**Mốc đề xuất:**
- Tuần 1: H0 + H1, hệ thống đúng và triển khai được.
- Tuần 2–4: H2, H3, H4, H5, đủ quy trình vận hành và nhanh.
- Tuần 5–7: H6, H7, H8, AI thật, báo cáo và UAT.

**Dừng theo Plan-First của CLAUDE.md. Chờ tin nhắn phê duyệt trực tiếp của anh/chị trước khi triển khai.**
