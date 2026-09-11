"""Router for Compliance AI endpoints."""

from fastapi import APIRouter, HTTPException, status
from src.compliance_ai.models import ComplianceCheckRequest, ComplianceCheckResult
from src.compliance_ai.service import compliance_ai_service

router = APIRouter(prefix="/api/compliance", tags=["Compliance AI"])


@router.post(
    "/check",
    response_model=ComplianceCheckResult,
    status_code=status.HTTP_200_OK,
    summary="Kiem tra tu dong quy chuan quy hoach va an toan PCCC",
    description="Kiem tra tu dong theo QCVN 01:2021/BXD, QCVN 06:2022/BXD va tieu chuan xay dung",
)
async def check_compliance(payload: ComplianceCheckRequest) -> ComplianceCheckResult:
    try:
        return compliance_ai_service.evaluate(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Loi xu ly kiem tra quy chuan: {exc!s}",
        ) from exc


@router.get("/health", status_code=status.HTTP_200_OK)
async def compliance_health() -> dict[str, str]:
    return {"status": "ok", "module": "compliance_ai"}
