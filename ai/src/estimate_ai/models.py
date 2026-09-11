"""Models for AI Estimate Verifier according to Decree 10/2021 & Circular 12/2021."""

from enum import Enum
from pydantic import BaseModel, Field


class CostAnomalySeverity(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


class EstimateVerifyRequest(BaseModel):
    dossier_id: str | None = Field(default=None, description="Mã hồ sơ")
    project_name: str = Field(default="Công trình xây dựng", description="Tên công trình")
    project_group: str = Field(default="GROUP_C", description="Nhóm dự án (GROUP_A, GROUP_B, GROUP_C)")
    construction_type: str = Field(default="Dân dụng", description="Loại công trình")
    total_investment_submitted: float = Field(..., gt=0, description="Tổng mức đầu tư trình thẩm định (VNĐ)")
    construction_cost: float = Field(..., ge=0, description="Chi phí xây dựng (G_xd) (VNĐ)")
    equipment_cost: float = Field(default=0, ge=0, description="Chi phí thiết bị (G_tb) (VNĐ)")
    management_cost: float = Field(default=0, ge=0, description="Chi phí quản lý dự án (G_qlda) (VNĐ)")
    consulting_cost: float = Field(default=0, ge=0, description="Chi phí tư vấn ĐTXD (G_tv) (VNĐ)")
    other_cost: float = Field(default=0, ge=0, description="Chi phí khác (G_k) (VNĐ)")
    contingency_cost: float = Field(default=0, ge=0, description="Chi phí dự phòng (G_dp) (VNĐ)")
    province_code: str = Field(default="dien_bien", description="Địa bàn thẩm định (Điện Biên)")


class EstimateAnomaly(BaseModel):
    cost_item: str
    severity: CostAnomalySeverity
    submitted_amount: float
    benchmark_amount: float
    deviation_percent: float
    regulation_basis: str
    message: str
    recommendation: str


class EstimateVerifyResult(BaseModel):
    dossier_id: str | None
    project_name: str
    is_sum_balanced: bool
    sum_calculated: float
    sum_submitted: float
    difference: float
    contingency_ratio: float
    consulting_ratio: float
    management_ratio: float
    suggested_total_investment: float
    savings_potential: float
    anomalies: list[EstimateAnomaly]
    summary_assessment: str
