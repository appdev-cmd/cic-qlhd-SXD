# Bàn giao đợt tối ưu G0–G6 — 28/09/2026

Triển khai theo [kế hoạch sau review tổng thể](../implementation_plan.md), đã được người dùng duyệt qua chat ("ok. làm hết đi").

Với các câu hỏi ở mục 9 của kế hoạch mà người dùng chưa trả lời, tôi áp dụng phương án đề xuất:

- Đã commit checkpoint.
- Core chuyển sang Express thuần.
- Xoá `A4DocumentPreview`.
- **Không** chuyển tệp lớn sang Git LFS, vì việc này ảnh hưởng lịch sử repo và cần người dùng tự quyết.

## 1. Kết quả theo giai đoạn

| Giai đoạn | Kết quả | Commit |
| --- | --- | --- |
| G0 Ổn định nhánh | 88 thay đổi dở được tách thành 5 commit theo chủ đề; thêm `.gitattributes`, sửa một PDF từng bị lưu như văn bản; commit phần dashboard của phiên song song | `69e8d04`…`92629f0`, `15718a6` |
| G1 SLA và trạng thái | `ai/app/sla.py`: tính ngày làm việc, tạm dừng khi chờ bổ sung, hạn nội bộ, 8 trạng thái SLA. Mỗi lần ghi, `Store.save` suy ra `status` từ `workflow.state`. Lọc/sắp xếp theo hạn chạy trong SQL; dashboard có khối "Hạn xử lý" | `e4ee5e5`, `ccbd54c` |
| G2 Hiệu năng | Pool kết nối; `BEGIN` và actor gửi trong một lượt mạng; cache xác thực ≤ 60 giây; RLS dạng InitPlan; đếm tổng cùng truy vấn trang; dashboard dùng pipeline; endpoint `/progress` với backoff | `1f63032` |
| G3 Chuẩn UI | `GridToolbar` 5 vị trí; sửa nền dark mờ; `lint:ui` thêm 5 quy tắc; xoá nhóm Google Maps, `A4DocumentPreview`, `KpiCard`, `ChartDefs`, `projectImages`; tách type sang `src/types/project.ts` | `ccbd54c` |
| G4 Kiến trúc | Tách `main.py` → `schemas.py`, `deps.py`, `routes/*` (giữ đủ 58 operation); OpenAPI kèm type TS sinh tự động; bật `strict`; Core dùng Express thuần (bỏ NestJS); định dạng bằng ruff/prettier; `sync-rules.mjs` | `e5298cc`, `374f086` |
| G5 A4 | Test PDF/DOCX nhiều trang: đúng khổ A4, lề 30/20/22/20 mm, có số trang | `3c2a824` |
| G6 Kiểm thử/CI | Unit test web (`node:test`); Playwright E2E 3 kịch bản, đạt trên demo và cloud; CI có kiểm tra định dạng, drift OpenAPI và job E2E | `d95b2f9` |

## 2. Thay đổi dữ liệu cloud staging

- Migration `20260928000004_sla_projection.sql`: thêm index theo hạn xử lý.
- Migration `20260928000005_rls_scope_initplan.sql`:
  - Viết lại 3 policy đọc (hồ sơ, hồ sơ gốc, dự án) bằng `app_actor_scope()`.
  - Số dòng của từng vai trò giống hệt trước và sau thay đổi (chuyên viên, trưởng phòng, lãnh đạo: 181/118/21; quản trị: 219/141/26; tài khoản lạ: 0).
  - `verify_access_hardening.py` đạt toàn bộ, gồm chặn khác tỉnh, khác phòng và tài khoản ngừng hoạt động.
- Backfill SLA cho 141 lần nộp mới nhất bằng tài khoản quản trị staging:
  - Mỗi lần nộp ghi đúng 1 sự kiện audit "Tính hạn xử lý".
  - Bản chụp trước khi ghi nằm ở `~/.config/buildappraisal/backups/20260928-163442-before-sla-backfill/`.
- Baseline `supabase/baselines/20260928.sql` đã cập nhật theo hai migration. Job CI PostgreSQL sẽ kiểm tra; máy hiện tại không có PostgreSQL cục bộ.

## 3. Số đo

Đo qua Web `127.0.0.1:8208` → Core → Worker → Supabase (tài khoản chuyên viên), giá trị p50:

| Endpoint | Trước (đã trừ 2 s trễ IPv6) | Sau G2 | Sau G4 |
| --- | ---: | ---: | ---: |
| Danh sách 50 hồ sơ | ~1.650 ms | 525 ms | 540 ms |
| Chi tiết hồ sơ | ~2.160 ms | 649 ms | 654 ms |
| Tiến độ job (`/progress`) | — | 340 ms | 327 ms |
| Danh sách dự án | ~1.540 ms | 580 ms | 566 ms |
| Dashboard | ~2.000 ms | 1.423 ms | 651 ms |

Số liệu gốc nằm ở `output/appraisal/benchmark/http-*.json`.

Lần đo "trước" dùng `localhost`. Trên Windows, client Python thử `::1` trước và mất khoảng 2 s, nên tôi đã trừ phần này để so sánh công bằng. Trình duyệt không bị ảnh hưởng. Khi đo bằng script, dùng `--base http://127.0.0.1:8208/api/appraisal`.

Độ trễ còn lại chủ yếu là mạng tới pooler Supabase ở Tokyo: khoảng 80 ms mỗi lượt đi-về, và một giao dịch tối thiểu cần 3 lượt. Chuyển project Supabase sang Singapore (`ap-southeast-1`) sẽ giảm thêm đáng kể. Đây là việc hạ tầng, cần người dùng quyết định.

## 4. Kiểm chứng cuối đợt

- `pnpm test:appraisal`: 82/82.
- `pnpm test:web`: 6/6.
- Playwright: 3/3 trên demo seed mới và 3/3 trên cloud staging.
- `pnpm typecheck` (strict) và `pnpm typecheck:core` đạt.
- `pnpm lint:ui`: 0 vi phạm; đã thử cài vi phạm giả, scanner bắt đủ 8 loại.
- `pnpm build`, `rules:check`, `ruff format --check` và `prettier --check` đạt.
- Kiểm tra trên trình duyệt:
  - Lọc "Quá hạn" chỉ còn hồ sơ quá hạn.
  - Panel hồ sơ hiển thị căn cứ "Điểm c khoản 1 Điều 37 NĐ 217/2026/NĐ-CP".
  - Dashboard có khối SLA.
  - Swagger mở được tại `/api/appraisal/docs` (chỉ demo/staging).

## 5. Việc còn lại và điều kiện

| Hạng mục | Lý do chưa làm | Cần gì |
| --- | --- | --- |
| **Xác nhận bảng thời hạn SLA** | Số ngày được trích nguyên văn NĐ 217/2026 (Điều 37, 54) và NĐ 207/2026 (Điều 27); giao diện ghi "chờ chuyên viên xác nhận". Lịch nghỉ demo có ngày âm lịch chưa xác nhận | Chuyên viên duyệt bảng thời hạn; cập nhật `public.holidays` (hiện 22 ngày, 7 ngày đã xác nhận) |
| AI/OCR thật (G5) | Máy chưa có credential Vertex/OpenAI và chưa cài Tesseract `vie+eng` | Cấp credential trong `runtime.env` và cài Tesseract; sau đó chạy `scripts/evaluate_live_legal_ai.py` và bộ nhãn chuyên viên |
| Upload ảnh gallery qua signed URL | Cần thêm policy Storage mới; ảnh ≤ 5 MB nên lợi ích nhỏ | Duyệt thay đổi quyền Storage nếu muốn làm |
| Git LFS cho PDF luật/định mức (~100 MB) | Ảnh hưởng lịch sử repo | Người dùng quyết định |
| Chạy CI trên GitHub | Chưa push lên remote | Cho phép push nhánh |
| Hồ sơ cũ trên cloud đã có lần bổ sung | 78 lần nộp đã có bổ sung không được backfill (chỉ đọc); trạng thái SLA hiển thị "Đã có lần bổ sung" | Không cần xử lý |

`node_modules` gốc đang được cài bằng pnpm 12 (bản thử nghiệm) trong khi lockfile/CI dùng pnpm 10. Nên cài lại bằng pnpm 10 khi tiện để công cụ `pnpm add` hoạt động bình thường.
