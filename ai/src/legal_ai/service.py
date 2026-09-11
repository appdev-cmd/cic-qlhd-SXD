"""Legal AI Service for construction appraisal compliance and advisory."""

import logging
from src.config import settings
from src.legal_ai.models import Citation, LegalAnswer

logger = logging.getLogger(__name__)


class LegalAIService:
    """Service providing legal reasoning, validation, and citations for construction projects."""

    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or settings.LLM_MODEL

    async def ask(
        self,
        question: str,
        context: str | None = None,
        dossier_id: str | None = None,
    ) -> LegalAnswer:
        """Process a legal question and return an appraisal answer with citations."""
        logger.info("Processing legal inquiry for dossier=%s: %s", dossier_id, question)

        normalized_query = question.lower()

        # Placeholder implementation with mock reasoning and citations from Luật XD 2025 & NĐ 217/2026
        if any(term in normalized_query for term in ["thời hạn", "thời gian", "sla", "tiến độ"]):
            answer = (
                "Theo quy định hiện hành về thẩm định dự án đầu tư xây dựng tại tỉnh Điện Biên, "
                "thời hạn thẩm định Báo cáo nghiên cứu khả thi / thiết kế xây dựng triển khai sau thiết kế cơ sở "
                "được quy định theo nhóm dự án và cấp công trình: Dự án nhóm B công trình cấp I trở lên tối đa 20 ngày, "
                "các cấp còn lại tối đa 16 ngày; Dự án nhóm C công trình cấp I trở lên tối đa 15 ngày, "
                "còn lại tối đa 12 ngày. Thời gian kiểm tra tính hợp lệ của hồ sơ là 05 ngày làm việc."
            )
            citations = [
                Citation(
                    source="Nghị định số 217/2026/NĐ-CP",
                    article="Điều 14, Khoản 2",
                    content="Quy định về thời gian thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng của cơ quan chuyên môn về xây dựng.",
                    effective_date="2026-01-01",
                ),
                Citation(
                    source="Quy chế thẩm định Sở Xây dựng tỉnh Điện Biên",
                    article="Mục 3, Điều 5",
                    content="Thời hạn giải quyết thủ tục hành chính thẩm định dự án trên địa bàn tỉnh Điện Biên theo cơ chế một cửa.",
                    effective_date="2026-02-15",
                ),
            ]
            confidence = 0.96

        elif any(term in normalized_query for term in ["thẩm quyền", "cơ quan", "sở xây dựng"]):
            answer = (
                "Căn cứ Luật Xây dựng 2025 và phân cấp quản lý tại địa phương, Sở Xây dựng tỉnh Điện Biên "
                "chủ trì thẩm định Báo cáo nghiên cứu khả thi, thiết kế triển khai sau thiết kế cơ sở đối với các dự án "
                "đầu tư xây dựng công trình dân dụng, công nghiệp vật liệu xây dựng, hạ tầng kỹ thuật và giao thông đô thị "
                "sử dụng vốn đầu tư công hoặc vốn nhà nước ngoài đầu tư công trên địa bàn tỉnh theo phân cấp của UBND tỉnh."
            )
            citations = [
                Citation(
                    source="Luật Xây dựng 2025",
                    article="Điều 58, Khoản 1",
                    content="Thẩm quyền thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng của cơ quan chuyên môn về xây dựng thuộc UBND cấp tỉnh.",
                    effective_date="2025-07-01",
                ),
                Citation(
                    source="Nghị định số 217/2026/NĐ-CP",
                    article="Điều 8",
                    content="Phân cấp và ủy quyền thẩm định dự án, thiết kế xây dựng.",
                    effective_date="2026-01-01",
                ),
            ]
            confidence = 0.94

        else:
            answer = (
                f"Yêu cầu thẩm tra: '{question}'. Căn cứ quy định của Luật Xây dựng 2025 và Nghị định số 217/2026/NĐ-CP, "
                "hồ sơ cần đáp ứng đầy đủ sự phù hợp với quy hoạch xây dựng, điều kiện năng lực của tổ chức/cá nhân lập hồ sơ, "
                "sự tuân thủ các quy chuẩn kỹ thuật quốc gia (QCVN) về an toàn công trình, PCCC và giải pháp bảo vệ môi trường. "
                + (f" Ngữ cảnh bổ sung: {context}." if context else "")
            )
            citations = [
                Citation(
                    source="Luật Xây dựng 2025",
                    article="Điều 60",
                    content="Nội dung thẩm định Báo cáo nghiên cứu khả thi đầu tư xây dựng của người quyết định đầu tư và cơ quan chuyên môn về xây dựng.",
                    effective_date="2025-07-01",
                ),
                Citation(
                    source="Nghị định số 217/2026/NĐ-CP",
                    article="Mẫu 01, Mẫu 03 Phụ lục I",
                    content="Mẫu văn bản đề nghị thẩm định và thông báo kết quả thẩm định Báo cáo NCKH đầu tư xây dựng.",
                    effective_date="2026-01-01",
                ),
            ]
            confidence = 0.90

        return LegalAnswer(
            answer=answer,
            citations=citations,
            confidence=confidence,
            model_name=self.model_name,
        )


legal_ai_service = LegalAIService()
