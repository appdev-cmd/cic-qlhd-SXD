"""FastAPI Application entrypoint for BuildAppraisal AI Workers."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.legal_ai.router import router as legal_ai_router

app = FastAPI(
    title="BuildAppraisal AI Workers",
    description="AI services for construction project appraisal",
    version="0.1.0",
)

# Configure Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(legal_ai_router)


@app.get(
    "/health",
    tags=["System"],
    summary="Global service health check",
)
async def health_check() -> dict[str, str]:
    """Return the health status of the AI worker service."""
    return {
        "status": "ok",
        "service": "BuildAppraisal AI Workers",
        "version": "0.1.0",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
