# Phiếu duyệt nghiệp vụ bản demo

**Trạng thái: Đã hoàn thành đối chiếu tài liệu và sửa phần mềm cho demo; chưa có chữ ký xác nhận của chuyên viên Sở.**

Kết quả từng tình huống và thay đổi đã thực hiện: [báo cáo pháp lý/biểu mẫu](LEGAL_FORMS_DEMO_REVIEW_2026_09_27.md). Bảng dưới đây dành cho việc ghi nhận xác nhận của con người, không còn là danh sách nghiên cứu chưa thực hiện.

Người rà soát: …………………………  Phòng/đơn vị: …………………………  Ngày: …………………………

## Hồ sơ để đối chiếu

- Kho văn bản: `ai/app/legal_assistant.py` khai báo 7 nguồn; kết quả truy hồi lưu hash nguồn. Chuyên viên đối chiếu bản chính thức, hiệu lực, điều khoản chuyển tiếp và văn bản địa phương.
- Bộ BCNCKT: `output/appraisal/bo-ho-so-mau-bcnckt.zip`.
- Bộ GPXD/nghiệm thu: `output/appraisal/bo-mau-gpxd-nghiem-thu.zip`.
- Kết quả AI cần đọc duyệt: `output/appraisal/live-legal-ai-evaluation.json`.
- Tài liệu OCR gốc: `docs/THCS Hương Xuân/`; bản nhận dạng theo trang: `output/appraisal/ocr-real-documents/`.
- Bằng chứng kiểm thử kỹ thuật: `docs/DEMO_REGRESSION_2026_09_27.md`.

## Ma trận tình huống đề nghị chuyên viên duyệt

Mỗi dòng đánh dấu **Đạt / Cần sửa / Không áp dụng**, ghi số điều khoản, nguồn, trang và nhận xét cụ thể. Bảng này là danh mục rà soát, chưa phải bộ dữ liệu đã gán nhãn.

| STT | Tình huống | Nội dung cần xác nhận | Kết quả / ghi chú |
| --- | --- | --- | --- |
| 1 | BCNCKT lần trình đầu | Thành phần đầu vào theo tờ trình, phạm vi thẩm định và tài liệu thiếu | Chờ rà soát |
| 2 | BCNCKT lần bổ sung | Liên kết lần nộp, tài liệu mới, kết quả đối chiếu thay đổi | Chờ rà soát |
| 3 | BCNCKT vốn/nhóm/cấp khác nhau | Điều kiện áp dụng checklist theo dữ liệu đã xác nhận | Chờ rà soát |
| 4 | BCNCKT chuyển tiếp trước/sau 01/07 | Mốc nộp, kết quả trước đó, căn cứ chuyển tiếp, thẩm quyền | Chờ rà soát |
| 5 | GPXD xây dựng mới | Điều kiện, tài liệu và trường cần điền trong mẫu đúng loại công trình | Chờ rà soát |
| 6 | GPXD theo giai đoạn | Phạm vi giai đoạn, quan hệ với thiết kế và quyết định | Chờ rà soát |
| 7 | GPXD nhóm công trình | Nội dung áp dụng cho từng công trình trong nhóm | Chờ rà soát |
| 8 | GPXD nhà ở riêng lẻ | Thiết kế, đất đai, an toàn liền kề, đối tượng áp dụng | Chờ rà soát |
| 9 | GPXD sửa chữa/cải tạo | Hiện trạng, ảnh, thiết kế sửa chữa, mẫu tương ứng | Chờ rà soát |
| 10 | GPXD di dời | Khảo sát chất lượng, phương án, địa điểm di dời | Chờ rà soát |
| 11 | GPXD có thời hạn | Quy định địa phương, quy mô, thời hạn tồn tại | Chờ rà soát |
| 12 | Điều chỉnh giấy phép | Bản gốc, nội dung thay đổi và thiết kế điều chỉnh | Chờ rà soát |
| 13 | Gia hạn giấy phép | Điều kiện, số lần và thời hạn; ghi trên giấy phép đúng mẫu | Chờ rà soát |
| 14 | Cấp lại giấy phép | Lý do; chuẩn bị bản sao giấy phép cũ | Chờ rà soát |
| 15 | Nghiệm thu hoàn thành | Hồ sơ, điều kiện, phạm vi kiểm tra, kết quả cần người có thẩm quyền quyết định | Chờ rà soát |
| 16 | Nghiệm thu có điều kiện | Điều kiện được phép áp dụng, công việc còn lại, trách nhiệm theo dõi | Chờ rà soát |
| 17 | Nghiệm thu một phần | Phạm vi phần đưa vào sử dụng và điều kiện an toàn | Chờ rà soát |
| 18 | Tồn tại và khắc phục | Hạn, người chịu trách nhiệm, bằng chứng và xác nhận kiểm tra | Chờ rà soát |
| 19 | OCR số liệu / bảng / chứng chỉ | So bản gốc; xác nhận từng trường tiền, diện tích, ngày, số văn bản | Chờ rà soát |
| 20 | Trợ lý AI thiếu hồ sơ / thiếu nguồn | Không tự xác nhận đủ điều kiện; nội dung diễn giải phải được nguồn hỗ trợ | Chờ rà soát |

## Điều kiện đánh dấu đạt cho một đầu ra

- [ ] Đúng dự án, lần nộp và phạm vi quyền xử lý.
- [ ] Đúng nguồn chính thức, hiệu lực, điều kiện và trường hợp chuyển tiếp.
- [ ] Mỗi nhận xét có dẫn chứng và vị trí đủ để kiểm tra lại.
- [ ] Số liệu OCR đã so với bản gốc, có người xác nhận.
- [ ] Diễn giải AI không vượt quá nội dung nguồn hoặc bỏ qua điều kiện áp dụng.
- [ ] Mẫu, trường thông tin, cách ghi, căn lề A4 và phân trang đã duyệt.
- [ ] Đầu ra mô phỏng/dự thảo được nhận biết rõ; chưa cấp số, ký hoặc phát hành.

## Phản hồi và quyết định

Mã tình huống: …………  Tài liệu/trang/điều khoản: …………………………

Nội dung cần sửa: …………………………………………………………………………

Kết quả mong đợi: …………………………………………………………………………

Kết luận cho phạm vi demo: ………………………………………………………………

Người xác nhận nghiệp vụ: …………………………  Ngày: …………………………

Phần domain, production và SMTP không thuộc đợt bàn giao này.
