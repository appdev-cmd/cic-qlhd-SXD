"""BIM routes on the existing authenticated appraisal origin."""

from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field, field_validator
from ..deps import store
from .. import bim

router = APIRouter(prefix='/v1/bim')


class FileInfo(BaseModel):
    size: int = Field(ge=1, le=bim.MAX_FILE)
    sha256: str = Field(pattern='^[a-f0-9]{64}$')


class ModelInput(BaseModel):
    file_name: str = Field(min_length=1, max_length=300)
    discipline: Literal['TOAN_THE', 'KIEN_TRUC', 'KET_CAU', 'MEP', 'DIEN', 'CAP_THOAT_NUOC', 'PCCC', 'HA_TANG', 'KHAC']
    previous_id: str | None = None
    files: dict[str, FileInfo]
    element_count: int = Field(ge=1, le=1000000)
    ifc_schema: str = Field(default='', max_length=100)

    @field_validator('files')
    @classmethod
    def valid_files(cls, value):
        if set(value) != {'ifc', 'frag'}:
            raise ValueError('Require IFC and Fragments manifests')
        return value


class Chunk(BaseModel):
    data: str = Field(max_length=1400000)


class Element(BaseModel):
    express_id: int = Field(ge=1)
    global_id: str = Field(max_length=100)
    ten_cau_kien: str | None = Field(default=None, max_length=2000)
    loai_cau_kien: str = Field(max_length=200)
    phan_doan_tang: str | None = Field(default=None, max_length=1000)
    vat_lieu: str | None = Field(default=None, max_length=2000)
    the_tich_be_tong: float | None = None
    dien_tich: float | None = None
    chieu_dai: float | None = None
    dien_tich_van_khuon: float | None = None
    trong_luong: float | None = None
    nguon_khoi_luong: Literal['qto', 'pset', 'hinh_hoc'] | None = None
    thuoc_tinh: dict = Field(default_factory=dict)
    hash_noi_dung: str | None = None

    model_config = {'allow_inf_nan': False}


class ElementBatch(BaseModel):
    items: list[Element] = Field(min_length=1, max_length=100)


class Note(BaseModel):
    id: str | None = None
    revision: int | None = Field(default=None, ge=1)
    kind: Literal['view', 'issue']
    name: str = Field(min_length=1, max_length=300)
    description: str = Field(default='', max_length=5000)
    status: Literal['open', 'resolved'] = 'open'
    viewpoint: dict | None = None


class Revision(BaseModel):
    revision: int = Field(ge=1)


@router.get('/projects/{project_id}/models')
def models(project_id: str, s=Depends(store)):
    return bim.list_models(s, project_id)


@router.post('/projects/{project_id}/models')
def create_model(project_id: str, body: ModelInput, s=Depends(store)):
    return bim.create(s, project_id, body)


@router.post('/models/{id}/files/{kind}/{part}')
def chunk(id: UUID, kind: str, part: int, body: Chunk, s=Depends(store)):
    bim.put_chunk(s, str(id), kind, part, body.data)
    return {'ok': True}


@router.get('/models/{id}/files/{kind}')
def content(id: UUID, kind: str, s=Depends(store)):
    return Response(bim.file_content(s, str(id), kind), media_type='application/octet-stream',
                    headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@router.post('/models/{id}/elements')
def upload_elements(id: UUID, body: ElementBatch, s=Depends(store)):
    bim.put_elements(s, str(id), [e.model_dump() for e in body.items])
    return {'ok': True}


@router.post('/models/{id}/finalize')
def finish(id: UUID, s=Depends(store)):
    return bim.finalize(s, str(id))


@router.get('/models/{id}/elements')
def elements(id: UUID, search: str = Query(default='', max_length=200), category: str = '', storey: str = '',
             offset: int = Query(default=0, ge=0), limit: int = Query(default=100, ge=1, le=100), s=Depends(store)):
    return bim.elements(s, str(id), search, category, storey, offset, limit)


@router.get('/models/{id}/summary')
def summary(id: UUID, s=Depends(store)):
    return bim.summary(s, str(id))


@router.get('/models/{id}/notes')
def notes(id: UUID, s=Depends(store)):
    return bim.notes(s, str(id))


@router.post('/models/{id}/notes')
def save_note(id: UUID, body: Note, s=Depends(store)):
    return bim.save_note(s, str(id), body)


@router.post('/models/{id}/archive')
def archive(id: UUID, body: Revision, s=Depends(store)):
    bim.archive(s, str(id), body.revision)
    return {'ok': True}


@router.get('/projects/{project_id}/history')
def history(project_id: str, offset: int = Query(default=0, ge=0), s=Depends(store)):
    return bim.history(s, project_id, offset)
