# Phân hệ BIM SXD

Phân hệ `/bim` dùng chung Web/API tại `http://localhost:8208`. Menu Công cụ → Mô hình BIM tự mở dự án có mô hình sẵn sàng trong phạm vi tài khoản.

## Phạm vi tích hợp

Chuyển bộ workspace đầy đủ từ `qa-si-xd/frontend`, đối chiếu worktree `qa-si-xd-news-publish-20261026` để bổ sung các tệp phụ thuộc. Các adapter dùng phiên đăng nhập, phân quyền, giao diện modal và API của SXD; không mang tài khoản hay biến môi trường nguồn sang frontend.

- Nhập IFC/IFCZIP, chuyển đổi trong Web Worker, quản lý phiên bản và ghép nhiều bộ môn.
- Xem 3D, cây không gian, thuộc tính, tìm cấu kiện, cô lập/ẩn, mặt cắt, đo đạc, góc nhìn, đánh dấu, vướng mắc và BCF.
- Phối hợp va chạm, khối lượng, tiến độ 4D, chi phí 5D, bền vững, phương án, tài sản, bàn giao, kiểm tra và chất lượng dữ liệu.
- Kết nối add-in, bản vẽ liên quan, xuất báo cáo và trợ lý BIM. Trợ lý dùng dữ liệu trong phạm vi dự án, ghi nhật ký và yêu cầu người dùng rà soát kết quả; cấu hình nhà cung cấp AI theo hệ thống hiện hữu.
- Các nghiệp vụ cần dữ liệu bổ sung như kế hoạch, hợp đồng, cảm biến, liên kết bản vẽ và bàn giao phải được người dùng nhập/cấu hình. Không tự tạo số liệu nghiệm thu hoặc tài chính.

## Dữ liệu đã chuyển

Đã chuyển 12 mô hình NOXH HVT và 38.739 cấu kiện, kèm thuộc tính và hình học Fragments, từ dự án nguồn `qa-si-xd`. Dự án đích mang mã `BIM-QA-NOXH-HVT`; thông tin pháp lý chưa được xác nhận, không tự gán tổng mức đầu tư, cấp hay nhóm dự án.

IFC/IFCZIP và Fragments nằm trong bucket riêng `bim-models` của dự án Supabase đích. Bản IFC gốc tại máy: `.appraisal-data/imported-bim/qa-si-xd/ifc/`. Tệp lớn và bản ghi tiếp tục chuyển nằm trong thư mục dữ liệu được Git bỏ qua. GitHub lưu mã nguồn, migration và công cụ chuyển dữ liệu; ứng dụng tải mô hình từ kho tệp có phân quyền.

`scripts/import-qa-bim.py --source-env <env-nguồn>` chuyển dữ liệu theo checkpoint, tải tệp thực tế, kiểm tra trạng thái và số cấu kiện. Không ghi khóa truy cập vào mã nguồn hoặc checkpoint.

## Lưu trữ và phân quyền

Cloud dùng workspace đầy đủ với các bảng/RPC BIM. Các bảng `sxd_bim_*` nối UUID workspace BIM với ID dự án SXD. RLS kiểm tra hồ sơ đang hoạt động, tỉnh, phòng ban và vai trò của phiên đăng nhập hiện hữu. Storage dùng JWT người dùng và URL ký có hạn; không dùng service key trong trình duyệt. Ghi mô hình theo RPC vòng đời chuyển đổi; ghi nhật ký vào `audit_logs` và giải trình vào `ai_logs`.

Bộ API `/api/appraisal/bim` và SQLite giữ cho chế độ demo. Dữ liệu demo độc lập với kho cloud.

## Chạy và kiểm tra

Bản triển khai Vercel hiện là demo tĩnh, không có Core/Worker phía sau `/api/appraisal`. Bộ dữ liệu trình diễn NOXH HVT được đóng gói trong `public/bim/demo/`: 12 Fragments, IFC/IFCZIP gốc và thuộc tính cấu kiện nén gzip. Giao diện tự mở bộ mô hình này trong chế độ demo; trình xem 3D, chọn cấu kiện, thuộc tính và đo đạc không cần kết nối cloud. Adapter chỉ đọc từ bộ tệp này và từ chối ghi; chức năng cần máy chủ hiển thị yêu cầu kết nối máy chủ, không giả lập lưu dữ liệu thành công. Cloud tiếp tục dùng JWT/RLS và kho tệp riêng như trước.

`scripts/export-bim-demo.py` tạo lại snapshot từ đúng dự án NOXH HVT đã được chuyển, phân trang 1.000 cấu kiện và kiểm tra số lượng. Snapshot không chứa khóa truy cập hay hồ sơ người dùng. Đây là bộ tệp trình diễn được phục vụ công khai cùng website, tách biệt với dữ liệu cloud có phân quyền.

`pnpm dev` khởi động Worker 8200, Core 8201 và Web/API 8208. Các lệnh dev/build tự chuẩn bị WASM, Fragments worker và tám worker BIM từ dependency đã khóa phiên bản, không cần CDN.

- `pnpm lint:ui`, `pnpm typecheck`, `pnpm typecheck:core`, `pnpm build`.
- `pnpm test:web`, `pnpm test:appraisal`.
- `python scripts/check-bim-rls.py`: kiểm tra đọc/ghi trong phạm vi, cách ly người ngoài và vòng đời mô hình; giao dịch được rollback.
- Trong `tests/e2e`, đặt `E2E_CHANNEL=chrome` rồi chạy `npx playwright test specs/bim.spec.ts --workers=1 --reporter=list` khi bộ dịch vụ đang chạy. Kịch bản mở dữ liệu chuyển sang, chờ nạp mô hình, chuyển các tab nghiệp vụ và kiểm tra lỗi trình duyệt/API.

Các migration `20261029015156` đến `20261029024546` đã triển khai cho môi trường cloud đích. Migration đầy đủ được tạo bởi `scripts/generate-bim-suite-migration.py`, dùng cầu nối `supabase/bim-suite-bridge.sql` để giữ phạm vi dự án SXD.
