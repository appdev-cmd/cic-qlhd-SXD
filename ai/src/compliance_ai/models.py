"""Models for Compliance AI checking QCVN standards."""

from enum import Enum
from pydantic import BaseModel, Field


class SeverityLevel(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


class ComplianceCheckRequest(BaseModel):
    dossier_id: str | None = Field(default=None, description="Mã hồ sơ")
    project_name: str = Field(default="Dự án thẩm định", description="Tên công trình")
    building_type: str = Field(default="CIVIL_EDUCATION", description="Loại công trình (Giáo dục, Y tế, Nhà ở...)")
    construction_grade: str = Field(default="GRADE_III", description="Cấp công trình (Cấp I, II, III, IV)")
    building_height: float = Field(default=14.5, gt=0, description="Chiều cao công trình (m)")
    number_of_floors: int = Field(default=3, gt=0, description="Số tầng công trình")
    site_area: float = Field(default=2500.0, gt=0, description="Diện tích khu đất (m2)")
    building_footprint_area: float = Field(default=1250.0, gt=0, description="Diện tích xây dựng tầng 1 (m2)")
    road_width: float = Field(default=13.5, description="Bề rộng lộ giới tiếp giáp (m)")
    setback_distance: float = Field(default=3.0, description="Khoảng lùi công trình (m)")
    max_exit_distance: float = Field(default=25.0, description="Khoảng cách thoát nạn xa nhất (m)")
    stair_width: float = Field(default=1.2, description="Bề rộng vế thang bộ thoát nạn (m)")
    fire_resistance_rating: str = Field(default="BAC_II", description="Bậc chịu lửa thiết kế (BAC_I, BAC_II, BAC_III)")


class ComplianceIssue(BaseModel):
    rule_id: str
    standard: str
    article: str
    severity: SeverityLevel
    title: str
    description: str
    found_value: str
    allowed_value: str
    recommendation: str


class ComplianceCheckResult(BaseModel):
    dossier_id: str | None
    project_name: str
    is_compliant: bool
    total_checks: int
    passed_checks: int
    violations_count: int
    warnings_count: int
    compliance_score: float = Field(..., ge=0.0, le=100.0)
    issues: list[ComplianceIssue]
    summary_assessment: str
