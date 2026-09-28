# Bộ hồ sơ mẫu đầu vào và đầu ra BCNCKT

Tất cả tài liệu là dữ liệu mô phỏng để thử phần mềm, không có giá trị pháp lý. Các phiếu PL là dữ liệu tham chiếu, không giả lập văn bản được ký bởi cơ quan nhà nước. Không dùng số chứng chỉ hoặc tên nhân sự thật.

Ngày trình giả lập: 27/09/2026; dùng bộ quy định sau 01/07/2026 theo yêu cầu. NĐ 217/2026 điều chỉnh quy trình, NĐ 206/2026 điều chỉnh chi phí. Đây là tình huống trình mới mô phỏng, không sửa hồ sơ Hương Xuân gốc. Checklist Điều 35 có các điều kiện còn chờ xác nhận và tài liệu còn thiếu, được thể hiện trong kết quả.

## Cách sử dụng

1. Mở phân hệ Thẩm định BCNCKT, chọn Nạp mẫu lần đầu hoặc Nạp mẫu đã bổ sung. Phần mềm tạo hồ sơ riêng và đọc lại tài liệu bằng cùng quy trình tiếp nhận.
2. Có thể tự tạo hồ sơ, nộp TTR trước, xác nhận danh mục pháp lý được nhận diện, rồi nộp 13 tài liệu còn lại. Mỗi thành phần chọn một bản DOCX hoặc PDF, không nộp cả hai như hai lần trình.
3. Lần bổ sung nộp ba tệp v2 vào đúng KT03, KT05, NL01. Chạy lại kiểm tra. Dữ liệu và nhận xét cần chuyên viên xác nhận.
4. Xem bằng chứng và xuất dự thảo tại tab Dự thảo kết quả. Nút xuất trên phần mềm lấy dữ liệu hồ sơ hiện tại.

## Thành phần đầu vào

`dau-vao/01-lan-dau`: 14 tài liệu, mỗi tài liệu có DOCX và PDF: tờ trình; 7 phiếu pháp lý; khảo sát địa hình; khảo sát địa chất; thuyết minh BCNCKT; thuyết minh TKCS; bảng TMĐT; năng lực 2 đơn vị và 6 nhân sự mẫu.

`dau-vao/02-bo-sung`: thuyết minh BCNCKT, bảng TMĐT và năng lực phiên bản 2.

TKCS/khảo sát là nội dung minh họa, chưa có bản vẽ thi công, số liệu thí nghiệm, mô hình kết cấu hoặc chứng nhận. Không đủ để kết luận an toàn công trình.

## Kết quả đầu ra

Mỗi thư mục kết quả có 5 tài liệu, mỗi loại gồm DOCX/PDF A4:
- report: báo cáo hỗ trợ kiểm tra có nguồn.
- supplement: khung Mẫu 15, các thành phần hồ sơ cần chuyên viên xác minh trước khi yêu cầu bổ sung.
- suspension: khung Mẫu 16, lỗi/sai sót cần xem xét có cản trở kết luận hay không; không tự phát hành tạm dừng.
- notice: khung Mẫu 03 đủ sáu phần; chưa phải văn bản ban hành.
- decision: khung Mẫu 09 với 19 nhóm thông tin và ba điều; chưa kết luận đủ điều kiện phê duyệt.

Kèm `ket-qua-co-cau-truc.json` chứa dữ liệu, nguồn, các lượt kiểm tra và lịch sử; `manifest.json` chứa mã SHA-256 và kết quả tóm tắt.

Lần đầu: khác mã chứng chỉ mẫu, khác năm tiêu chuẩn, tổng diện tích hạng mục 17.551 so với 17.140 m², chênh 411 m² theo giả thiết cộng đã nêu.

Sau bổ sung: các số liệu mẫu trên được thống nhất. Tổng mức đầu tư hai phiên bản đều 217.230.000.000 đồng, tiết kiệm ròng bằng 0; từng khoản mục tăng/giảm vẫn phải được thẩm định.

Mọi phiên bản: bể hữu ích 45 m³ và kích thước ngoài 7,12 × 5,35 × 2,25 m không đủ kết luận PCCC. Chữ ký, pháp lý, khảo sát, kết cấu, đấu nối, đơn giá và năng lực vẫn cần kiểm tra nghiệp vụ. Các trường trích xuất đang ở trạng thái chờ xác nhận.

Các báo cáo được tạo bằng bộ kiểm tra quy tắc trên chính tài liệu mẫu. Chưa gọi mô hình AI để tạo các kết quả đóng gói này.
