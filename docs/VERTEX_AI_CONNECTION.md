# Kết nối Vertex AI cho thẩm định BCNCKT

## Nguồn tích hợp

- Tham khảo `selfhost/api/src/routes/gemini-proxy.js` của dự án `D:\01_Projects\qlda-ddcn-ht-selfhost` và cấu hình container `qlda-api` trên máy chủ Công báo.
- Backend thẩm định gọi trực tiếp Vertex AI bằng tài khoản dịch vụ, theo cùng cơ chế xác thực và cấu hình project/khu vực của hệ thống nguồn.
- Mô hình cấu hình hiện tại: `gemini-3.8-flash`; endpoint: `global`. Không tự chuyển sang nhà cung cấp hoặc mô hình khác khi có lỗi.
- Tham khảo kỹ thuật: [Vertex AI generateContent](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart) và [JSON theo schema](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2).

## Cấu hình máy chủ

Các biến `AI_PROVIDER=vertex`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_MODEL`, `VERTEX_SA_KEY_PATH` được lưu trong `.env.local` đã loại khỏi Git. Tệp tài khoản dịch vụ nằm ngoài repository, trong thư mục cấu hình riêng của tài khoản Windows; nội dung khóa không gửi đến trình duyệt hoặc ghi trong tài liệu này.

`google-auth[requests]` cấp và làm mới access token. Backend lưu token trong bộ nhớ, giới hạn thời gian gọi mô hình và trả thông báo lỗi đã lược bỏ thông tin xác thực. Việc đọc cấu hình qua SSH không thay đổi triển khai trên Công báo.

## Cách dùng

1. Vào Quản lý Dự án → Thẩm định BCNCKT. Khung kết nối hiển thị nhà cung cấp, mô hình và trạng thái phản hồi gần nhất.
2. Bấm **Kiểm tra kết nối AI** để gửi một lời nhắn thử không chứa hồ sơ. Cấu hình đầy đủ và đã gọi mô hình thành công là hai trạng thái riêng biệt.
3. Mở hồ sơ, bật **Phân tích thêm bằng mô hình AI**, rồi bấm **Chạy kiểm tra hồ sơ**.
4. Xem đề xuất trong tab **Nội dung thẩm định**. Mỗi đề xuất ghi nhận mô hình và nguồn tài liệu; chuyên viên xác nhận nội dung và mức hỗ trợ của trích dẫn.

Backend chỉ gửi trích đoạn được chọn trong phạm vi kiểm tra, tối đa khoảng 55.000 ký tự. Không tự gửi toàn bộ danh sách hồ sơ hoặc chạy lại tất cả bộ mẫu. Nhận xét có mã nguồn không tồn tại bị loại; nếu Vertex trả lỗi hoặc phản hồi chưa hoàn chỉnh thì lượt kiểm tra chỉ giữ kết quả quy tắc và hiển thị nguyên nhân.

## Phạm vi hiện tại

Đã kết nối Vertex AI cho phân tích hồ sơ BCNCKT. Cấp phép, hậu kiểm và chatbot pháp luật chưa được chuyển sang mô hình này; chatbot vẫn có nhãn minh họa. Các kết quả AI là đề xuất cần rà soát, chưa phải văn bản phê duyệt.

Ngày 27/09/2026, endpoint kiểm tra kết nối trên Core API local đã nhận JSON hợp lệ từ Vertex AI và trả trạng thái `connected`. TypeScript/Vite build thành công.

Lượt phân tích thực tế trên hồ sơ mô phỏng `DA-2026-DB-0207 · Thẩm định BCNCKT · Lần 01` đã hoàn tất: `provider=rules+vertex`, `model=gemini-2.5-flash`, lưu **6 đề xuất** có mã nguồn tồn tại trong trích đoạn gửi đi. Việc nguồn tồn tại không chứng minh nhận xét chính xác về chuyên môn; nội dung vẫn cần chuyên viên rà soát. Không chạy lại toàn bộ hồ sơ mẫu.

## Chuyển sang Gemini 3.8 Flash

Theo yêu cầu ngày 27/09/2026, cấu hình hiện tại đã đổi sang `gemini-3.8-flash` tại `global`. Phân tích hồ sơ dùng `thinkingLevel=MEDIUM`; kiểm tra kết nối dùng `LOW`. Bỏ tham số temperature cho 3.8 và giữ schema JSON cùng cơ chế xác thực nguồn. Tham khảo [hướng dẫn Gemini 3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-flash).

Đã khởi động lại backend và nhận phản hồi thật qua `/api/appraisal/model/check`: `model=gemini-3.8-flash`, `connection.status=connected`. Các lượt phân tích cũ giữ nguyên tên mô hình đã sử dụng; chưa chạy lại toàn bộ hồ sơ.
