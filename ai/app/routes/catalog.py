"""Supporting catalogs, dashboard and the legal assistant."""

from fastapi import APIRouter
from typing import Literal
from fastapi import Depends, Query
from ..store import Store
from ..deps import store
from ..schemas import CatalogMutation, LegalQuestion

router = APIRouter()


@router.get('/v1/catalog/{kind}')
def catalog_page(
    kind: Literal['organizations', 'personnel', 'material_prices'],
    s: Store = Depends(store),
    search: str = Query(default='', max_length=200),
    category: str = '',
    status: str = '',
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    sort: str = '',
    direction: Literal['asc', 'desc'] = 'asc',
):
    from ..catalog import page

    return page(s, kind, search, category, status, offset, limit, sort, direction)


@router.post('/v1/catalog/{kind}')
def create_catalog(
    kind: Literal['organizations', 'personnel', 'material_prices'], body: CatalogMutation, s: Store = Depends(store)
):
    from ..catalog import write

    return write(s, kind, body)


@router.patch('/v1/catalog/{kind}/{id}')
def update_catalog(
    kind: Literal['organizations', 'personnel', 'material_prices'],
    id: str,
    body: CatalogMutation,
    s: Store = Depends(store),
):
    from ..catalog import write

    return write(s, kind, body, id)


@router.get('/v1/catalog/{kind}/{id}/history')
def catalog_history(
    kind: Literal['organizations', 'personnel', 'material_prices'],
    id: str,
    offset: int = Query(default=0, ge=0),
    s: Store = Depends(store),
):
    from ..catalog import history

    return history(s, kind, id, offset)


@router.get('/v1/dashboard')
def dashboard_summary(s: Store = Depends(store), kind: Literal['all', 'sample', 'real'] = 'all'):
    from ..catalog import dashboard

    return dashboard(s, kind)


@router.post('/v1/legal-assistant')
def ask_legal(body: LegalQuestion, s: Store = Depends(store)):
    from ..legal_assistant import ask

    return ask(s, body.question, body.useModel)


@router.get('/v1/legal-assistant/evaluation')
def legal_evaluation(s: Store = Depends(store)):
    from ..legal_assistant import evaluation

    return evaluation()
