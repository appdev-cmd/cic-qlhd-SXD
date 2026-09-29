# Kế hoạch hoàn thiện 3 nghiệp vụ lõi của Sở Xây dựng có AI hỗ trợ

**Ngày lập:** 29/09/2026.
**Trạng thái:** Đã duyệt qua chat 29/09/2026.
- N0: đã bổ sung văn bản và dự thảo [nghiệp vụ](docs/NGHIEP_VU_SXD_DIEN_BIEN.md); chờ chuyên viên xác nhận (gate).
- N1: đã xong, kèm bộ dữ liệu mẫu sample-v3 ([bàn giao](docs/N0_N1_DELIVERY_2026_09_29.md)).
- N2: phiếu thẩm định Điều 38, kết luận 3 mức, vòng đóng dấu Mẫu 14 và lưu trữ khoản 9 Điều 36 ([bàn giao](docs/N2_DELIVERY_2026_09_29.md)); AI phân loại/trích Mẫu 01/QCVN chuyển sang N5 (cần credential).
- N3–N6: chưa làm.
**Phạm vi:** Thẩm định Báo cáo nghiên cứu khả thi (BCNCKT) · Cấp giấy phép xây dựng (GPXD) · Hậu kiểm và kiểm tra công tác nghiệm thu.
**Kế hoạch trước:** [đợt G0–G6 đã triển khai](docs/plans/20260929-ke-hoach-G0-G6-da-trien-khai.md) · [bàn giao tối ưu](docs/OPTIMIZATION_DELIVERY_2026_09_28.md).

---

## 1. Kết luận nhanh

Nghiên cứu dựa trên Luật Xây dựng 135/2025/QH15, NĐ 217/2026/NĐ-CP, NĐ 207/2026/NĐ-CP, TT 32/2026/TT-BXD và TT 39/2026/TT-BXD (cùng hiệu lực từ 01/7/2026), đối chiếu với mã nguồn hiện tại. Kết quả:

1. **Khung chung đã đúng hướng.** Hệ thống đã có:
   - ba phân hệ riêng, chuỗi lần nộp, phiếu chuyên môn, SLA theo Điều 37/54 NĐ 217 và Điều 27 NĐ 207;
   - dự thảo A4, AI có trích dẫn nguồn;
   - xử lý chuyển tiếp mốc 01/7/2026 (`legal.py`).
2. **Quy trình hành chính còn thiếu nhiều bước bắt buộc**, cụ thể:
   - bước kiểm tra hồ sơ 05 ngày làm việc; phiếu bổ sung Mẫu 15 (chỉ một lần); phiếu tạm dừng Mẫu 16 (tối đa một lần);
   - tự dừng thẩm định sau 20 ngày làm việc; từ chối tiếp nhận do sai thẩm quyền;
   - lấy ý kiến cơ quan liên quan; đóng dấu Mẫu 14; cập nhật Cơ sở dữ liệu quốc gia trong 05 ngày làm việc;
   - các mốc con của GPXD (05/02/01 ngày làm việc; 02 ngày cho cơ quan được hỏi ý kiến, không trả lời coi là đồng ý);
   - kiểm tra nghiệm thu **trong quá trình thi công** (tối đa 2–3 lần).
3. **Một số logic hiện tại lệch luật:**
   - SLA đang *tạm dừng rồi cộng dồn* thời gian chờ bổ sung. Theo khoản 5 Điều 36 NĐ 217, sau khi nộp lại hồ sơ bổ sung thì thời hạn **tính lại từ đầu**.
   - `knowledge-base/provinces/dien_bien.json` còn ghi hạn cấp phép 20 ngày theo quy định cũ.
   - Thành phần hồ sơ BCNCKT mặc định đang theo mẫu một dự án trường học ở Hà Tĩnh, chưa theo khoản 2 Điều 35 NĐ 217.
4. **Nội dung thẩm định chưa theo đủ 4 nhóm của khoản 4 Điều 27 Luật 135:** phù hợp quy hoạch; kết nối hạ tầng kỹ thuật; quy chuẩn, tiêu chuẩn, an toàn, phòng cháy chữa cháy (PCCC); chi phí. Hiện quy tắc chủ yếu kiểm tra số học chi phí và diện tích.
5. **AI có thể hỗ trợ ở mọi bước** (phân loại hồ sơ, trích xuất chỉ tiêu, đối chiếu quy hoạch và quy chuẩn, soạn văn bản có trích dẫn, rà soát chéo hồ sơ nghiệm thu). Nguyên tắc giữ nguyên: **AI chỉ đề xuất có nguồn, chuyên viên quyết định**.

---

## 2. Nghiên cứu pháp lý và nghiệp vụ

### 2.1 Văn bản căn cứ (đã đọc trong kho `01_phap_ly_quy_chuan/`)

| Văn bản | Nội dung dùng cho hệ thống |
| --- | --- |
| Luật Xây dựng 135/2025/QH15 (hiệu lực 01/7/2026; riêng khoản 2, 3 Điều 43 hiệu lực từ 01/01/2026) | Điều 27 (4 nội dung thẩm định BCNCKT), Điều 38 (quyền của cơ quan thẩm định), Điều 43–47 (GPXD, miễn phép, thông báo khởi công, trật tự xây dựng), Điều 57 (nghiệm thu, kiểm tra của cơ quan nhà nước) |
| NĐ 217/2026/NĐ-CP (thay NĐ 175/2024) | Điều 7 (thủ tục hành chính điện tử, không đòi giấy tờ đã có trong CSDL), Điều 32–38 (thẩm quyền, hồ sơ, trình tự, thời gian, nội dung thẩm định), Điều 41 (chủ đầu tư thẩm định thiết kế sau khi dự án được phê duyệt), Điều 49–67 (GPXD), Điều 73 (trách nhiệm tỉnh, Sở), Điều 76 (chuyển tiếp); Phụ lục I các Mẫu 01, 02, 03, 14, 15, 16 |
| NĐ 207/2026/NĐ-CP (thay NĐ 06/2021) | Điều 22–24 (nghiệm thu của chủ đầu tư), Điều 25–27 (kiểm tra công tác nghiệm thu), Điều 28–30 (hồ sơ hoàn thành, đưa vào sử dụng, bàn giao); Phụ lục VI (báo cáo hoàn thành), VII (danh mục hồ sơ), VIII (thông báo kết quả), IX (công trình quy mô lớn) |
| TT 32/2026/TT-BXD | Kế hoạch thí nghiệm, quan trắc, kiểm định, giám định (căn cứ yêu cầu thí nghiệm đối chứng khi kiểm tra) |
| TT 34/2026/TT-BXD | Xác định cấp công trình (dùng để xác định thẩm quyền và thời hạn) |
| TT 39/2026/TT-BXD, NĐ 212/2026 | Cập nhật dữ liệu kết quả thủ tục lên Hệ thống thông tin quốc gia trong 05 ngày làm việc |
| NĐ 206/2026/NĐ-CP | Thẩm định tổng mức đầu tư dự án đầu tư công, PPP |
| QCVN 01/2021, 03/2022, 06/2022, 10/2014, QCVN BCA 10/2025, 18/2021 | Căn cứ kỹ thuật cho nhóm nội dung "quy chuẩn, an toàn, PCCC" |

**Chưa có trong kho, cần bổ sung:**
- Phụ lục II NĐ 217 (mẫu đơn, mẫu giấy phép xây dựng).
- Phụ lục IV NĐ 217 (danh mục công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng).
- NĐ 140/2025 và 144/2025: hai file hiện là PDF scan không trích được chữ; các điều liên quan đã bị NĐ 217 bãi bỏ một phần.
- Thông tư về phí thẩm định hiện hành.
- **Quyết định 48/2025/QĐ-UBND của UBND tỉnh Điện Biên** (chức năng, nhiệm vụ, cơ cấu tổ chức Sở Xây dựng sau hợp nhất) và quy chế hoặc quy trình nội bộ của phòng Quản lý xây dựng. Trang sxd.dienbien.gov.vn lỗi chứng chỉ SSL nên không tải được.

### 2.2 Vị trí của Sở Xây dựng Điện Biên và phòng Quản lý xây dựng

- Theo QĐ 48/2025/QĐ-UBND (ngày 31/8/2025, sau hợp nhất), Sở Xây dựng Điện Biên tham mưu quản lý nhà nước về: quy hoạch, kiến trúc; **hoạt động đầu tư xây dựng**; phát triển đô thị; hạ tầng kỹ thuật; nhà ở, bất động sản; vật liệu xây dựng; **giao thông đường bộ, đường thủy nội địa**.
- Theo khoản 5 Điều 73 NĐ 217, Sở Xây dựng chủ trì thẩm định cho dự án dân dụng, khu đô thị, khu nhà ở, hạ tầng kỹ thuật, công nghiệp nhẹ, vật liệu xây dựng và **giao thông**. Công trình nông nghiệp thuộc Sở Nông nghiệp và Môi trường; công trình công nghiệp thuộc Sở Công Thương; dự án trong khu công nghiệp, khu kinh tế thuộc Ban quản lý các khu.
- **Phòng Quản lý xây dựng** là đầu mối chuyên môn (giả định cần anh/chị xác nhận theo quy chế nội bộ) của 3 công tác:
  - thẩm định BCNCKT và thẩm định điều chỉnh;
  - cấp, điều chỉnh, gia hạn, cấp lại, thu hồi GPXD thuộc thẩm quyền Sở;
  - kiểm tra công tác nghiệm thu; tiếp nhận thông báo khởi công và hậu kiểm theo phân cấp của UBND tỉnh.

  Tham mưu gồm: chuyên viên thụ lý → Trưởng/Phó phòng rà soát → Lãnh đạo Sở ký ban hành. Hồ sơ nộp và trả qua Trung tâm Phục vụ hành chính công hoặc Cổng Dịch vụ công quốc gia.

### 2.3 Thẩm quyền của Sở theo từng công tác

| Công tác | Sở Xây dựng thực hiện | Không thuộc Sở (hệ thống cần cảnh báo/từ chối tiếp nhận) |
| --- | --- | --- |
| Thẩm định BCNCKT (Điều 32–33 NĐ 217; Điều 27 Luật) | Dự án đầu tư công, PPP, dự án kinh doanh quy mô lớn hoặc có công trình thuộc Phụ lục IV, trên địa bàn tỉnh, thuộc chuyên ngành Sở; dự án do UBND tỉnh là cơ quan chủ quản | Dự án do UBND cấp xã quyết định đầu tư (cơ quan chuyên môn cấp xã thẩm định); dự án có công trình cấp đặc biệt, liên tỉnh, do Thủ tướng giao (bộ thẩm định); dự án trong khu công nghiệp/khu kinh tế; dự án chỉ lập Báo cáo kinh tế – kỹ thuật (không thẩm định tại cơ quan chuyên môn) |
| Cấp GPXD (Điều 53 NĐ 217; Điều 43 Luật) | Công trình trên địa bàn tỉnh, không phải cấp III/IV/nhà ở riêng lẻ, ngoài khu công nghiệp/khu kinh tế (thực tế là công trình cấp đặc biệt, I, II) | Công trình được miễn phép theo khoản 2 Điều 43 Luật (đáng chú ý: **dự án đã được cơ quan chuyên môn thẩm định BCNCKT**, dự án đầu tư công do Chủ tịch UBND các cấp quyết định) → chỉ gửi **thông báo khởi công** kèm hồ sơ |
| Kiểm tra công tác nghiệm thu (Điều 25–26 NĐ 207) | Công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng trên địa bàn; công trình thuộc dự án UBND tỉnh là cơ quan chủ quản | Công trình Phụ lục IX (Hội đồng kiểm tra nhà nước); công trình cấp đặc biệt, liên tỉnh (bộ) |

### 2.4 Quy trình chuẩn theo luật (đích mà hệ thống phải mô hình hóa)

**A. Thẩm định BCNCKT** (Điều 35–38 NĐ 217):

```
Tiếp nhận (Một cửa/DVC/bưu chính) ─► Kiểm tra thẩm quyền + hợp lệ ─┬─► Từ chối tiếp nhận (nêu lý do)
                                                                   │
                        ≤05 ngày làm việc: Phiếu bổ sung Mẫu 15 (1 lần) ◄┤
                                                                   ▼
Thẩm định 4 nhóm nội dung ─► (tùy chọn) lấy ý kiến / thuê chuyên gia ─► Tạm dừng Mẫu 16 (≤1 lần)
   │                                                                     │ 20 ngày làm việc không bổ sung → dừng thẩm định, trả hồ sơ
   ▼                                                                     │ Bổ sung xong → thời hạn tính lại từ đầu
Dự thảo Thông báo kết quả Mẫu 03: đánh giá từng nội dung + kết luận
   {đủ điều kiện | đủ điều kiện sau chỉnh sửa | chưa đủ điều kiện}
   ▼
Trưởng phòng rà soát ─► Lãnh đạo Sở ký ─► Đóng dấu bản vẽ Mẫu 14 (hoặc ký số)
   ▼
Trả kết quả + gửi cơ quan quản lý xây dựng địa phương ─► Lưu trữ ─► Cập nhật CSDL quốc gia (≤05 ngày làm việc)
```

- Thời hạn thẩm định tính từ ngày nhận đủ hồ sơ hợp lệ: QG 60 ngày; A 25/20; B 20/16; C 15/12 ngày làm việc (cấp I trở lên / cấp còn lại). Được gia hạn 01 lần, không quá thời hạn gốc.
- Hồ sơ theo khoản 2 Điều 35 (các điểm a–m): Tờ trình Mẫu 01; chủ trương đầu tư; quy hoạch làm căn cứ; thỏa thuận đấu nối hạ tầng, chấp thuận độ cao; khảo sát đã phê duyệt; BCNCKT và thiết kế; báo cáo thẩm tra Mẫu 02; tổng mức đầu tư và dữ liệu giá (đầu tư công/PPP); hồ sơ xử phạt (nếu có); hồ sơ hiện trạng và kiểm định (nếu sửa chữa, cải tạo).

**B. Cấp GPXD** (Điều 54, 56–66 NĐ 217):

```
Nộp trực tuyến toàn trình (DVC) ─► Kiểm tra, thông báo tiếp nhận
   ▼ ≤05 ngày làm việc (03 với nhà ở riêng lẻ): thẩm định hồ sơ + kiểm tra thực địa (nếu cần) + lấy ý kiến cơ quan liên quan
   │     └─ Cơ quan được hỏi trả lời trong 02 ngày làm việc; không trả lời coi là đồng ý
   ├─► Thông báo bổ sung 1 lần (thư điện tử/tin nhắn) ─► người nộp bổ sung trong 02 ngày làm việc
   │         └─ Không đạt → 01 ngày làm việc: thông báo lý do không cấp
   ▼
Dự thảo GPXD (nội dung Điều 49; mẫu Phụ lục II) ─► Lãnh đạo ký ─► Trả kết quả ─► Công khai (Điều 66) ─► CSDL
Tổng thời hạn: 10 (xây mới/di dời/có thời hạn) · 09 (điều chỉnh/sửa chữa, cải tạo) · 05 (gia hạn/cấp lại) · 07 (nhà ở riêng lẻ) ngày làm việc
```

Điều kiện xét cấp theo Điều 44 Luật và Điều 50–52 NĐ 217: phù hợp mục đích sử dụng đất (giấy tờ đất theo Điều 55); phù hợp quy hoạch hoặc quy chế kiến trúc; an toàn công trình và công trình lân cận; môi trường, PCCC, kết nối hạ tầng. Ngoài ra có điều chỉnh, gia hạn, cấp lại, thu hồi, hủy (Điều 63–65).

**C. Hậu kiểm và kiểm tra công tác nghiệm thu** (Điều 43 Luật; Điều 67, 73 NĐ 217; Điều 25–27 NĐ 207):

1. **Tiếp nhận thông báo khởi công**, gồm công trình miễn phép và công trình thuộc dự án Sở đã thẩm định. Hậu kiểm đối chiếu 3 nội dung theo điểm c khoản 2 Điều 67:
   - đủ điều kiện miễn phép;
   - phù hợp quy hoạch;
   - phù hợp thông số chủ yếu của thiết kế trong BCNCKT đã thẩm định.
2. **Kiểm tra trong quá trình thi công**:
   - lập kế hoạch kiểm tra căn cứ thông tin khởi công trên CSDL;
   - tối đa 03 lần với công trình cấp đặc biệt/cấp I, 02 lần với công trình khác (trừ khi có sự cố, nghiệm thu từng phần hoặc có điều kiện);
   - thông báo kết quả ≤10 ngày làm việc kể từ ngày kiểm tra.
3. **Kiểm tra khi hoàn thành**:
   - chủ đầu tư gửi báo cáo hoàn thành (Phụ lục VI) kèm danh mục hồ sơ (Phụ lục VII);
   - Sở kiểm tra điều kiện nghiệm thu, có thể yêu cầu thí nghiệm đối chứng hoặc kiểm định;
   - Sở ra thông báo (Phụ lục VIII) chấp thuận hoặc không chấp thuận, nêu tồn tại và công việc còn lại, trong 16 ngày làm việc (công trình cấp I trở lên) hoặc 12 ngày làm việc (cấp khác).
4. **Nghiệm thu có điều kiện hoặc từng phần** (khoản 2, 3 Điều 24): theo dõi việc khắc phục tồn tại, sau đó kiểm tra hoàn thành lần cuối.

---

## 3. Đối chiếu hiện trạng hệ thống

| Nội dung | Đã có | Thiếu / lệch luật |
| --- | --- | --- |
| Tiếp nhận và kiểm tra hợp lệ | Tạo lần nộp, tải tài liệu, OCR, thành phần hồ sơ | Không có bước "kiểm tra hợp lệ ≤05 ngày làm việc"; không có từ chối tiếp nhận; thành phần BCNCKT chưa theo khoản 2 Điều 35; chưa xác định thẩm quyền tự động |
| Bổ sung, tạm dừng | "Yêu cầu bổ sung" tạo lần nộp mới | Chưa phân biệt **Mẫu 15** (bổ sung ở bước tiếp nhận, 1 lần) và **Mẫu 16** (tạm dừng khi thẩm định, ≤1 lần); chưa tự dừng sau 20 ngày làm việc; SLA đang cộng dồn thời gian thay vì **tính lại từ đầu** |
| Nội dung thẩm định BCNCKT | Quy tắc chi phí, diện tích, bể PCCC, số học quy hoạch, pháp lý chuyển tiếp | Chưa có phiếu 4 nhóm nội dung theo Điều 38 (quy hoạch; đấu nối hạ tầng; QCVN/TCVN, an toàn, PCCC; tổng mức đầu tư theo NĐ 206) với kết luận từng nhóm |
| Kết quả thẩm định | Dự thảo thông báo, yêu cầu bổ sung, tạm dừng (A4) | Chưa theo 3 mức kết luận; thiếu vòng "đóng dấu sau chỉnh sửa" (điểm d khoản 8 Điều 36); chưa gửi cơ quan quản lý địa phương; chưa có danh mục lưu trữ |
| GPXD | 10 loại thủ tục, checklist, mẫu đơn, khung dự thảo GP | Chưa có các mốc 05/02/01 ngày làm việc; chưa có lấy ý kiến cơ quan (02 ngày làm việc, không trả lời coi là đồng ý); chưa có công khai GP, thu hồi/hủy; chưa sinh GP có đủ nội dung Điều 49 từ dữ liệu có cấu trúc |
| Hậu kiểm | Chưa có | Tiếp nhận thông báo khởi công và đối chiếu điều kiện miễn phép, quy hoạch, thiết kế đã thẩm định |
| Kiểm tra nghiệm thu | Kiểm tra hoàn thành (3 loại), lịch hiện trường, theo dõi khắc phục, Phụ lục VI/VIII | Chưa có **kiểm tra trong thi công** (kế hoạch 2–3 lần, thông báo ≤10 ngày làm việc); chưa có yêu cầu thí nghiệm đối chứng/kiểm định; chưa xác định đối tượng theo Phụ lục IX NĐ 207 và Phụ lục IV NĐ 217 |
| Liên thông, CSDL | Tham chiếu mã định danh trong checklist | Chưa có bộ dữ liệu xuất theo TT 39 và nhắc hạn 05 ngày làm việc; chưa kết nối DVC (đã ghi nhận là giai đoạn sau) |
| AI | Đề xuất có trích dẫn cho BCNCKT, trợ lý pháp luật (BM25, 7 nguồn), chọn trích đoạn theo ngân sách | Chưa có AI cho GPXD và nghiệm thu; chưa trích xuất chỉ tiêu quy hoạch từ bản vẽ; chưa tra cứu điều khoản QCVN; chưa soạn văn bản theo mẫu có trích dẫn; chưa có credential và OCR thật |
| Cấu hình | `sla.py` có căn cứ Điều 37/54/27 | `dien_bien.json` còn hạn GPXD 20 ngày; trạng thái SLA chưa có mốc con (hợp lệ 05 ngày, bổ sung 20 ngày, ý kiến 02 ngày) |

---

## 4. Thiết kế mục tiêu

### 4.1 Mô hình "thủ tục" thống nhất cho 3 công tác

Thêm lớp **quy trình thủ tục có phiên bản** (`ai/app/procedures/`). Mỗi thủ tục khai báo:

- **Giai đoạn:** tiếp nhận → kiểm tra hợp lệ → thẩm định/xem xét → lấy ý kiến → dự thảo → rà soát → ký ban hành → trả kết quả → hậu xử lý (đóng dấu, lưu trữ, CSDL, công khai).
- **Sự kiện pháp lý**, mỗi sự kiện có giới hạn số lần và văn bản mẫu: `request_supplement(form=15, max=1)`, `suspend(form=16, max=1)`, `reject_intake`, `stop_no_supplement(after=20wd)`, `extend(max=1)`, `consult(agency, 2wd, silent_consent)`.
- **Bộ đếm thời hạn nhiều lớp:** thời hạn tổng (tính lại từ đầu khi hồ sơ bổ sung được chấp nhận), thời hạn bước (05 ngày làm việc kiểm tra hợp lệ; 05/02/01 ngày làm việc của GPXD), hạn chờ người nộp (20 ngày làm việc hoặc 02 ngày làm việc).
- **Mẫu đầu ra:** Mẫu 03/15/16/14 (NĐ 217 Phụ lục I), Phụ lục II (GPXD), Phụ lục VIII (NĐ 207).
- **Căn cứ và phiên bản:** mỗi luồng gắn phiên bản quy trình NĐ 217/NĐ 207. Hồ sơ trước 01/7/2026 vẫn theo NĐ 175 như cơ chế chuyển tiếp hiện có.

`workflow.state` hiện có vẫn giữ vai trò nguồn trạng thái duy nhất. Các trạng thái được mở rộng theo giai đoạn trên và ánh xạ ngược cho dữ liệu cũ.

### 4.2 Thẩm quyền và đối tượng

Viết module `authority.py` đề xuất cơ quan có thẩm quyền từ dữ liệu dự án: nguồn vốn/loại dự án, nhóm, cấp công trình (TT 34), chuyên ngành, địa bàn/khu công nghiệp, cơ quan quyết định đầu tư, danh mục Phụ lục IV/IX.

- Kết quả hiển thị ngay khi tiếp nhận.
- Nếu không thuộc Sở: gợi ý văn bản từ chối tiếp nhận kèm căn cứ.
- Với dự án miễn phép: gợi ý luồng "thông báo khởi công".
- Chuyên viên luôn xác nhận; hệ thống không tự từ chối.

### 4.3 Phiếu thẩm định có cấu trúc

- **BCNCKT, 4 nhóm theo Điều 38:**
  1. Phù hợp quy hoạch (chức năng sử dụng đất, mật độ, hệ số sử dụng đất, tầng cao, chỉ giới, quy mô dân số; hoặc hướng tuyến với công trình theo tuyến).
  2. Văn bản thỏa thuận đấu nối hạ tầng.
  3. Danh mục QCVN/TCVN và kiểm tra tuân thủ, an toàn xây dựng, hồ sơ PCCC.
  4. Tổng mức đầu tư theo NĐ 206 (đầu tư công/PPP).

  Mỗi mục có: mức đáp ứng, bằng chứng (tài liệu, trang, trích đoạn), yêu cầu chỉnh sửa. Kết luận chung chọn 1 trong 3 mức.
- **GPXD:** các điều kiện Điều 44 Luật và Điều 50–52, giấy tờ đất Điều 55, và các trường dữ liệu để sinh GP theo Điều 49 (vị trí, cốt nền, chỉ giới, khoảng lùi, mật độ, hệ số sử dụng đất, chiều cao, số tầng, diện tích, màu sắc, thời hạn).
- **Nghiệm thu:** Điều 27 khoản 1 (tuân thủ quản lý chất lượng, an toàn từ khởi công đến hoàn thành; điều kiện nghiệm thu), thành phần ký biên bản (khoản 6 Điều 24), danh mục hồ sơ Phụ lục VII, yêu cầu thí nghiệm đối chứng/kiểm định.

### 4.4 AI hỗ trợ theo từng bước (chuyên viên luôn xác nhận)

| Bước | AI làm gì | Đầu ra cho chuyên viên | Kiểm soát |
| --- | --- | --- | --- |
| Tiếp nhận | Phân loại tệp vào đúng thành phần hồ sơ (Điều 35, 56–62; Phụ lục VII); OCR; trích thông tin Tờ trình Mẫu 01 hoặc Đơn Phụ lục II (tên dự án, nhóm, cấp, nguồn vốn, địa điểm, tổng mức đầu tư) | Bảng "đủ/thiếu/sai quy cách" và **dự thảo Phiếu Mẫu 15** hoặc thông báo bổ sung GPXD | Mỗi kết luận "thiếu" dẫn tới căn cứ; chuyên viên sửa trước khi phát hành |
| Thẩm quyền | Đề xuất cơ quan có thẩm quyền và thủ tục đúng (có/không phải thẩm định, miễn phép, đối tượng kiểm tra nghiệm thu) | Thẻ "Thẩm quyền: Sở XD — căn cứ Điều 32/53/26" hoặc gợi ý từ chối | Quy tắc tất định trước, AI chỉ giải thích; không tự từ chối |
| Quy hoạch | Trích chỉ tiêu từ thuyết minh, bản vẽ, quyết định quy hoạch; so sánh theo từng chỉ tiêu | Bảng so sánh "quy hoạch ↔ thiết kế" có trích dẫn trang | Số liệu phải có trích đoạn gốc; chuyên viên xác nhận từng dòng |
| QCVN/TCVN, PCCC | Truy hồi điều khoản QCVN phù hợp loại/cấp công trình (QCVN 01, 06, 10, BCA 10, 18); đối chiếu giải pháp thiết kế; kiểm tra danh mục tiêu chuẩn áp dụng | Danh sách "điều khoản cần kiểm tra + đoạn thiết kế liên quan + nhận xét" | Trích dẫn phải khớp đúng đoạn văn bản; không kết luận "đạt" thay chuyên viên |
| Chi phí | Kiểm tra cơ cấu tổng mức đầu tư, cộng dồn, tỷ lệ dự phòng và chi phí quản lý theo NĐ 206; đối chiếu đơn giá/định mức (TT 38/2026) nếu có | Danh sách sai lệch số học và khoản cần giải trình | Tính toán tất định, AI chỉ diễn giải |
| Thẩm tra | Kiểm tra báo cáo thẩm tra Mẫu 02 có đủ nội dung và năng lực cá nhân thẩm tra | Danh sách mục thiếu | Có căn cứ |
| GPXD | Kiểm tra giấy tờ đất; trích thông số bản vẽ (cốt, khoảng lùi, chiều cao, tầng) so với quy hoạch/quy chế kiến trúc; soạn thư bổ sung một lần | **Dự thảo GP** đủ trường Điều 49 và thư bổ sung | Trường thiếu nguồn để trống; không tự điền |
| Hậu kiểm khởi công | So sánh hồ sơ kèm thông báo khởi công với BCNCKT đã thẩm định (thông số chủ yếu) | Danh sách điểm lệch cần kiểm tra | Chỉ cảnh báo |
| Nghiệm thu | Rà soát chéo hồ sơ hoàn thành: đủ danh mục Phụ lục VII; logic ngày giữa nhật ký, thí nghiệm, biên bản nghiệm thu, khối lượng; thành phần ký; kết quả thí nghiệm ngoài ngưỡng | Danh sách tồn tại có dẫn chứng, **trọng tâm kiểm tra hiện trường**, dự thảo thông báo Phụ lục VIII | Chuyên viên xác nhận; ảnh hiện trường gắn vào phiếu |
| Soạn văn bản | Sinh Mẫu 03/15/16, GP, Phụ lục VIII từ phiếu đã xác nhận | Văn bản A4 có chú thích nguồn từng đoạn | Chỉ từ dữ liệu đã xác nhận; ghi provenance |
| Tra cứu pháp lý | Mở rộng trợ lý pháp luật: toàn bộ Luật 135, NĐ 217/207/206, TT 32/34/39, QCVN; có phiên bản và hiệu lực | Trả lời có trích dẫn, cảnh báo văn bản hết hiệu lực | Đo độ chính xác truy hồi trên bộ câu hỏi chuyên viên duyệt |

**Nguyên tắc AI (giữ nguyên và tăng cường):**
- Tài liệu nộp là dữ liệu không tin cậy (chống prompt injection).
- Mỗi đề xuất có nguồn tài liệu/trang/đoạn.
- Không tự phê duyệt; trường quan trọng chưa được xác nhận thì chặn hoàn tất.
- Ghi provenance (mô hình, phiên bản prompt/quy tắc/kho văn bản).
- Khi thiếu AI hoặc OCR, quy trình vẫn chạy bằng quy tắc.

---

## 5. Lộ trình triển khai

Thứ tự: **N0 → N1 → (N2 ∥ N3 ∥ N4) → N5 → N6**. N2, N3, N4 là ba phân hệ, làm song song được sau khi có khung N1.

### N0 — Chốt căn cứ nghiệp vụ (0,5–1 ngày làm việc; cần anh/chị cung cấp)

- Nhận từ anh/chị:
  - QĐ 48/2025/QĐ-UBND và quy chế/phân công của phòng Quản lý xây dựng;
  - quyết định công bố thủ tục hành chính của tỉnh cho 3 thủ tục;
  - quyết định phân cấp tiếp nhận thông báo khởi công và quản lý trật tự xây dựng;
  - mẫu văn bản nội bộ Sở đang dùng.
- Bổ sung vào kho: Phụ lục II, IV NĐ 217; văn bản phí thẩm định hiện hành.
- Viết `docs/NGHIEP_VU_SXD_DIEN_BIEN.md` (sơ đồ quy trình, vai trò, mốc thời hạn, mẫu) để chuyên viên duyệt trước khi mã hóa.
- **Gate:** chuyên viên xác nhận quy trình, bảng thời hạn SLA và danh sách mẫu.

### N1 — Khung thủ tục và SLA nhiều lớp (4–6 ngày)

- `ai/app/procedures/` khai báo 3 thủ tục (kèm các loại GPXD và dạng kiểm tra nghiệm thu) theo mục 4.1, có phiên bản NĐ 217/NĐ 207 và nhánh NĐ 175 cho hồ sơ chuyển tiếp.
- Sự kiện có giới hạn: bổ sung (1 lần), tạm dừng (≤1), gia hạn (1), tự dừng sau 20 ngày làm việc, từ chối tiếp nhận, lấy ý kiến 02 ngày làm việc (không trả lời coi là đồng ý).
- Sửa `sla.py`:
  - thời hạn tính **lại từ đầu** khi hồ sơ bổ sung được chấp nhận;
  - thêm mốc bước (kiểm tra hợp lệ 05 ngày làm việc; GPXD 05/03, 02, 01 ngày làm việc; hạn chờ người nộp);
  - cảnh báo khi còn ≤ N ngày;
  - sửa `dien_bien.json`.
- Module `authority.py` (mục 4.2) kèm test đầy đủ các nhánh Điều 32, 33, 53 NĐ 217 và Điều 26 NĐ 207.
- Chuyển đổi dữ liệu: ánh xạ `workflow.state` cũ sang giai đoạn mới; backfill có bản chụp trước khi ghi (như đợt SLA).
- **Gate:** unit test cho từng sự kiện, giới hạn số lần, SLA tính lại; E2E luồng tiếp nhận → bổ sung → thẩm định.

### N2 — Thẩm định BCNCKT (5–7 ngày)

- Thành phần hồ sơ theo khoản 2 Điều 35 (các điểm a–m), có điều kiện áp dụng (đầu tư công/PPP, sửa chữa, có vi phạm...).
- Phiếu 4 nhóm nội dung (mục 4.3) thay cho danh sách nhận xét rời. Gộp các quy tắc hiện có (chi phí, diện tích, PCCC, pháp lý) vào nhóm tương ứng.
- Kết luận 3 mức, vòng "đủ điều kiện sau chỉnh sửa → nộp đề nghị đóng dấu → kiểm tra → đóng dấu".
- Mẫu 03/15/16 đúng Phụ lục I; bản ghi đóng dấu Mẫu 14 (danh sách bản vẽ đã đóng dấu); danh mục lưu trữ theo khoản 9 Điều 36; gửi cơ quan quản lý xây dựng địa phương.
- AI: phân loại hồ sơ; trích Tờ trình Mẫu 01; bảng so sánh quy hoạch; truy hồi QCVN; rà báo cáo thẩm tra Mẫu 02; soạn Mẫu 03/15/16 có trích dẫn.
- **Gate:** 3 bộ hồ sơ mẫu (đủ điều kiện / sau chỉnh sửa / chưa đủ); chuyên viên duyệt văn bản đầu ra.

### N3 — Cấp giấy phép xây dựng (4–6 ngày)

- Mốc 05 (03), 02, 01 ngày làm việc; thông báo bổ sung 1 lần (nội dung sẵn để gửi thư/tin nhắn — chưa kết nối SMTP/SMS).
- Lấy ý kiến cơ quan liên quan: theo dõi 02 ngày làm việc, không trả lời coi là đồng ý (ghi căn cứ vào hồ sơ).
- Dữ liệu GP có cấu trúc (Điều 49); sinh GP theo mẫu Phụ lục II (mới, sửa chữa/cải tạo/di dời, có thời hạn), ghi điều chỉnh/gia hạn trên GP gốc; cấp lại, thu hồi, hủy (Điều 63–65); sổ công khai GP (Điều 66).
- Kiểm tra miễn phép (khoản 2 Điều 43 Luật): nếu thuộc diện miễn thì hướng sang "thông báo khởi công".
- AI: kiểm tra giấy tờ đất; trích thông số bản vẽ so với quy hoạch; dự thảo GP và thư bổ sung.
- **Gate:** E2E 10 loại thủ tục; GP A4 đủ trường; thời hạn các mốc đúng.

### N4 — Hậu kiểm và kiểm tra công tác nghiệm thu (5–7 ngày)

- **Thông báo khởi công:** tiếp nhận, đối chiếu 3 nội dung điểm c khoản 2 Điều 67; liên kết tới dự án và BCNCKT đã thẩm định; phát sinh kế hoạch kiểm tra.
- **Kiểm tra trong thi công:**
  - kế hoạch tối đa 2–3 lần theo cấp (lần thứ 3 trở lên chỉ khi có lý do: sự cố, nghiệm thu từng phần hoặc có điều kiện);
  - phiếu kiểm tra hiện trường có ảnh và vị trí;
  - thông báo kết quả ≤10 ngày làm việc.
- **Kiểm tra hoàn thành:** báo cáo Phụ lục VI và danh mục Phụ lục VII; yêu cầu thí nghiệm đối chứng/kiểm định (Điều 8 NĐ 207; TT 32); thông báo Phụ lục VIII (chấp thuận/không chấp thuận, tồn tại, công việc còn lại); 16/12 ngày làm việc.
- Nghiệm thu có điều kiện/từng phần: theo dõi khắc phục → kiểm tra hoàn thành cuối.
- Đối tượng kiểm tra theo Phụ lục IX NĐ 207 và Phụ lục IV NĐ 217.
- AI: rà soát chéo hồ sơ chất lượng (danh mục, logic ngày, thành phần ký, kết quả thí nghiệm); đề xuất trọng tâm kiểm tra hiện trường; dự thảo thông báo.
- **Gate:** E2E khởi công → 2 lần kiểm tra → hoàn thành có điều kiện → khắc phục → chấp thuận.

### N5 — AI thật, kho văn bản và đánh giá (5–8 ngày; cần credential)

- Cấu hình Vertex/OpenAI và Tesseract `vie+eng` (anh/chị cung cấp).
- Kho văn bản có phiên bản và hiệu lực: Luật 135, NĐ 217/207/206/212, TT 32/34/39, các QCVN, Phụ lục II/IV. Chia đoạn theo điều/khoản; đánh giá truy hồi trước khi quyết định dùng vector.
- Bộ nhãn chuyên viên: 20 tình huống mỗi thủ tục, cùng các trường tiền/diện tích/ngày/chỉ tiêu quy hoạch.
- Chỉ số đề xuất để chuyên viên chốt: 100% trích dẫn khớp nguồn; 0 kết luận không nguồn; độ chính xác trích xuất theo trường; tỷ lệ chuyên viên chấp nhận đề xuất.
- Theo dõi chi phí/token và hạn mức; khi AI lỗi thì vẫn chạy quy tắc.

### N6 — Liên thông dữ liệu, báo cáo và UAT (3–5 ngày)

- Xuất dữ liệu kết quả thủ tục theo TT 39 (nhắc hạn 05 ngày làm việc); chuẩn bị interface DVC (kết nối thật ở giai đoạn sau).
- Báo cáo định kỳ: số hồ sơ, đúng hạn/quá hạn, số lần bổ sung/tạm dừng, thời gian xử lý bình quân theo thủ tục và chuyên viên; báo cáo năm ngày 15/12 (khoản 10 Điều 73 NĐ 217).
- UAT với chuyên viên phòng Quản lý xây dựng theo 3 kịch bản thật đã ẩn danh; cập nhật runbook và hướng dẫn nghiệp vụ.

---

## 6. File dự kiến sửa/thêm

| Nhóm | Sửa | Thêm |
| --- | --- | --- |
| Khung thủ tục | `ai/app/workflow.py`, `domain.py`, `store.py`, `sla.py`, `routes/cases.py`, `knowledge-base/provinces/dien_bien.json` | `ai/app/procedures/{base,bcnckt,gpxd,inspection,start_notice}.py`, `ai/app/authority.py`, test tương ứng, migration mở rộng projection |
| BCNCKT | `rules.py`, `legal.py`, `draft_templates.py`, `reporting.py`, `AppraisalWorkspace.tsx` | Phiếu 4 nhóm (`appraisal_review.py`), mẫu 03/15/16/14, `components/appraisal/ReviewSheet.tsx` |
| GPXD | `procedure_review.py`, `procedure_rules.py`, `procedure_templates.py`, `SubmissionWorkspace.tsx` | `permit_document.py` (GP theo Phụ lục II), sổ công khai GP, luồng lấy ý kiến |
| Hậu kiểm, nghiệm thu | `procedure_rules.py` (inspection), `WorkflowPanel.tsx` | `start_notices.py`, `site_inspections.py`, `components/appraisal/InspectionPlan.tsx`, phiếu hiện trường có ảnh |
| AI | `provider.py`, `evidence_selection.py`, `legal_assistant.py`, `ingestion.py` | `ai/app/ai/{classify,extract_planning,qcvn_retrieval,drafting,quality_crosscheck}.py`, bộ đánh giá `ai/evaluation/*` |
| Văn bản | `01_phap_ly_quy_chuan/` | Phụ lục II, IV NĐ 217; manifest phiên bản/hiệu lực |
| Tài liệu | `docs/RUNBOOK_*`, `CLAUDE.md` (nếu cần) | `docs/NGHIEP_VU_SXD_DIEN_BIEN.md`, hướng dẫn sử dụng cho chuyên viên |

---

## 7. Kiểm thử

| Nhóm | Tình huống | Tiêu chí |
| --- | --- | --- |
| Thẩm quyền | Mọi nhánh Điều 32–33, 53 NĐ 217; Điều 26 NĐ 207; dự án xã, khu công nghiệp, liên tỉnh, cấp đặc biệt, miễn phép | Đề xuất đúng cơ quan và căn cứ; không tự từ chối |
| Thời hạn | Kiểm tra hợp lệ 05 ngày làm việc; bổ sung 1 lần; tạm dừng ≤1; 20 ngày làm việc không bổ sung; tính lại từ đầu; gia hạn 1 lần; các mốc GPXD 05/02/01; ý kiến cơ quan 02 ngày; kiểm tra thi công ≤2/3 lần; 10 và 16/12 ngày làm việc | Đúng từng mốc theo lịch làm việc; chặn lần vượt giới hạn |
| Hồ sơ | Đủ, thiếu, sai quy cách theo từng thủ tục | Phiếu Mẫu 15 / thông báo bổ sung đúng mục thiếu |
| Văn bản | Mẫu 03, 15, 16, 14, GP Phụ lục II, Phụ lục VIII | Đúng mẫu, A4, lề chuẩn, dữ liệu từ phiếu đã xác nhận |
| AI | Trích dẫn giả, prompt injection, bản scan, số liệu mâu thuẫn, quy hoạch không khớp | 0 kết luận không nguồn; các mâu thuẫn được nêu |
| Chuyển tiếp | Hồ sơ nộp trước và sau 01/7/2026 | Áp NĐ 175 hoặc NĐ 217 đúng khoản 2 Điều 76 |
| E2E | 3 luồng đầy đủ theo vai trò chuyên viên → trưởng phòng → lãnh đạo | Đạt trên demo và cloud staging |

---

## 8. Rủi ro và điểm cần anh/chị quyết định

1. **Quy trình nội bộ Sở:** kế hoạch dựa trên luật. Cần QĐ 48/2025 và quy trình nội bộ (ISO/quyết định công bố thủ tục hành chính của tỉnh) để khớp bước rà soát, ký và vai trò của Văn phòng/Một cửa.
2. **Phạm vi "hậu kiểm":** tôi hiểu gồm (a) tiếp nhận thông báo khởi công và hậu kiểm công trình miễn phép hoặc đã thẩm định, và (b) kiểm tra công tác nghiệm thu trong thi công và khi hoàn thành. Nếu Sở còn giao kiểm tra sau cấp phép hoặc trật tự xây dựng, cần bổ sung phạm vi.
3. **Mức độ AI:** đề xuất bắt đầu với các việc giảm tải rõ và dễ kiểm chứng (phân loại hồ sơ, bảng thiếu, so sánh chỉ tiêu, soạn văn bản), sau đó mới đến truy hồi QCVN (cần kho văn bản chuẩn và đánh giá).
4. **Credential AI, OCR và kết nối DVC** là điều kiện của N5–N6.
5. **Số ngày, mẫu biểu** tiếp tục để chuyên viên xác nhận (như bảng SLA hiện tại).

---

## 9. Ước lượng

| Giai đoạn | Ngày công |
| --- | --- |
| N0 Chốt căn cứ nghiệp vụ | 0,5–1 (+ thời gian chờ tài liệu) |
| N1 Khung thủ tục và SLA nhiều lớp | 4–6 |
| N2 Thẩm định BCNCKT | 5–7 |
| N3 Cấp GPXD | 4–6 |
| N4 Hậu kiểm và nghiệm thu | 5–7 |
| N5 AI thật, kho văn bản, đánh giá | 5–8 (+ chờ credential, nhãn) |
| N6 Liên thông, báo cáo, UAT | 3–5 |
| **Tổng** | **26,5–40 ngày công** |

Mốc đề xuất:
- **N0 + N1:** hệ thống chạy đúng trình tự và thời hạn pháp lý.
- **N2–N4:** đủ 3 phân hệ.
- **N5–N6:** AI thật và nghiệm thu với chuyên viên.

**Dừng theo Plan-First của CLAUDE.md. Chờ tin nhắn phê duyệt trực tiếp của người dùng trước khi triển khai.**
