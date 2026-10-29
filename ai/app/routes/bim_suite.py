"""Scoped data and assistant adapters for the complete BIM workspace."""

import json
from functools import lru_cache
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from ..deps import store
from ..database import connection
from ..store import remote, normalize_search
from .. import provider, vertex

router = APIRouter(prefix='/v1/bim')


@lru_cache(maxsize=1)
def norm_data():
    data = json.loads((Path(__file__).resolve().parents[1] / 'data/constructionNorms.json').read_text(encoding='utf-8'))
    return data, [(w, normalize_search(w['code'] + ' ' + w['title'])) for w in data['works']]


@router.get('/norms')
def norms(q: str = Query(default='', max_length=200), book: str = '', s=Depends(store)):
    data, index = norm_data()
    selected = book or data['books'][0]['id']
    tokens = normalize_search(q).split()
    matches = [w for w, text in index if w['book'] == selected and all(t in text for t in tokens)]
    return {
        'books': data['books'],
        'items': [
            {**{k: w[k] for k in ('id', 'book', 'code', 'title', 'unit')}, 'resourceCount': len(w['entries'])}
            for w in matches[:25]
        ],
        'total': len(matches),
    }


class AssistantRequest(BaseModel):
    projectId: UUID
    organizationId: str | None = None
    question: str = Field(min_length=1, max_length=4000)
    modelIds: list[UUID] = Field(default_factory=list, max_length=100)
    selection: list[dict] = Field(default_factory=list, max_length=200)
    history: list[dict] = Field(default_factory=list, max_length=20)


def scope(s, project):
    with connection(s.actor['id']) as con:
        row = con.execute(
            'select target_project_id,name from public.sxd_bim_projects where id=%s', (project,)
        ).fetchone()
    if not row:
        raise HTTPException(404, 'Không tìm thấy workspace BIM trong phạm vi quyền.')
    s.project(row['target_project_id'])
    return row


@router.get('/assistant/policy')
def policy(projectId: UUID, s=Depends(store)):
    scope(s, str(projectId))
    return {'enabled': True, 'toolGroups': ['bim']}


@router.post('/assistant')
def assistant(body: AssistantRequest, s=Depends(store)):
    project = scope(s, str(body.projectId))
    models = [str(i) for i in body.modelIds]
    with connection(s.actor['id']) as con:
        names = con.execute(
            "select id,file_name,element_count from public.bim_models where project_id=%s and id=any(%s::uuid[]) and deleted_at is null and status='ready'",
            (str(body.projectId), models),
        ).fetchall()
        allowed = [str(r['id']) for r in names]
        quantities = con.execute(
            '''select loai_cau_kien as category,count(*) as count,sum(the_tich_be_tong) as volume,
          count(*) filter(where nguon_khoi_luong='hinh_hoc') as estimated from public.bim_elements
          where project_id=%s and model_id=any(%s::uuid[]) group by loai_cau_kien order by count(*) desc limit 80''',
            (str(body.projectId), allowed),
        ).fetchall()
    context = {
        'project': project['name'],
        'models': [{'name': r['file_name'], 'elements': r['element_count']} for r in names],
        'quantities': quantities,
    }
    text = f"Workspace đang mở {len(names)} mô hình, {sum(r['element_count'] for r in names)} cấu kiện. "
    text += '; '.join(f"{r['category']}: {r['count']} cấu kiện" for r in quantities[:10])
    tools = []
    model = 'database-summary'
    if provider.configured() and provider.provider_id() == 'vertex':
        schema = {
            'type': 'OBJECT',
            'properties': {
                'text': {'type': 'STRING'},
                'actions': {
                    'type': 'ARRAY',
                    'items': {
                        'type': 'OBJECT',
                        'properties': {
                            'name': {
                                'type': 'STRING',
                                'enum': [
                                    'viewer_show_all',
                                    'viewer_set_view',
                                    'viewer_isolate_elements',
                                    'viewer_highlight_elements',
                                ],
                            },
                            'preset': {'type': 'STRING'},
                            'category': {'type': 'STRING'},
                        },
                        'required': ['name'],
                    },
                },
            },
            'required': ['text', 'actions'],
        }
        prompt = 'Bạn là trợ lý BIM cho Sở Xây dựng. Trả lời tiếng Việt, chỉ dùng dữ liệu cung cấp; phân biệt số liệu với nhận định chưa kiểm chứng. Không kết luận tuân thủ pháp luật hoặc tạo số liệu thiếu nguồn. Chỉ đề xuất action nếu người dùng yêu cầu điều khiển khung nhìn. category phải là lớp IFC có trong dữ liệu. preset: iso, top, front, back, left, right, bottom. Tối đa 3 action.'
        try:
            result = json.loads(
                vertex.generate(
                    prompt,
                    json.dumps({'question': body.question, 'context': context}, ensure_ascii=False, default=str),
                    schema,
                    4096,
                    thinking_level='LOW',
                )
            )
            text = str(result.get('text', text))
            model = provider.model_name()
            categories = {r['category'] for r in quantities}
            for a in result.get('actions', [])[:3]:
                if a.get('name') == 'viewer_show_all':
                    tools.append({'name': a['name'], 'args': {}})
                elif a.get('name') == 'viewer_set_view' and a.get('preset') in [
                    'iso',
                    'top',
                    'front',
                    'back',
                    'left',
                    'right',
                    'bottom',
                ]:
                    tools.append({'name': a['name'], 'args': {'preset': a['preset']}})
                elif (
                    a.get('name') in ['viewer_isolate_elements', 'viewer_highlight_elements']
                    and a.get('category') in categories
                ):
                    tools.append({'name': a['name'], 'args': {'loai_cau_kien': a['category']}})
        except (ValueError, vertex.VertexError):
            text += '\nChưa nhận được nhận định AI hợp lệ; số liệu trên được tổng hợp trực tiếp từ database.'
    logged = remote(
        '/rest/v1/rpc/sxd_bim_ai_log',
        s.token,
        method='POST',
        json={'p_project': str(body.projectId), 'p_question': body.question, 'p_answer': text, 'p_model': model},
    ).json()
    evidence = [
        {
            'kind': 'model',
            'ref': {'name': r['file_name']},
            'label': r['file_name'] + ' · ' + str(r['element_count']) + ' cấu kiện',
            'verified': True,
        }
        for r in names
    ]
    return {
        'runId': logged,
        'mode': 'chat',
        'text': text,
        'verified': False,
        'label': 'Số liệu từ BIM; nhận định AI cần chuyên viên rà soát',
        'evidence': evidence,
        'drafts': [],
        'viewerRequests': [{'key': str(i), 'name': t['name'], 'args': t['args']} for i, t in enumerate(tools)],
        'actions': [],
    }
