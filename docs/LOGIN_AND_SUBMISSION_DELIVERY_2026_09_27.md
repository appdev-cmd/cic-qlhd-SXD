# Bàn giao đăng nhập và liên kết các lần nộp

Ngày cập nhật: 27/09/2026. Môi trường: Supabase staging, web cổng 3008.

## 1. Đăng nhập theo cic-ibst

Đã tham khảo trực tiếp trang đăng nhập của `D:\01_Projects\cic-ibst`, áp dụng bố cục hai cột, phần giới thiệu, nhận diện SXD, ô tài khoản/mật khẩu, ghi nhớ, hiện/ẩn mật khẩu và chọn tài khoản nhanh. Màu dùng ThemeContext của dự án; hỗ trợ sáng, bảo vệ mắt và tối. Màn hình nhỏ hiển thị cột đăng nhập.

- Nhập email hoặc tên tài khoản; tên không có @ được bổ sung `@cic.com.vn`.
- Ghi nhớ: lưu phiên trong localStorage; bỏ chọn: lưu phiên trong sessionStorage của tab.
- Đăng nhập nhanh dùng phiên Supabase Auth thực, quyền lấy từ profile đã cấp. Không có mật khẩu tài khoản test trong mã frontend hoặc phản hồi danh sách tài khoản.
- Khôi phục mật khẩu có form yêu cầu liên kết, trang đặt lại mật khẩu, kiểm tra nhập lại và redirect `/auth/recovery` được cấu hình trên Supabase. **Chưa cấu hình SMTP riêng, chưa kiểm chứng gửi/nhận email đầu cuối.** Không gửi email trong đợt kiểm tra này.

## 2. Bốn tài khoản thử nghiệm

Vào trang đăng nhập, chọn vai trò trong “Hoặc đăng nhập bằng tài khoản thử nghiệm”. Không cần nhập mật khẩu.

| Vai trò | Email | Phạm vi hiện tại |
| --- | --- | --- |
| Chuyên viên | officer@buildappraisal.test | Điện Biên, Phòng Quản lý Xây dựng; 21 dự án |
| Trưởng phòng | head-of-department@buildappraisal.test | Điện Biên, Phòng Quản lý Xây dựng; 21 dự án |
| Lãnh đạo Sở | director@buildappraisal.test | Theo phạm vi đã cấp trên profile; 21 dự án |
| Quản trị | admin@buildappraisal.test | Quản trị dữ liệu thử nghiệm cùng tỉnh; 26 dự án |

Quản trị kỹ thuật không được thay trưởng phòng/lãnh đạo hoàn tất rà soát nghiệp vụ. Các tài khoản mang nhãn thử nghiệm trong Auth metadata. Không dùng tài khoản/mật khẩu của cic-ibst.

Đăng nhập nhanh chỉ bật khi môi trường `staging`, chế độ `cloud`, `APPRAISAL_ENABLE_TEST_LOGIN=true`, truy cập từ loopback. Vite kiểm tra địa chỉ socket trước khi chuyển yêu cầu; Core kiểm tra tiếp host/socket/origin; Worker yêu cầu internal token. Production và cấu hình mặc định tắt tính năng này.

Thông tin riêng nằm tại `C:\Users\nguye\.config\buildappraisal\test-accounts.json`, giới hạn ACL cho người dùng Windows hiện tại. Cờ bật thử nghiệm nằm trong `runtime.env` cùng thư mục. Không đưa các file này vào Git.

## 3. Hồ sơ gốc và lần bổ sung

- Migration 00008 tạo `appraisal_dossiers`, liên kết `dossier_id`, `previous_submission_id`, số lần nộp và chỉ mục duy nhất. Đã ghi ledger cloud.
- Chuẩn hóa **161 lần nộp, 868 tài liệu, 83 hồ sơ gốc, 78 liên kết lần bổ sung**. Chỉ nối theo mã lần trước đã có, không suy đoán từ tên dự án. Tài liệu và kết quả giữ nguyên; mỗi hồ sơ có thêm sự kiện audit nâng cấp và revision mới.
- Ba nghiệp vụ đều hiển thị bảng “Các lần nộp hồ sơ”, mở bằng EntityLink/slide panel, phân trang 50 dòng, resize/sort cột.
- Tạo lần bổ sung giữ dự án, phạm vi quyền và danh mục thành phần; cần nộp bộ tài liệu của lần mới, xác nhận dữ liệu/phạm vi pháp lý và chạy lại kiểm tra. Không tự sao chép kết luận hoặc duyệt của lần trước.
- Mỗi lần trước chỉ có một lần kế tiếp; kiểm tra revision trong giao dịch, chống tạo nhánh đồng thời. Gửi lại cùng requestId và cùng nội dung trả hồ sơ đã tạo.
- Lần đã có bổ sung được giữ chỉ đọc; ràng buộc DB chặn sửa. Chuỗi nhiều lần nộp không được chuyển riêng sang dự án khác.
- Form con dùng guard khi có thay đổi; Escape không làm mất panel cha.

## 4. Bằng chứng thực hiện

- `pnpm test:appraisal`: 30 kiểm thử đạt, bao gồm bật/tắt đăng nhập test theo môi trường, bảo vệ Worker, không trả mật khẩu/email qua danh sách, tạo bổ sung idempotent, giữ nguyên nguồn và chặn ngày/revision sai.
- `pnpm build`: thành công. Còn cảnh báo chunk chính lớn hơn 500 kB; tiếp tục tối ưu ở giai đoạn hiệu năng.
- Kiểm tra API đăng nhập 4 vai trò: đúng role và số dự án 21/21/21/26. Origin ngoài danh sách bị 403; host không cục bộ bị 404.
- Script staging: Auth/RLS, chống giả actor, phân trang, tạo dự án trong transaction rollback, signed upload/hash, finalize idempotent, xung đột revision, chặn admin duyệt, job quy tắc bền vững, tải bản gốc, tạo lần bổ sung/idempotency/chỉ đọc nguồn/sửa lần mới đều đạt. Hồ sơ/tệp tạm đã dọn theo UUID do kiểm thử tạo.
- UI: bấm đăng nhập chuyên viên; chuyển lần 01 sang lần 02; thấy bảng hai lần nộp, thao tác sửa lần trước bị vô hiệu hóa; mở form bổ sung, nhập dữ liệu và bấm Escape hiện cảnh báo chưa lưu, đóng form giữ panel cha.
- Snapshot trước migration: `C:\Users\nguye\.config\buildappraisal\backups\20260927-before-lineage.json`. DDL đã chạy trong transaction rollback trước khi áp dụng.

## 5. Phần còn lại

Tiếp tục các mục trong kế hoạch full stack: hoàn thiện workflow/phê duyệt/ủy quyền và SLA, parser/OCR chạy qua hàng đợi, chuyển các trang danh mục/dashboard còn minh họa sang cloud, RAG/đánh giá AI, CI/quan sát/restore và production riêng. Phần hồ sơ gốc và lần bổ sung ở mục 7.2 của bàn giao G0–G1 đã được thực hiện trong đợt này. Chưa xác nhận hoàn tất toàn bộ lộ trình.
