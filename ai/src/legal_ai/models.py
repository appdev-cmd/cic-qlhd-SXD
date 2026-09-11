"""Pydantic models for Legal AI appraisal assistance."""

from pydantic import BaseModel, Field


class LegalQuestion(BaseModel):
    """Input schema for querying legal advice in construction appraisal."""

    question: str = Field(..., description="Câu hỏi hoặc yêu cầu thẩm tra pháp lý")
    context: str | None = Field(default=None, description="Ngữ cảnh hồ sơ hoặc trích đoạn thẩm định")
    dossier_id: str | None = Field(default=None, description="Mã định danh hồ sơ thẩm định")


class Citation(BaseModel):
    """Citation schema for legal source references."""

    source: str = Field(..., description="Văn bản pháp luật (ví dụ: Luật Xây dựng 2025, NĐ 217/2026/NĐ-CP)")
    article: str = Field(..., description="Điều, khoản hoặc điểm trích dẫn")
    content: str = Field(..., description="Nội dung trích dẫn quy chuẩn / căn cứ pháp lý")
    effective_date: str | None = Field(default=None, description="Ngày có hiệu lực của văn bản")


class LegalAnswer(BaseModel):
    """Response schema containing legal advice with citations and confidence score."""

    answer: str = Field(..., description="Câu trả lời thẩm định pháp lý chi tiết")
    citations: list[Citation] = Field(default_factory=list, description="Danh sách trích dẫn căn cứ pháp lý")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Độ tin cậy của câu trả lời (0.0 - 1.0)")
    model_name: str = Field(..., description="Tên mô hình AI được sử dụng")
