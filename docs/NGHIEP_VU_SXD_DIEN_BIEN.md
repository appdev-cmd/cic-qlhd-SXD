# Nghiệp vụ Sở Xây dựng Điện Biên: thẩm định, cấp phép, kiểm tra nghiệm thu

**Ngày lập:** 29/09/2026 · **Bản:** dự thảo N0, chờ chuyên viên phòng Quản lý xây dựng xác nhận.
**Chính sách đang cài đặt:** `procedure_policy.VERSION = nd217-nd207-2026.07`; SLA `sla-2026.09.29-nd217-steps`.
**Nguồn văn bản:** kho `01_phap_ly_quy_chuan/`, tải từ qlda.gxd.vn bằng `scripts/fetch_gxd_document.py`.

> Tài liệu mô tả cách hệ thống đang mô hình hóa quy trình. Hệ thống chỉ **gợi ý** thẩm quyền, thời hạn và mẫu văn bản. Kết luận pháp lý, số liệu và văn bản phát hành do chuyên viên và lãnh đạo Sở quyết định. Mọi mục đánh dấu ⚠ cần xác nhận trước khi dùng chính thức.

## 1. Căn cứ chính

| Văn bản | Nội dung dùng trong hệ thống |
|---|---|
| Luật Xây dựng 135/2025/QH15 (hiệu lực 01/7/2026) | Điều 27 (thẩm định BCNCKT), Điều 43–44 (GPXD, miễn phép), Điều 57 (kiểm tra nghiệm thu) |
| NĐ 217/2026/NĐ-CP | Điều 32–33 thẩm quyền thẩm định; Điều 35 hồ sơ; Điều 36 trình tự; Điều 37 thời hạn; Điều 38 nội dung; Điều 53–54 GPXD; Điều 73 khoản 5 phân công chuyên ngành; Điều 76 chuyển tiếp; Phụ lục I (Mẫu 03, 14, 15, 16), Phụ lục II (mẫu GPXD), Phụ lục IV (công trình ảnh hưởng lớn) |
| NĐ 207/2026/NĐ-CP | Điều 25–27 kiểm tra công tác nghiệm thu; Phụ lục VI–VIII, IX |
| Luật Xây dựng 2014 (hợp nhất 62/2020) | Điều 59: thời hạn cho hồ sơ chuyển tiếp theo NĐ 175/2024 |
| NĐ 339/2026/NĐ-CP | Xử phạt vi phạm hành chính (tham chiếu hậu kiểm) |
| TT 27/2023, 28/2023/TT-BTC | Phí thẩm định thiết kế, dự án |
| TT 39/2026 | Cập nhật cơ sở dữ liệu quốc gia trong 05 ngày làm việc |

## 2. Vai trò

| Vai trò | Việc chính trên hệ thống |
|---|---|
| Chuyên viên phòng QLXD | Tiếp nhận, kiểm tra hồ sơ, yêu cầu bổ sung, tạm dừng, thẩm định, dự thảo kết quả |
| Trưởng phòng | Phân công, rà soát, trả lại, gia hạn, từ chối tiếp nhận, dừng xử lý |
| Lãnh đạo Sở | Phê duyệt kết quả (chưa ký số/cấp số trong giai đoạn demo) |
| Quản trị | Danh mục, lịch nghỉ, tài khoản |

⚠ Cần QĐ 48/2025/QĐ-UBND và quy chế phân công nội bộ để chốt ai được làm thao tác nào.

## 3. Thẩm quyền (module `ai/app/authority.py`)

### 3.1 Thẩm định BCNCKT (Điều 32–33 NĐ 217, Điều 73 khoản 5)
- Dự án do UBND cấp xã quyết định đầu tư → UBND xã (từ chối tiếp nhận tại Sở).
- Dự án quan trọng quốc gia, công trình cấp đặc biệt → Bộ quản lý công trình chuyên ngành.
- Trong khu công nghiệp, khu kinh tế → Ban quản lý.
- Dự án kinh doanh không có công trình thuộc Phụ lục IV → không thuộc diện thẩm định tại cơ quan chuyên môn.
- Còn lại → Sở quản lý chuyên ngành. Sở Xây dựng phụ trách dân dụng, giao thông, hạ tầng kỹ thuật, khu đô thị, công nghiệp nhẹ, vật liệu xây dựng.

### 3.2 Cấp GPXD (Điều 43 Luật 135, Điều 53 NĐ 217)
- Điều chỉnh, gia hạn, cấp lại giấy phép đã cấp → cơ quan đã cấp (điểm a khoản 4 Điều 53).
- Cấp mới:
  - đã được cơ quan chuyên môn thẩm định BCNCKT → miễn phép, chuyển sang thông báo khởi công;
  - dự án đầu tư công do Chủ tịch UBND các cấp quyết định → miễn phép ⚠ (xác nhận người quyết định đầu tư);
  - dự án kinh doanh có công trình Phụ lục IV → phải thẩm định BCNCKT, sau đó được miễn phép;
  - trong khu công nghiệp → Ban quản lý;
  - cấp III, IV, nhà ở riêng lẻ → UBND xã;
  - cấp II trở lên → Sở Xây dựng.

### 3.3 Kiểm tra công tác nghiệm thu (Điều 25–26 NĐ 207)
- Cấp đặc biệt → Bộ.
- Không thuộc Phụ lục IV và không phải đầu tư công → không thuộc diện kiểm tra.
- Còn lại trên địa bàn → Sở Xây dựng.

### 3.4 Phụ lục IV NĐ 217: cách hệ thống nhận diện
- Tôn giáo, tín ngưỡng; kho, bãi → không thuộc.
- Đê điều → thuộc.
- Thủy lợi: cấp II trở lên thuộc; cấp III cần xác nhận; cấp IV không thuộc.
- Lĩnh vực khác: cấp II trở lên thuộc.
- Giao thông dưới cấp II → cần xác nhận.

⚠ Đây là quy tắc rút gọn. Chuyên viên phải đối chiếu từng mục Phụ lục IV khi hệ thống báo "cần xác nhận".

## 4. Quy trình và thời hạn

Đơn vị là ngày làm việc (NLV) theo lịch nghỉ `public.holidays`, trừ khi ghi "ngày".

### 4.1 Thẩm định BCNCKT

```
Tiếp nhận ─(≤05 NLV kiểm tra)─► Hợp lệ ─► Thẩm định ─► Rà soát ─► Phê duyệt (Mẫu 03, đóng dấu Mẫu 14)
   │                               │
   ├─ Từ chối tiếp nhận (sai thẩm quyền)   ├─ Tạm dừng ≤1 lần (Mẫu 16) ─► tiếp tục
   └─ Yêu cầu bổ sung 1 lần (Mẫu 15) ─► tiếp tục (thời hạn tính lại từ đầu)
        quá 20 NLV không bổ sung ─► Dừng thẩm định
```

| Nhóm dự án | Công trình cấp I trở lên | Công trình khác | Căn cứ |
|---|---|---|---|
| Quan trọng quốc gia | 60 ngày | 60 ngày | Điểm a khoản 1 Điều 37 |
| A | 25 NLV | 20 NLV | Điểm b |
| B | 20 NLV | 16 NLV | Điểm c |
| C | 15 NLV | 12 NLV | Điểm d |

- Gia hạn 01 lần, không quá thời hạn tương ứng (khoản 2 Điều 37).
- Hồ sơ chuyển tiếp theo NĐ 175/2024 (khoản 2 Điều 76): A 35, B 25, C 15 ngày (Điều 59 Luật 2014).
- Nội dung thẩm định gồm 4 nhóm theo Điều 38. Thành phần hồ sơ theo khoản 2 Điều 35, điểm a–m (N2 sẽ số hóa).

### 4.2 Cấp GPXD

```
Tiếp nhận ─(05 NLV; 03 với nhà ở riêng lẻ: thẩm định hồ sơ, kiểm tra thực địa)─► Xem xét ─► Cấp phép
   │           │
   │           ├─ Thông báo bổ sung 1 lần: chờ 02 NLV (01 với gia hạn/cấp lại)
   │           │     không đáp ứng ─► 01 NLV thông báo không cấp
   │           └─ Lấy ý kiến cơ quan liên quan: 02 NLV, quá hạn coi như đồng ý
   └─ Từ chối tiếp nhận (sai thẩm quyền, thuộc diện miễn phép)
```

| Loại | Thời hạn (điểm b khoản 1 Điều 54) |
|---|---|
| Cấp mới, theo giai đoạn, theo dự án, di dời, có thời hạn | 10 NLV |
| Điều chỉnh, sửa chữa cải tạo | 09 NLV |
| Nhà ở riêng lẻ | 07 NLV |
| Gia hạn, cấp lại | 05 NLV |

### 4.3 Kiểm tra công tác nghiệm thu (Điều 27 NĐ 207)
- Kiểm tra trong thi công:
  - không quá 03 lần với cấp đặc biệt, cấp I; 02 lần với công trình khác;
  - thông báo kết quả trong 10 NLV kể từ ngày kiểm tra.
- Kiểm tra khi hoàn thành: báo cáo theo Phụ lục VI, kết quả theo Phụ lục VIII (16/12 NLV theo cấp).
- Yêu cầu bổ sung, giải trình: không giới hạn số lần.

## 5. Trạng thái trên hệ thống

| Trạng thái | Nghĩa |
|---|---|
| Tiếp nhận / Đang kiểm tra / Đã kiểm tra | Giai đoạn kiểm tra hồ sơ, AI đọc tài liệu |
| Đang xử lý | Hồ sơ hợp lệ, đang thẩm định hoặc xem xét (kể cả sau khi tiếp tục từ bổ sung, tạm dừng) |
| Yêu cầu bổ sung / Tạm dừng thẩm định | Đồng hồ pháp lý dừng; có hạn chờ người nộp |
| Đã rà soát nội bộ | Có kết quả |
| Từ chối tiếp nhận / Dừng xử lý | Kết thúc không có kết quả |

Trạng thái hạn: Đúng hạn, Sắp đến hạn (≤03 NLV), Quá hạn, Tạm dừng, Quá hạn bổ sung, Hoàn thành, Hoàn thành trễ, Đã đóng, Đã thay thế, Chưa cấu hình.

## 6. Việc cần chuyên viên xác nhận (gate N0)
1. Bảng thời hạn mục 4 và lịch nghỉ, làm bù năm 2026–2027.
2. Quy tắc nhận diện Phụ lục IV (mục 3.4) và điều kiện miễn phép với dự án đầu tư công.
3. Phân quyền thao tác theo vai trò (mục 2) theo quy chế nội bộ.
4. Danh sách mẫu văn bản đang dùng tại Sở (Mẫu 03, 14, 15, 16; mẫu GPXD Phụ lục II; Phụ lục VIII NĐ 207).
5. Quyết định công bố thủ tục hành chính của tỉnh cho 3 thủ tục.
