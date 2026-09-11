"""Compliance AI Service for checking Vietnam Construction Standards."""

import logging
from src.compliance_ai.models import (
    ComplianceCheckRequest,
    ComplianceCheckResult,
    ComplianceIssue,
    SeverityLevel,
)

logger = logging.getLogger(__name__)


class ComplianceAIService:
    """Core rule-checking engine for QCVN 01:2021/BXD, QCVN 06:2022/BXD and TCVN."""

    def evaluate(self, req: ComplianceCheckRequest) -> ComplianceCheckResult:
        issues: list[ComplianceIssue] = []
        total_checks = 0

        # --- 1. KIỂM TRA MẬT ĐỘ XÂY DỰNG THEO QCVN 01:2021/BXD (Bảng 2.8) ---
        total_checks += 1
        footprint = req.building_footprint_area
        site_area = req.site_area
        actual_density = (footprint / site_area) * 100 if site_area > 0 else 0

        # Xác định mật độ tối đa cho phép theo diện tích lô đất
        if site_area <= 500:
            max_density = 100.0
        elif site_area <= 1000:
            max_density = 85.0 - (actual_density * 0.01)
            max_density = 80.0
        elif site_area <= 2000:
            max_density = 70.0
        elif site_area <= 3000:
            max_density = 60.0
        elif site_area <= 5000:
            max_density = 50.0
        else:
            max_density = 40.0

        if actual_density > max_density:
            issues.append(
                ComplianceIssue(
                    rule_id="QCVN01_DENSITY",
                    standard="QCVN 01:2021/BXD",
                    article="Mục 2.6.3, Bảng 2.8",
                    severity=SeverityLevel.ERROR,
                    title="Vượt mật độ xây dựng thuần tối đa cho phép",
                    description=f"Mật độ xây dựng thiết kế ({actual_density:.1f}%) vượt quá ngưỡng tối đa theo quy chuẩn quy hoạch ({max_density:.1f}%).",
                    found_value=f"{actual_density:.1f}% ({footprint:,.0f} m2 / {site_area:,.0f} m2)",
                    allowed_value=f"≤ {max_density:.1f}%",
                    recommendation="Cần giảm diện tích chiếm đất tầng 1 hoặc mở rộng ranh giới lô đất quy hoạch để đảm bảo khoảng cây xanh, sân đường nội bộ.",
                )
            )

        # --- 2. KIỂM TRA KHOẢNG LÙI CÔNG TRÌNH (QCVN 01:2021/BXD Bảng 2.7) ---
        total_checks += 1
        height = req.building_height
        road_w = req.road_width
        setback = req.setback_distance

        # Xác định khoảng lùi tối thiểu
        if height <= 19:
            min_setback = 0.0 if road_w >= 19 else 3.0
        elif height <= 22:
            min_setback = 3.0 if road_w >= 22 else 4.0
        elif height <= 28:
            min_setback = 4.0 if road_w >= 28 else 6.0
        else:
            min_setback = 6.0

        if setback < min_setback:
            issues.append(
                ComplianceIssue(
                    rule_id="QCVN01_SETBACK",
                    standard="QCVN 01:2021/BXD",
                    article="Mục 2.6.2, Bảng 2.7",
                    severity=SeverityLevel.ERROR,
                    title="Khoảng lùi xây dựng không đảm bảo quy định",
                    description=f"Công trình cao {height:.1f}m tiếp giáp lộ giới {road_w:.1f}m yêu cầu khoảng lùi tối thiểu {min_setback:.1f}m, thiết kế chỉ đạt {setback:.1f}m.",
                    found_value=f"{setback:.1f} m",
                    allowed_value=f"≥ {min_setback:.1f} m",
                    recommendation="Dịch chuyển chỉ giới xây dựng lùi sâu vào trong khuôn viên đất để tuân thủ chỉ giới đường đỏ và an toàn tầm nhìn đô thị.",
                )
            )

        # --- 3. KIỂM TRA PCCC - KHOẢNG CÁCH THOÁT NẠN (QCVN 06:2022/BXD) ---
        total_checks += 1
        max_dist = req.max_exit_distance
        allowed_exit_dist = 25.0 if "EDUCATION" in req.building_type else 30.0

        if max_dist > allowed_exit_dist:
            issues.append(
                ComplianceIssue(
                    rule_id="QCVN06_EXIT_DISTANCE",
                    standard="QCVN 06:2022/BXD",
                    article="Mục 3.2.4 & Phụ lục G",
                    severity=SeverityLevel.ERROR,
                    title="Khoảng cách di chuyển thoát nạn vượt quy chuẩn",
                    description=f"Khoảng cách từ điểm xa nhất của phòng đến lối ra thoát nạn ({max_dist:.1f}m) vượt ngưỡng an toàn tối đa ({allowed_exit_dist:.1f}m).",
                    found_value=f"{max_dist:.1f} m",
                    allowed_value=f"≤ {allowed_exit_dist:.1f} m",
                    recommendation="Bố trí thêm thang bộ thoát nạn ngoài trời hoặc chia ngăn hành lang thoát hiểm để rút ngắn cự ly di chuyển khi có hỏa hoạn.",
                )
            )

        # --- 4. KIỂM TRA BỀ RỘNG VẾ THANG BỘ THOÁT NẠN (QCVN 06:2022/BXD) ---
        total_checks += 1
        stair_w = req.stair_width
        min_stair_w = 1.35 if "EDUCATION" in req.building_type or "HOSPITAL" in req.building_type else 1.20

        if stair_w < min_stair_w:
            issues.append(
                ComplianceIssue(
                    rule_id="QCVN06_STAIR_WIDTH",
                    standard="QCVN 06:2022/BXD",
                    article="Mục 3.4.1",
                    severity=SeverityLevel.ERROR,
                    title="Bề rộng vế thang bộ thoát nạn không đủ kích thước",
                    description=f"Đối với công trình công cộng/trường học, bề rộng vế thang bộ thoát nạn phải đạt tối thiểu {min_stair_w:.2f}m. Thiết kế hiện tại là {stair_w:.2f}m.",
                    found_value=f"{stair_w:.2f} m",
                    allowed_value=f"≥ {min_stair_w:.2f} m",
                    recommendation="Điều chỉnh tăng bề rộng vế thang và chiếu nghỉ thang bộ để đáp ứng lưu lượng thoát nạn khẩn cấp.",
                )
            )

        # --- 5. KIỂM TRA GIỚI HẠN TẦNG THEO BẬC CHỊU LỬA (QCVN 06:2022/BXD) ---
        total_checks += 1
        rating = req.fire_resistance_rating
        floors = req.number_of_floors

        if rating == "BAC_III" and floors > 3:
            issues.append(
                ComplianceIssue(
                    rule_id="QCVN06_FIRE_RATING_FLOORS",
                    standard="QCVN 06:2022/BXD",
                    article="Bảng H.4",
                    severity=SeverityLevel.ERROR,
                    title="Số tầng vượt giới hạn cho phép của bậc chịu lửa",
                    description=f"Công trình bậc chịu lửa Bậc III chỉ được xây dựng tối đa 3 tầng. Hồ sơ thiết kế {floors} tầng.",
                    found_value=f"{floors} tầng (Bậc III)",
                    allowed_value="≤ 3 tầng đối với Bậc chịu lửa III",
                    recommendation="Nâng bậc chịu lửa công trình lên Bậc II (bọc bảo vệ kết cấu thép, tăng chiều dày lớp bê tông bảo vệ cốt thép).",
                )
            )
        elif rating == "BAC_II" and floors > 9 and "EDUCATION" in req.building_type:
            issues.append(
                ComplianceIssue(
                    rule_id="QCVN06_EDU_HEIGHT_LIMIT",
                    standard="QCVN 06:2022/BXD",
                    article="Mục A.2.3",
                    severity=SeverityLevel.WARNING,
                    title="Chiều cao trường học tiệm cận giới hạn đặc biệt",
                    description=f"Công trình giáo dục {floors} tầng cần có giải pháp chữa cháy tự động Sprinkler và hệ thống điều áp buồng thang N1.",
                    found_value=f"{floors} tầng",
                    allowed_value="Khuyến nghị ≤ 5 tầng cho cấp Tiểu học",
                    recommendation="Bổ sung văn bản thỏa thuận thiết kế PCCC chuyên ngành từ Phòng Cảnh sát PCCC & CNCH Công an tỉnh Điện Biên.",
                )
            )

        # --- 6. KIỂM TRA ĐẶC THÙ ĐỊA HÌNH & KHÁNG CHẤN ĐIỆN BIÊN (TCVN 9386:2012 & TCVN 2737:2023) ---
        total_checks += 1
        if height > 15 and req.construction_grade in ["GRADE_I", "GRADE_II"]:
            issues.append(
                ComplianceIssue(
                    rule_id="TCVN9386_EARTHQUAKE_DIEN_BIEN",
                    standard="TCVN 9386:2012 & QCVN 02:2022/BXD",
                    article="Phụ lục Bản đồ phân vùng gia tốc nền",
                    severity=SeverityLevel.INFO,
                    title="Yêu cầu kiểm tra kháng chấn khu vực đứt gãy Điện Biên",
                    description="Tỉnh Điện Biên nằm trên đới đứt gãy hoạt động, cấp động đất thiết kế cấp VII - VIII (agR = 0.138g). Thiết kế kết cấu cần có thuyết minh tính toán tải trọng động đất.",
                    found_value="Vùng chấn động agR = 0.138g",
                    allowed_value="Bắt buộc tính toán tải trọng động đất",
                    recommendation="Đính kèm bảng xuất nội lực và kiểm tra chuyển vị đỉnh công trình theo mô hình phân tích phổ phản ứng dao động.",
                )
            )

        violations = [i for i in issues if i.severity == SeverityLevel.ERROR]
        warnings = [i for i in issues if i.severity == SeverityLevel.WARNING]
        passed = total_checks - len(violations)
        score = max(0.0, round((passed / total_checks) * 100.0, 1))
        is_compliant = len(violations) == 0

        if is_compliant:
            summary = (
                f"Hồ sơ thiết kế cơ sở dự án '{req.project_name}' đáp ứng đầy đủ các chỉ tiêu quy hoạch "
                "(QCVN 01:2021/BXD) và giải pháp an toàn phòng cháy chữa cháy (QCVN 06:2022/BXD). "
                "Đủ điều kiện kết luận Đạt về mặt quy chuẩn kỹ thuật."
            )
        else:
            summary = (
                f"Phát hiện {len(violations)} lỗi vi phạm quy chuẩn bắt buộc và {len(warnings)} cảnh báo kỹ thuật. "
                "Chuyên viên thẩm định cần yêu cầu Chủ đầu tư phối hợp đơn vị tư vấn thiết kế chỉnh sửa bổ sung "
                "trước khi phát hành Thông báo kết quả thẩm định."
            )

        return ComplianceCheckResult(
            dossier_id=req.dossier_id,
            project_name=req.project_name,
            is_compliant=is_compliant,
            total_checks=total_checks,
            passed_checks=passed,
            violations_count=len(violations),
            warnings_count=len(warnings),
            compliance_score=score,
            issues=issues,
            summary_assessment=summary,
        )


compliance_ai_service = ComplianceAIService()
