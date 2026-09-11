# Knowledge Base: Văn Bản Pháp Luật Xây Dựng (Laws)

Thư mục chứa các văn bản quy phạm pháp luật được chuẩn hóa và phân đoạn (chunking) theo cấu trúc Điều / Khoản / Điểm phục vụ RAG (Retrieval-Augmented Generation) cho Legal AI.

## Các văn bản nòng cốt:
1. **Luật Xây dựng 2025** (và các luật sửa đổi, bổ sung liên quan).
2. **Luật Đấu thầu**, **Luật Đất đai**, **Luật Đầu tư công**, **Luật Phòng cháy chữa cháy và Cứu nạn cứu hộ**.
3. **Nghị định số 217/2026/NĐ-CP**: Quy định chi tiết một số điều của Luật Xây dựng về quản lý dự án đầu tư xây dựng, trình tự thẩm định Báo cáo NCKH, thiết kế bản vẽ thi công.
4. **Các Thông tư hướng dẫn** của Bộ Xây dựng về thẩm định dự toán, định mức kinh tế kỹ thuật.

## Cấu trúc dữ liệu chunk đề xuất:
- `law_id`: Mã văn bản (vd: `LUAT_XD_2025`, `ND_217_2026`)
- `article`: Điều (vd: `Dieu_14`)
- `clause`: Khoản (vd: `Khoan_2`)
- `point`: Điểm (vd: `Diem_a`)
- `title`: Tiêu đề điều khoản
- `content`: Nội dung văn bản
- `effective_date`: Ngày có hiệu lực
- `status`: Trạng thái hiệu lực (`ACTIVE`, `SUPERSEDED`)
