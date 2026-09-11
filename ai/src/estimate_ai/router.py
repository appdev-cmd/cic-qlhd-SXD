"""Router for Estimate AI endpoints."""

from fastapi import APIRouter, HTTPException, status
from src.estimate_ai.models import EstimateVerifyRequest, EstimateVerifyResult
from src.estimate_ai.verifier import estimate_verifier

router = APIRouter(prefix="/api/estimate", tags=["Estimate AI"])


@router.post(
    "/verify",
    response_model=EstimateVerifyResult,
    status_code=status.HTTP_200_OK,
    summary="Tham tra du toan, dinh muc va co cau tong muc dau tu",
    description="Ra soat sai lech chi phi, dinh muc TT 12/2021 va ty le du phong theo ND 10/2021",
)
async def verify_estimate(payload: EstimateVerifyRequest) -> EstimateVerifyResult:
    try:
        return estimate_verifier.verify(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Loi tham tra du toan xay dung: {exc!s}",
        ) from exc


@router.get("/health", status_code=status.HTTP_200_OK)
async def estimate_health() -> dict[str, str]:
    return {"status": "ok", "module": "estimate_ai"}
