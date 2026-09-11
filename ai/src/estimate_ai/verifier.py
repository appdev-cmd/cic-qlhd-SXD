"""Estimate AI verifier engine according to Decree 10/2021 and Circular 12/2021."""

import logging
from src.estimate_ai.models import (
    CostAnomalySeverity,
    EstimateAnomaly,
    EstimateVerifyRequest,
    EstimateVerifyResult,
)

logger = logging.getLogger(__name__)


class EstimateVerifier:
    """Verifies construction cost estimates, benchmarks quotas, and checks TMĐT balance."""

    def verify(self, req: EstimateVerifyRequest) -> EstimateVerifyResult:
        g_xd = req.construction_cost
        g_tb = req.equipment_cost
        g_qlda = req.management_cost
        g_tv = req.consulting_cost
        g_k = req.other_cost
        g_dp = req.contingency_cost

        sum_calculated = g_xd + g_tb + g_qlda + g_tv + g_k + g_dp
        sum_submitted = req.total_investment_submitted
        diff = sum_calculated - sum_submitted
        is_balanced = abs(diff) < 1000.0  # Chấp nhận sai số làm tròn nhỏ dưới 1.000 đ

        base_cost = g_xd + g_tb
        if base_cost <= 0:
            base_cost = 1.0

        anomalies: list[EstimateAnomaly] = []

        # 1. Kiểm tra cân đối tổng mức đầu tư
        if not is_balanced:
            anomalies.append(
                EstimateAnomaly(
                    cost_item="Tổng mức đầu tư (Cân đối số học)",
                    severity=CostAnomalySeverity.ERROR,
                    submitted_amount=sum_submitted,
                    benchmark_amount=sum_calculated,
                    deviation_percent=round((diff / sum_submitted) * 100.0, 2),
                    regulation_basis="Khoản 2 Điều 5 Nghị định 10/2021/NĐ-CP",
                    message=f"Tổng số tiền các khoản mục ({sum_calculated:,.0f} đ) lệch so với TMĐT trình ({sum_submitted:,.0f} đ) là {abs(diff):,.0f} đ.",
                    recommendation="Kiểm tra lại bảng tổng hợp dự toán, loại bỏ các sai số số học hoặc công thức liên kết giữa các sheet chi phí.",
                )
            )

        # 2. Rà soát tỷ lệ Chi phí Quản lý dự án (TT 12/2021/TT-BXD Bảng 1.1)
        management_ratio = (g_qlda / base_cost) * 100.0
        # Định mức tham chiếu gần đúng cho công trình dân dụng: <=10 tỷ: 3.2%, <=50 tỷ: 2.5%, <=100 tỷ: 2.1%
        if base_cost <= 10_000_000_000:
            benchmark_qlda_ratio = 3.28
        elif base_cost <= 50_000_000_000:
            benchmark_qlda_ratio = 2.56
        elif base_cost <= 100_000_000_000:
            benchmark_qlda_ratio = 2.14
        else:
            benchmark_qlda_ratio = 1.85

        benchmark_qlda_amount = base_cost * (benchmark_qlda_ratio / 100.0)
        if management_ratio > (benchmark_qlda_ratio * 1.15):
            excess = g_qlda - benchmark_qlda_amount
            anomalies.append(
                EstimateAnomaly(
                    cost_item="Chi phí Quản lý dự án (G_qlda)",
                    severity=CostAnomalySeverity.WARNING,
                    submitted_amount=g_qlda,
                    benchmark_amount=benchmark_qlda_amount,
                    deviation_percent=round(((g_qlda - benchmark_qlda_amount) / benchmark_qlda_amount) * 100.0, 1),
                    regulation_basis="Thông tư 12/2021/TT-BXD, Bảng 1.1 Phụ lục VIII",
                    message=f"Chi phí QLDA ({management_ratio:.2f}%) cao hơn định mức chuẩn quy định ({benchmark_qlda_ratio:.2f}%). Tiềm năng giảm trừ: {excess:,.0f} đ.",
                    recommendation="Áp dụng đúng định mức tỷ lệ % chi phí QLDA theo quy mô chi phí xây dựng + thiết bị được duyệt.",
                )
            )

        # 3. Rà soát tỷ lệ Chi phí Tư vấn đầu tư xây dựng (TT 12/2021/TT-BXD)
        consulting_ratio = (g_tv / base_cost) * 100.0
        # Định mức tham chiếu tổng chi phí tư vấn (thiết kế, thẩm tra, giám sát, lập BCNCKT...)
        benchmark_tv_ratio = 8.50 if base_cost <= 20_000_000_000 else 6.80
        benchmark_tv_amount = base_cost * (benchmark_tv_ratio / 100.0)

        if consulting_ratio > (benchmark_tv_ratio * 1.25):
            excess_tv = g_tv - benchmark_tv_amount
            anomalies.append(
                EstimateAnomaly(
                    cost_item="Chi phí Tư vấn ĐTXD (G_tv)",
                    severity=CostAnomalySeverity.WARNING,
                    submitted_amount=g_tv,
                    benchmark_amount=benchmark_tv_amount,
                    deviation_percent=round(((g_tv - benchmark_tv_amount) / benchmark_tv_amount) * 100.0, 1),
                    regulation_basis="Thông tư 12/2021/TT-BXD, Phụ lục VIII",
                    message=f"Chi phí tư vấn chiếm {consulting_ratio:.2f}% (vượt ngưỡng thông lệ {benchmark_tv_ratio:.2f}%). Tiềm năng rà soát: {excess_tv:,.0f} đ.",
                    recommendation="Kiểm tra việc áp dụng trùng lặp các định mức tư vấn khảo sát hoặc chi phí thẩm tra dự toán/thiết kế.",
                )
            )

        # 4. Rà soát Chi phí Dự phòng (G_dp) theo Nghị định 10/2021/NĐ-CP
        contingency_ratio = (g_dp / (sum_calculated - g_dp)) * 100.0 if (sum_calculated - g_dp) > 0 else 0
        max_allowed_contingency = 10.0 if req.project_group in ["GROUP_B", "GROUP_C"] else 15.0

        if contingency_ratio > max_allowed_contingency:
            anomalies.append(
                EstimateAnomaly(
                    cost_item="Chi phí Dự phòng (G_dp)",
                    severity=CostAnomalySeverity.ERROR,
                    submitted_amount=g_dp,
                    benchmark_amount=(sum_calculated - g_dp) * (max_allowed_contingency / 100.0),
                    deviation_percent=round(contingency_ratio - max_allowed_contingency, 2),
                    regulation_basis="Khoản 1 Điều 3 Thông tư 11/2021/TT-BXD & NĐ 10/2021/NĐ-CP",
                    message=f"Tỷ lệ dự phòng tính toán ({contingency_ratio:.2f}%) vượt trần tối đa cho phép ({max_allowed_contingency:.0f}% cho dự án {req.project_group}).",
                    recommendation="Cắt giảm chi phí dự phòng yếu tố trượt giá hoặc dự phòng phát sinh khối lượng về đúng khung định mức 10%.",
                )
            )

        # 5. Lưu ý đặc thù vật tư tại tỉnh Điện Biên
        if req.province_code == "dien_bien":
            anomalies.append(
                EstimateAnomaly(
                    cost_item="Đơn giá cước vận chuyển vật liệu (Điện Biên)",
                    severity=CostAnomalySeverity.INFO,
                    submitted_amount=g_xd,
                    benchmark_amount=g_xd,
                    deviation_percent=0.0,
                    regulation_basis="Công bố giá VLXD liên Sở Xây dựng - Tài chính tỉnh Điện Biên",
                    message="Khu vực vùng cao/biên giới tỉnh Điện Biên áp dụng bảng cước vận chuyển cơ giới đường đồi dốc bậc 4-5.",
                    recommendation="Cán bộ thẩm định đối soát bảng tính cước cự ly vận chuyển vật liệu cát, đá từ mỏ khai thác đến chân công trình.",
                )
            )

        # Tính toán tiềm năng tiết kiệm ngân sách (nếu giảm trừ các mục bất hợp lý)
        total_savings = 0.0
        for anom in anomalies:
            if anom.severity in [CostAnomalySeverity.ERROR, CostAnomalySeverity.WARNING]:
                if anom.submitted_amount > anom.benchmark_amount:
                    total_savings += anom.submitted_amount - anom.benchmark_amount

        suggested_total = max(1000.0, sum_submitted - total_savings) if is_balanced else sum_calculated - total_savings

        summary = (
            f"Kết quả thẩm tra dự toán dự án '{req.project_name}': "
            f"{'Cân đối số học đảm bảo. ' if is_balanced else 'Cần hiệu chỉnh sai lệch cộng dồn số học. '}"
            f"Phát hiện {len([a for a in anomalies if a.severity == CostAnomalySeverity.ERROR])} vi phạm định mức, "
            f"{len([a for a in anomalies if a.severity == CostAnomalySeverity.WARNING])} khuyến nghị rà soát. "
            f"Ước tính giá trị thẩm định có thể tiết kiệm cho ngân sách: {total_savings:,.0f} VNĐ."
        )

        return EstimateVerifyResult(
            dossier_id=req.dossier_id,
            project_name=req.project_name,
            is_sum_balanced=is_balanced,
            sum_calculated=sum_calculated,
            sum_submitted=sum_submitted,
            difference=diff,
            contingency_ratio=round(contingency_ratio, 2),
            consulting_ratio=round(consulting_ratio, 2),
            management_ratio=round(management_ratio, 2),
            suggested_total_investment=suggested_total,
            savings_potential=total_savings,
            anomalies=anomalies,
            summary_assessment=summary,
        )


estimate_verifier = EstimateVerifier()
