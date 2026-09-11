"""Document classifier for construction project appraisal dossiers."""

import logging
import re
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class DocumentCategory(BaseModel):
    """Classification result and category metadata for appraisal documents."""

    category_id: str = Field(..., description="Mã định danh nhóm tài liệu")
    category_name: str = Field(..., description="Tên danh mục hồ sơ thẩm định")
    suggested_folder: str = Field(..., description="Thư mục lưu trữ gợi ý trong hệ thống")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Độ tin cậy của kết quả phân loại")
    matched_pattern: str | None = Field(default=None, description="Mẫu khớp trong tên tệp")


class DocumentClassifier:
    """Classify incoming construction dossier files into standard appraisal categories."""

    PATTERNS: list[dict[str, str | list[str]]] = [
        {
            "id": "SUBMISSION_FORM",
            "name": "Tờ trình / Đơn đề nghị thẩm định",
            "folder": "01_to_trinh",
            "keywords": ["to_trinh", "to trinh", "de nghi tham dinh", "don de nghi", "mau 01", "mau 03"],
        },
        {
            "id": "LEGAL_BASIS",
            "name": "Văn bản căn cứ pháp lý & Quy hoạch",
            "folder": "02_can_cu_phap_ly",
            "keywords": ["chu truong", "quyet dinh", "phe duyet", "quy hoach", "mbqh", "dat dai", "gcn"],
        },
        {
            "id": "FEASIBILITY_REPORT",
            "name": "Báo cáo nghiên cứu khả thi / Báo cáo KT-KT",
            "folder": "03_thuyet_minh",
            "keywords": ["thuyet minh", "bcnkht", "bcktkt", "nghien cuu kha thi", "kinh te ky thuat"],
        },
        {
            "id": "SURVEY_REPORT",
            "name": "Báo cáo kết quả khảo sát xây dựng",
            "folder": "04_khao_sat",
            "keywords": ["khao sat", "dia chat", "dia hinh", "khoan tham do", "thuy van"],
        },
        {
            "id": "DESIGN_DRAWINGS",
            "name": "Hồ sơ bản vẽ thiết kế xây dựng",
            "folder": "05_ban_ve_thiet_ke",
            "keywords": ["ban ve", "thiet ke", "mat bang", "mat dung", "mat cat", "ket cau", "kien truc", "m&e", "dwg"],
        },
        {
            "id": "COST_ESTIMATE",
            "name": "Dự toán chi phí & Tổng mức đầu tư",
            "folder": "06_du_toan",
            "keywords": ["du toan", "tong muc dau tu", "tmdt", "chi phi", "don gia", "tien do giai ngan"],
        },
        {
            "id": "FIRE_SAFETY",
            "name": "Văn bản thẩm duyệt PCCC",
            "folder": "07_pccc",
            "keywords": ["pccc", "phong chay", "chua chay", "tham duyet pccc", "nghiem thu pccc"],
        },
        {
            "id": "ENVIRONMENT",
            "name": "Báo cáo đánh giá tác động môi trường (ĐTM) / GP Môi trường",
            "folder": "08_moi_truong",
            "keywords": ["dtm", "moi truong", "danh gia tac dong", "giay phep moi truong"],
        },
        {
            "id": "VERIFICATION_REPORT",
            "name": "Báo cáo kết quả thẩm tra thiết kế & dự toán",
            "folder": "09_tham_tra",
            "keywords": ["tham tra", "bao cao tham tra", "ket qua tham tra"],
        },
        {
            "id": "CAPACITY_DOCUMENTS",
            "name": "Hồ sơ năng lực tổ chức, cá nhân tư vấn",
            "folder": "10_nang_luc",
            "keywords": ["nang luc", "chung chi", "cchn", "chung chi hanh nghe", "dang ky kinh doanh"],
        },
    ]

    async def classify(self, file_bytes: bytes, filename: str) -> DocumentCategory:
        """Classify document category based on filename patterns and file metadata."""
        clean_name = filename.lower()
        # Remove accents/special characters for simplified matching
        normalized_name = re.sub(r"[_\-\.\s]+", " ", clean_name)

        logger.debug("Classifying file: %s (bytes length=%d)", filename, len(file_bytes))

        for rule in self.PATTERNS:
            keywords = rule["keywords"]
            for kw in keywords:
                if kw in normalized_name:
                    return DocumentCategory(
                        category_id=str(rule["id"]),
                        category_name=str(rule["name"]),
                        suggested_folder=str(rule["folder"]),
                        confidence=0.92,
                        matched_pattern=kw,
                    )

        # Default fallback category
        return DocumentCategory(
            category_id="OTHER",
            category_name="Tài liệu hồ sơ khác",
            suggested_folder="99_tai_lieu_khac",
            confidence=0.50,
            matched_pattern=None,
        )


document_classifier = DocumentClassifier()
