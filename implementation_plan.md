# Kế hoạch Triển khai: Bổ sung Bộ Dữ liệu Mẫu Thẩm định Chuyên sâu cho các Dự án Mẫu
*(Dự án Xây dựng Nền tảng Thẩm định Xây dựng AI — Sở Xây dựng Tỉnh Điện Biên)*

---

## 🎯 1. Mục tiêu & Bối cảnh Nghiệp vụ

Hiện nay, hệ thống đã xây dựng khung giao diện SlidePanel đa tab rất hoàn chỉnh, tuy nhiên nội dung trong các tab nghiệp vụ thẩm định (`2. Thẩm định BCNCKT`, `3. Cấp Giấy phép XD`, `4. Hậu kiểm & Nghiệm thu`, `6. Nhật ký AI Audit`) đang sử dụng dữ liệu hardcoded mẫu của dự án y tế (Bệnh viện Mường Ảng). Khi người dùng click xem các dự án khác (như *Tuyến đường giao thông Tây Trang*, *Khách sạn Mường Lay Plaza*, *Trường học dân tộc nội trú Điện Biên Đông*, *Khu nhà ở Him Lam*, *Cụm công nghiệp Pú Yên*), nội dung thẩm định vẫn hiển thị thông tin bệnh viện.

**Mục tiêu kế hoạch:**
- Xây dựng bộ dữ liệu mẫu thẩm định chuyên sâu chuẩn hóa theo quy chuẩn chuyên ngành cho **toàn bộ 6 dự án mẫu đại diện** thuộc các lĩnh vực hạ tầng, dân dụng, công nghiệp trọng điểm của tỉnh Điện Biên.
- Tuân thủ nghiêm ngặt các quy định pháp luật hiện hành và sắp ban hành:
  - **Luật Xây dựng số 135/2025/QH15** & **Luật sửa đổi 2026**.
  - **Nghị định số 217/2026/NĐ-CP** về quản lý dự án đầu tư xây dựng (thay thế NĐ 15/2021).
  - **Nghị định số 206/2026/NĐ-CP** về quản lý chi phí đầu tư xây dựng (thay thế NĐ 10/2021).
  - **Thông tư số 39/2026/TT-BXD** về cơ sở dữ liệu hồ sơ dự án quốc gia.
  - **QCVN 01:2021/BXD** (Quy hoạch xây dựng), **QCVN 06:2022/BXD & Sửa đổi 1:2023** (An toàn cháy cho nhà và công trình).
  - **TCVN 2737:2023** (Tải trọng và tác động - vùng gió & động đất Điện Biên cấp VII).
  - **Nghị định 30/2020/NĐ-CP** về thể thức văn bản hành chính nhà nước.

---

## 🏛️ 2. Danh mục 6 Dự án Mẫu & Đặc thù Dữ liệu Thẩm định Chuyên ngành

| STT | Mã Dự Án | Tên Dự Án Mẫu | Phân loại & Cấp | TMĐT (VNĐ) | Trọng tâm Thẩm định Chuyên ngành |
|:---:|:---|:---|:---:|:---:|:---|
| **1** | `DA-2026-DB-0182` | **Xây dựng Bệnh viện Đa khoa Khu vực Mường Ảng quy mô 200 giường** | Y tế công cộng<br>Nhóm B • Cấp II | 385.000.000.000 | - Quy chuẩn an toàn sinh học y tế, hành lang vô trùng.<br>- PCCC buồng đệm thang thoát nạn N1/N2, hệ thống oxy trung tâm.<br>- Cắt giảm TMĐT thiết bị y sinh học và móng cọc khoan nhồi. |
| **2** | `DA-2026-DB-0183` | **Nâng cấp, mở rộng Tuyến đường nối TP. Điện Biên Phủ đi Cửa khẩu Quốc tế Tây Trang** | Giao thông đường bộ<br>Nhóm A • Cấp I | 1.250.000.000.000 | - Tiêu chuẩn đường cấp III miền núi (TCVN 4054:2005), bán kính đường cong.<br>- Kết cấu áo đường mềm, mô đun đàn hồi Eyc ≥ 140 MPa.<br>- Gia cố mái taluy chống trượt lở đèo dốc sương mù, thoát nước địa hình karst.<br>- Dự toán bồi thường GPMB và hoàn trả mặt bằng quốc phòng biên giới. |
| **3** | `DA-2026-DB-0184` | **Khu Trung tâm Thương mại, Dịch vụ & Khách sạn Quốc tế Mường Lay Plaza** | Dân dụng thương mại<br>Nhóm B • Cấp II | 420.000.000.000 | - Mật độ xây dựng 60%, tầng cao 12 tầng + 1 bán hầm view hồ Thủy điện Mường Lay.<br>- Khẩu độ dầm chuyển nhịp lớn tầng lửng thương mại, tầng lánh nạn PCCC.<br>- Thỏa thuận tĩnh không và an toàn hành lang bảo vệ lòng hồ thủy điện. |
| **4** | `DA-2026-DB-0185` | **Xây dựng Trường Phổ thông Dân tộc Nội trú THCS & THPT Huyện Điện Biên Đông** | Giáo dục vùng cao<br>Nhóm C • Cấp III | 95.000.000.000 | - TCVN 8793:2011 (Trường phổ thông), diện tích sàn 4.5m²/học sinh.<br>- Bậc chịu lửa Bậc II, chống rét mùa đông, bếp ăn tập thể 1 chiều.<br>- Tiết giảm chi phí gói thầu san nền tạo mặt bằng đồi dốc. |
| **5** | `DA-2026-DB-0186` | **Khu Nhà ở Cán bộ Công chức & Công viên Thể thao Him Lam - TP. Điện Biên Phủ** | Khu đô thị & Nhà ở<br>Nhóm B • Cấp II | 260.000.000.000 | - Đồ án quy hoạch 1/500 chi tiết khu Him Lam, chỉ giới xây dựng lùi 4m.<br>- Tỷ lệ đất cây xanh thể thao ≥ 25%, bãi đỗ xe thông minh tập trung.<br>- Đấu nối hạ tầng giao thông đô thị và cấp điện ngầm hóa. |
| **6** | `DA-2026-DB-0187` | **Hệ thống Cấp nước sinh hoạt & Thoát nước thải Cụm Công nghiệp Pú Yên - Tuần Giáo** | Hạ tầng Kỹ thuật<br>Nhóm B • Cấp III | 180.000.000.000 | - Công suất trạm xử lý nước cấp 5.000 m³/ngđ, trạm XLNT tập trung 2.500 m³/ngđ.<br>- Tiêu chuẩn nước xả thải Cột A QCVN 40:2011/BTNMT.<br>- Hồ điều hòa sự cố sinh học, quan trắc môi trường tự động truyền về Sở TN&MT. |

---

## 🏗️ 3. Thiết kế Kiến trúc Dữ liệu (Data Model)

Tạo file mới `src/data/mockAppraisalData.ts` độc lập và liên kết với `mockData.ts` thông qua `projectId`:

```typescript
// 1. Dữ liệu Thẩm định BCNCKT
export interface AppraisalBCNCKTData {
  complianceChecklist: {
    category: string;
    item: string;
    standardRequired: string;
    designApplied: string;
    aiVerdict: 'dat' | 'khong_dat' | 'can_luu_y';
    aiNotes: string;
  }[];
  planningMetrics: {
    density: { value: string; limit: string; isPassed: boolean };
    buildingHeight: { value: string; limit: string; isPassed: boolean };
    far: { value: string; limit: string; isPassed: boolean }; // Hệ số sử dụng đất
    setbackDistance: { value: string; limit: string; isPassed: boolean };
    landscapeRatio?: { value: string; limit: string; isPassed: boolean };
    parkingSlots?: { value: string; limit: string; isPassed: boolean };
  };
  fireSafety: {
    agreementNumber: string;
    agreementDate: string;
    agreementAgency: string; // Phòng Cảnh sát PCCC & CNCH - CA tỉnh Điện Biên
    fireResistanceGrade: string; // Bậc chịu lửa
    evacuationDistance: string; // Khoảng cách thoát nạn
    evacuationExits: string; // Lối thoát nạn
    fireAccessRoad: string; // Đường cho xe chữa cháy
    waterSource: string; // Bể nước ngầm / trụ tiếp nước
  };
  costEvaluation: {
    originalTotal: number; // TMĐT CĐT trình ban đầu
    appraisedTotal: number; // TMĐT sau thẩm định
    savingsAmount: number; // Số tiền tiết kiệm ngân sách
    breakdownItems: {
      name: string;
      originalValue: number;
      appraisedValue: number;
      difference: number;
      reason: string; // Lý do điều chỉnh: áp sai định mức, khối lượng trùng lặp...
    }[];
  };
  sample03Notice: {
    docNumber: string; // Số công văn: VD "182/SXD-QLXD"
    docDate: string;
    signerName: string; // "Nguyễn Văn Hùng"
    signerTitle: string; // "Phó Giám đốc Sở"
    evaluationSummary: string;
    conclusion: string; // "Đủ điều kiện phê duyệt" / "Yêu cầu chỉnh sửa hoàn thiện"
  };
}

// 2. Dữ liệu Cấp Giấy phép Xây dựng (GPXD)
export interface PermitLicensingData {
  status: 'da_cap' | 'dang_tham_tra' | 'cho_bo_sung' | 'mien_gpxd';
  permitNumber?: string; // "45/GPXD-SXD"
  permitDate?: string;
  checklistDocs: {
    name: string;
    code: string;
    status: 'hop_le' | 'thieu' | 'khong_hop_le';
    note: string;
  }[];
  technicalConditions: {
    allowedGroundArea: string;
    allowedTotalFloorArea: string;
    allowedStories: string;
    allowedHeight: string;
    specialRequirements: string[];
  };
}

// 3. Dữ liệu Hậu kiểm & Nghiệm thu Công trình
export interface InspectionAcceptanceData {
  groundBreakingConditions: {
    item: string;
    status: 'dat' | 'chua_dat';
    verifyDate: string;
  }[];
  phaseInspections: {
    phaseName: string; // "Phần móng ngầm", "Kết cấu thân", "Hoàn thiện & PCCC"
    inspectDate: string;
    inspectTeam: string; // Sở Xây dựng phối hợp Chủ đầu tư & Tư vấn giám sát
    verdict: 'chap_thuan' | 'yeu_cau_khac_phuc';
    findings: string;
  }[];
  finalAcceptanceNotice?: {
    noticeNumber: string; // "88/TB-SXD" Thông báo kết quả kiểm tra công tác nghiệm thu
    issueDate: string;
    result: 'chap_thuan_dua_vao_su_dung' | 'chua_chap_thuan';
    recommendations: string[];
  };
}

// 4. Dữ liệu Nhật ký Giải trình AI (AI Audit Trail)
export interface AiAuditLogEntry {
  timestamp: string;
  actor: string; // "Hệ thống AI Compliance", "Chuyên viên thụ lý", "Lãnh đạo Sở"
  action: string;
  details: string;
  ruleCitation?: string; // Điều khoản pháp luật / QCVN trích dẫn
  severity: 'info' | 'warning' | 'success' | 'action_required';
}
```

---

## 📂 4. Danh sách File Cần Tạo Mới & Chỉnh Sửa

| Tác vụ | Đường dẫn File | Nội dung thực hiện |
|:---|:---|:---|
| **Tạo mới** | `src/data/mockAppraisalData.ts` | Khởi tạo đầy đủ bộ dữ liệu thẩm định 4 phân hệ cho cả 6 dự án mẫu, viết hàm helper `getProjectAppraisalData(projectId)`. |
| **Chỉnh sửa** | `src/pages/projects/ProjectDetailSlidePanel.tsx` | Thay thế các đoạn dữ liệu hardcoded trong: <br>• Subtab `compliance` (Bảng rà soát quy chuẩn theo dự án)<br>• Subtab `planning` (Chỉ tiêu quy hoạch theo dự án)<br>• Subtab `fire` (Thông số PCCC & công văn theo dự án)<br>• Subtab `cost` (Bảng 6 khoản mục bóc tách & mức tiết kiệm theo dự án)<br>• Subtab `preview_a4` (Văn bản Mẫu 03 khổ A4 cá nhân hóa theo từng dự án)<br>• Tab `gpxd` (Hồ sơ pháp lý & giấy phép xây dựng tương ứng)<br>• Tab `nghiem_thu` (Biên bản nghiệm thu & kiểm tra hiện trường)<br>• Tab `audit` (Lịch sử giải trình AI gắn liền hồ sơ). |
| **Chỉnh sửa** | `src/data/mockData.ts` | Tinh chỉnh thông số `estimatedSavings`, `stage`, `slaStatus` khớp 100% với dữ liệu chi tiết. |

---

## 🧪 5. Kế hoạch Kiểm thử & Tiêu chuẩn Nghiệm thu

1. **Kiểm thử Chuyển đổi Dự án linh hoạt (Multi-Project Verification):**
   - Click lần lượt từng dự án từ DA-0182 đến DA-0187.
   - Xác nhận: Dữ liệu thẩm định của Dự án Đường giao thông phản ánh đúng tiêu chuẩn cầu đường, áo đường, mái dốc; Dự án Khách sạn phản ánh đúng tầng hầm, mật độ, tĩnh không; Dự án Cụm CN phản ánh đúng công suất nước thải, hồ sinh học.
2. **Kiểm thử Dự thảo Mẫu số 03 (Khổ A4 Chuẩn NĐ 30/2020):**
   - Bấm nút *"Dự thảo Mẫu 03 (Khổ A4)"* trên từng dự án: Tiêu đề, số hiệu công văn, tên dự án, số tiền TMĐT thẩm định và nội dung đánh giá hiển thị đúng A4 cố định (210 × 297mm), không tràn mép.
3. **Kiểm thử Kiểm soát Chi phí Thẩm định TMĐT (Cost Savings):**
   - Bảng so sánh trước và sau thẩm định hiển thị rõ số tiền tiết kiệm được tính bằng `NumberInput` / format tiền tệ VNĐ và lý do cắt giảm thuyết phục.
4. **Kiểm thử Giao diện (Dark / Light Theme & Responsive):**
   - Đảm bảo các bảng dữ liệu, badge trạng thái, card chỉ tiêu đều tương thích hoàn hảo Dark Mode và Light Mode.
5. **Kiểm thử Biên dịch:**
   - Chạy `pnpm build` đạt kết quả 0 lỗi (`exit code 0`).

---

## 🛑 BÁO CÁO REVIEW
> Bản kế hoạch trên đã được chuẩn hóa chi tiết theo quy trình thẩm định thực tế của Sở Xây dựng tỉnh Điện Biên.
> Theo quy tắc **Plan-First Protocol**, Agent đã dừng lại ở bước này và **chờ lệnh xác nhận trực tiếp từ bạn qua tin nhắn** để tiến hành triển khai viết code.
