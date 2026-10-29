# Chuyển backend sang Node.js/TypeScript — 29/10/2026

## Runtime

Web React/Vite giữ cổng 8208, Core Express giữ 8201, Worker Node.js 24/Express giữ 8200. Nguồn cổng vẫn là `config/runtime-ports.json`. Vercel dùng `api/index.ts`, consumer `api/jobs.ts`; không cài Python, pip, FastAPI, Tesseract hoặc tiến trình nền riêng.

Toàn bộ API theo hợp đồng OpenAPI đã có route Node: hồ sơ/lần nộp, upload bản gốc, facts, checklist, pháp lý, thẩm quyền, SLA, phân công, quy trình, phiếu thẩm định, GPXD, nghiệm thu, đóng dấu/lưu trữ, danh mục, gallery, dashboard và BIM. Các biểu mẫu cũ đã chuyển thành dữ liệu JSON và bộ dựng tài liệu TypeScript, không thực thi mã Python hoặc biểu thức lấy từ dữ liệu.

- PostgreSQL: `pg`, tài khoản backend hạn chế, TLS xác minh CA, Auth xác minh phía Supabase và identity transaction-local cho RLS.
- Demo: `node:sqlite`, tương thích dữ liệu cũ, ghi có transaction/revision và phục hồi job khi khởi động lại.
- AI: OpenAI Responses hoặc Vertex qua adapter phía server; giữ provider/model trong biến môi trường. OCR gửi riêng từng trang PDF, ghi nguồn trang/SHA-256 và trạng thái chưa xác nhận; không thay bản gốc.
- Vercel Queues: topic `appraisal-node-jobs`, lease độc quyền, heartbeat, tối đa ba lần thử; OCR checkpoint mỗi trang, chia hai trang AI mỗi invocation. Gửi lại công việc đã hoàn tất không ghi kết quả trùng. Polling khôi phục gửi queue khi publish trước đó thất bại.
- Tài liệu: PDF.js đọc PDF có chữ, JSZip/XML đọc DOCX, PDFKit/docx sinh A4 đúng lề. Font Liberation Serif kèm giấy phép được nhúng khi không có Times New Roman.
- BIM: IFC/Fragments/WebAssembly chạy trong browser workers; Supabase lưu tệp và dữ liệu nghiệp vụ. Worker chuyển đổi IFC hiện có được giữ nguyên.

## Lệnh thay thế

`pnpm dev`, `pnpm test:appraisal`, `pnpm samples:build`, `pnpm samples:projects`, `pnpm api:types`, `pnpm benchmark:http` đều dùng Node. CI dùng Node 24 cho backend, baseline PostgreSQL, queue và Playwright. Các script Python vận hành một lần của bản cũ đã được loại bỏ khỏi sản phẩm; lịch sử Git còn lưu nguồn. Không gỡ Python của máy hay dự án khác.

Bộ seed mới dùng 55 hồ sơ mô phỏng/296 tệp cố định, chỉ nạp vào demo, không ghi đè hồ sơ đã sửa và không xuất bản sang cloud. Có bản sao riêng của thay đổi cục bộ `demo_summary.py` trước khi bỏ nguồn cũ tại `~/.config/buildappraisal/backups/node-migration-20261029/`.

## Kiểm thử đã thực hiện

- 35 bài backend Node: Auth/TLS/RLS, CAS, upload/download nguyên vẹn, OCR giả lập có checkpoint, queue lặp, IFC/Fragments/notes, cấp số GPXD đồng thời, A4/PDF/DOCX.
- Đối chiếu dữ liệu hồi quy: 96 tình huống pháp lý, 360 deadline và 360 trạng thái SLA, 216 quyền workflow, mọi checklist GPXD/nghiệm thu, 120 biến thể văn bản và 34 tình huống văn bản BCNCKT.
- 35 unit test frontend, typecheck backend/frontend, lint UI và build.
- PostgreSQL 17 cách ly: replay baseline, RLS và quyền RPC, lease/retry/checkpoint, worker cũ không nhận job Node.
- Đọc cloud bằng Auth thông thường và DB hạn chế: 43 hồ sơ, 12 mô hình, 38.739 cấu kiện; dashboard khớp phạm vi.
- Playwright cục bộ: 37 kịch bản qua; kiểm tra cloud cần opt-in `E2E_ENABLE_CLOUD_WRITES=1`; demo BIM tĩnh riêng cần `E2E_ENABLE_STATIC_BIM=1`.

## Kiểm tra triển khai

Migration `node_appraisal_jobs` đã áp dụng cho đúng dự án Supabase, chỉ bổ sung đầu vào/checkpoint và RPC backend; client thường không có quyền dispatcher. Chưa coi việc gọi AI thật, tải IFC và mở lại dữ liệu trên Vercel là đạt cho đến khi các bài `node-cloud.spec.ts` và `bim-cloud-write.spec.ts` chạy qua bản preview. Kết quả triển khai được cập nhật sau kiểm thử.
