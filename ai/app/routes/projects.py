"""Projects, project gallery, entity lookups and project audit."""

from fastapi import APIRouter
from typing import Literal
from uuid import UUID
from fastapi import Depends, HTTPException, Response, Query
from ..store import Store, MODE
from ..deps import store, writable
from ..schemas import AddProjectImage, CreateProject

router = APIRouter()


@router.get('/v1/projects/{id}/images')
def project_images(id: str, s: Store = Depends(store)):
    from ..gallery import read

    return read(s, id)


@router.post('/v1/projects/{id}/images')
def add_project_image(id: str, body: AddProjectImage, s: Store = Depends(store)):
    from ..gallery import add

    return add(s, id, body)


@router.get('/v1/projects/{id}/images/{image_id}/content')
def project_image_original(id: str, image_id: UUID, s: Store = Depends(store)):
    from ..gallery import content

    data = content(s, id, str(image_id))
    mime = 'image/png' if data.startswith(b'\x89PNG') else 'image/webp' if data[:4] == b'RIFF' else 'image/jpeg'
    return Response(
        data, media_type=mime, headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'}
    )


@router.get('/v1/projects')
def projects(
    s: Store = Depends(store),
    search: str = Query(default='', max_length=200),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    stage: str = '',
    group: str = '',
    status: str = '',
    sort: str = 'submissionDate',
    direction: Literal['asc', 'desc'] = 'desc',
):
    return s.projects(search, offset, limit, stage, group, status, sort, direction)


@router.get('/v1/projects/{id}')
def project_detail(id: str, s: Store = Depends(store)):
    return s.project(id)


@router.post('/v1/projects')
def create_project(body: CreateProject, s: Store = Depends(store)):
    writable(s)
    if MODE == 'demo':
        raise HTTPException(422, 'Tạo dự án cần môi trường cloud và tài khoản được phân quyền.')
    from ..database import connection
    from psycopg.types.json import Jsonb

    with connection(s.actor['id']) as con:
        return con.execute(
            'select public.create_appraisal_project(%s) as project', (Jsonb(body.model_dump()),)
        ).fetchone()['project']


@router.get('/v1/organizations/options')
def organization_options(search: str = Query(default='', max_length=200), s: Store = Depends(store)):
    return s.organization_options(search)


@router.get('/v1/entities/{kind}/{id}')
def entity_detail(kind: Literal['organization', 'personnel'], id: str, s: Store = Depends(store)):
    return s.entity(kind, id)


@router.get('/v1/projects/{id}/audit')
def project_audit(
    id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    s: Store = Depends(store),
):
    return s.project_audit(id, offset, limit)
