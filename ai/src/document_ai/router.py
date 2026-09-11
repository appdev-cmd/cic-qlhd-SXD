"""Router for Document AI endpoints."""

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from src.document_ai.classifier import DocumentCategory, document_classifier

router = APIRouter(prefix="/api/document", tags=["Document AI"])


class DocumentChecklistRequest(BaseModel):
    dossier_type: str = Field(default="APPRAISAL_BCNCKT", description="Loại thủ tục")
    existing_documents: list[str] = Field(..., description="Danh sách tên các tệp tài liệu đã nộp")


class DocumentChecklistResult(BaseModel):
    is_complete: bool
    required_count: int
    submitted_count: int
    missing_items: list[str]
    submitted_categories: list[DocumentCategory]
    assessment_notes: str


REQUIRED_BCNCKT_DOCS = [
    {"code": "01_TO_TRINH", "name": "Tờ trình đề nghị thẩm định (Mẫu số 01)", "keywords": ["to trinh", "to_trinh", "mau 01"]},
    {"code": "02_PHAP_LY", "name": "Quyết định chủ trương đầu tư / Căn cứ pháp lý", "keywords": ["chu truong", "quyet dinh", "can cu"]},
    {"code": "03_BCNCKT", "name": "Báo cáo nghiên cứu khả thi / Thuyết minh dự án", "keywords": ["thuyet minh", "bcnckt", "kha thi"]},
    {"code": "04_TKCS", "name": "Hồ sơ bản vẽ thiết kế cơ sở (Kiến trúc, Kết cấu, MEP)", "keywords": ["ban ve", "thiet ke", "tkcs"]},
    {"code": "05_DU_TOAN", "name": "Báo cáo tổng mức đầu tư / Dự toán xây dựng", "keywords": ["du toan", "tmdt", "tong muc"]},
    {"code": "06_PCCC", "name": "Thỏa thuận / Văn bản thẩm duyệt an toàn PCCC", "keywords": ["pccc", "chay", "chua chay"]},
    {"code": "07_MOI_TRUONG", "name": "Văn bản về bảo vệ môi trường (ĐTM / GP Môi trường)", "keywords": ["moi truong", "dtm", "giay phep moi truong"]},
    {"code": "08_NANG_LUC", "name": "Hồ sơ năng lực nhà thầu tư vấn thiết kế & khảo sát", "keywords": ["nang luc", "chung chi", "tu van"]},
]


@router.post(
    "/classify",
    response_model=DocumentCategory,
    status_code=status.HTTP_200_OK,
    summary="Phan loai tai lieu ho so tu dong",
)
async def classify_file(filename: str) -> DocumentCategory:
    try:
        return await document_classifier.classify(b"", filename)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Loi phan loai tai lieu: {exc!s}",
        ) from exc


@router.post(
    "/checklist",
    response_model=DocumentChecklistResult,
    status_code=status.HTTP_200_OK,
    summary="Kiem tra day du thanh phan ho so theo Nghi dinh 217/2026/ND-CP",
)
async def check_checklist(payload: DocumentChecklistRequest) -> DocumentChecklistResult:
    try:
        submitted_cats: list[DocumentCategory] = []
        for fn in payload.existing_documents:
            cat = await document_classifier.classify(b"", fn)
            submitted_cats.append(cat)

        missing: list[str] = []
        for req_doc in REQUIRED_BCNCKT_DOCS:
            found = False
            for fn in payload.existing_documents:
                fn_lower = fn.lower()
                if any(kw in fn_lower for kw in req_doc["keywords"]):
                    found = True
                    break
            if not found:
                missing.append(req_doc["name"])

        is_complete = len(missing) == 0
        total_req = len(REQUIRED_BCNCKT_DOCS)
        sub_count = total_req - len(missing)

        if is_complete:
            notes = "Hồ sơ đã nộp đủ 100% thành phần tài liệu bắt buộc theo Điều 45 Nghị định 217/2026/NĐ-CP. Đủ điều kiện thụ lý tiếp nhận."
        else:
            notes = f"Hồ sơ còn thiếu {len(missing)} danh mục bắt buộc. Chuyên viên một cửa cần gửi Thông báo yêu cầu bổ sung hồ sơ theo mẫu."

        return DocumentChecklistResult(
            is_complete=is_complete,
            required_count=total_req,
            submitted_count=sub_count,
            missing_items=missing,
            submitted_categories=submitted_cats,
            assessment_notes=notes,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Loi kiem tra danh muc ho so: {exc!s}",
        ) from exc


@router.get("/health", status_code=status.HTTP_200_OK)
async def document_health() -> dict[str, str]:
    return {"status": "ok", "module": "document_ai"}
