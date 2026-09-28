"""FastAPI worker entry point: app, lifecycle hooks and route registration."""

import os
from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from .deps import SECRET, start_queue, test_login_guard
from .routes import system, projects, catalog, cases, documents, review
from .routes.cases import create_supplement
from .schemas import AddProjectImage, Supplement

# API contract is published only outside production; Core exposes it at /api/appraisal/docs (loopback).
DOCS = os.getenv('APPRAISAL_ENVIRONMENT', 'demo') in ('demo', 'staging')
app = FastAPI(
    title='BuildAppraisal worker',
    version='2026.09',
    docs_url=None,
    redoc_url=None,
    openapi_url='/v1/openapi.json' if DOCS else None,
)
for module in (system, projects, catalog, cases, documents, review):
    app.include_router(module.router)

if DOCS:

    @app.get('/v1/docs', include_in_schema=False)
    def api_docs():
        return get_swagger_ui_html(openapi_url='/api/appraisal/openapi.json', title='BuildAppraisal API')


@app.on_event('startup')
def startup():
    start_queue()


@app.on_event('shutdown')
def stop_queue():
    from .jobs import stop
    from .database import close_pools

    stop()
    close_pools()


__all__ = ['app', 'SECRET', 'test_login_guard', 'create_supplement', 'AddProjectImage', 'Supplement']
