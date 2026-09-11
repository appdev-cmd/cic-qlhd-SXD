"""Configuration settings for BuildAppraisal AI Workers."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings and environment configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/buildappraisal",
        description="Database connection URL with pgvector support",
    )
    OPENAI_API_KEY: str | None = Field(
        default=None,
        description="OpenAI API key for LLM and embeddings",
    )
    LLM_MODEL: str = Field(
        default="gpt-4o-mini",
        description="Default LLM model name for reasoning and answering",
    )
    EMBEDDING_MODEL: str = Field(
        default="text-embedding-3-small",
        description="Embedding model name for vector search",
    )
    VECTOR_DIMENSIONS: int = Field(
        default=1536,
        description="Vector embedding dimensionality",
    )


settings = Settings()
