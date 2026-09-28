# Ma trận quyền và bằng chứng — 28/09/2026

## Nguyên tắc đã triển khai

- JWT được xác minh qua Supabase Auth; profile phải active, có province_id và department.
- Kết nối runtime dùng login riêng, không superuser/BYPASSRLS, giao dịch gắn actor ID đã xác minh. Không dùng DATABASE_URL quản trị làm runtime.
- Scope theo tỉnh và phòng; admin được vượt phòng trong cùng tỉnh. Không mặc định cho lãnh đạo vượt tỉnh/phòng.
- Hàm ghi/queue backend chỉ được EXECUTE từ role backend; client dùng API kiểm tra quyền.
- Storage bản gốc/gallery private. Metadata, tải ảnh và quyền ghi phải qua kiểm tra scope.

## Ma trận đã kiểm chứng

| Tác vụ | Anon | Officer | Trưởng phòng | Lãnh đạo Sở | Admin | Backend |
| --- | --- | --- | --- | --- | --- | --- |
| Đăng nhập tài khoản staging riêng | — | Đạt | Đạt | Đạt | Đạt | — |
| Đọc dự án trong scope qua DB runtime | Bị chặn | 21 | 21 | 21 | 26 | Gắn actor |
| Đọc bảng hồ sơ/nhân sự/audit/jobs trực tiếp không token | Bị chặn | — | — | — | — | — |
| Gọi claim job/persist case trực tiếp từ client | Bị chặn | Bị chặn | Bị chặn | Bị chặn | Bị chặn | Có grant |
| Gallery ghi qua API | Bị chặn | Đã thử thành công | Được quy định trong API/SQL | Đã thử 403 | Được quy định trong API/SQL | RPC có scope/CAS |
| CRUD danh mục | Bị chặn | API không cho sửa | API cho sửa | API không cho sửa | API cho sửa | RLS/audit |
| Tài khoản không tồn tại | — | Đọc 0 dự án và 0 hồ sơ | — | — | — | Kiểm chứng với actor ngẫu nhiên |

Số lượng là dữ liệu thử nghiệm tại thời điểm kiểm tra; không phải quyền cố định hoặc chỉ tiêu nghiệp vụ. Ô “được quy định” dựa trên code/grant, chưa phải E2E ghi từng role.

## Công cụ và giới hạn

- `scripts/verify_access_hardening.py`: anonymous Data API, Auth/profile, quyền RPC client, kết nối runtime và helper scope âm tính. Việc thay scope/profile để thử được rollback.
- `scripts/verify_gallery_cloud.py`: dự án tạm thuộc tài khoản kiểm thử, private upload/download, bytes/hash, CAS, director, audit và dọn dữ liệu.
- `scripts/verify_baseline_local.py`: DDL/grant/RLS trên PostgreSQL cục bộ, dùng tiền đề Auth/Storage mô phỏng.
- `scripts/verify_restore_local.py`: khôi phục bản ghi public, hash theo kiểu SQL, FK và sequence; không phục hồi Auth credential/tệp Storage.

Cần bổ sung kiểm thử ghi hồ sơ và workflow ở mọi role, assignment, token hết hạn, tài khoản bị vô hiệu sau khi job được xếp hàng, quyền Storage theo từng actor và UAT. Không suy ra tất cả quyền đã đạt chỉ từ test helper.

Migration `20260928000001_restore_dev_anon_read.sql` đã từng áp và mở đọc anonymous trên 22 bảng. Giữ file cũ để đối soát lịch sử; **không dùng nó để bootstrap hoặc rollback**. Migration `000002` đã đóng quyền; bootstrap DB trống dùng baseline sau khắc phục.
