"""Legal AI package for construction appraisal compliance."""

from src.legal_ai.models import Citation, LegalAnswer, LegalQuestion
from src.legal_ai.service import LegalAIService, legal_ai_service

__all__ = ["Citation", "LegalAnswer", "LegalQuestion", "LegalAIService", "legal_ai_service"]
