"""FastAPI router for Legal AI endpoints."""

from fastapi import APIRouter, HTTPException, status
from src.legal_ai.models import LegalAnswer, LegalQuestion
from src.legal_ai.service import legal_ai_service

router = APIRouter(prefix="/api/legal", tags=["Legal AI"])


@router.post(
    "/ask",
    response_model=LegalAnswer,
    status_code=status.HTTP_200_OK,
    summary="Tham tra phap ly va hoi dap quy chuan xay dung",
    description="Tra loi cac thac mac phap ly xay dung kem trich dan can cu va do tin cay",
)
async def ask_legal_ai(payload: LegalQuestion) -> LegalAnswer:
    """Endpoint to consult Legal AI on appraisal laws, circulars, and technical standards."""
    try:
        if not payload.question.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Câu hỏi pháp lý không được để trống.",
            )
        return await legal_ai_service.ask(
            question=payload.question,
            context=payload.context,
            dossier_id=payload.dossier_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi xử lý truy vấn pháp lý: {exc!s}",
        ) from exc


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Legal AI module health check",
)
async def legal_ai_health() -> dict[str, str]:
    """Health check endpoint for legal AI module."""
    return {"status": "ok", "module": "legal_ai"}
