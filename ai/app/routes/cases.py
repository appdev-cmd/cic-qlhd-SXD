"""Submission lists, creation, lineage, workflow and legal context of a submission."""

from fastapi import APIRouter
import hashlib
from typing import Literal
import json
from fastapi import Depends, HTTPException, Query
from ..domain import new_case, now, audit, invalidate
from ..rules import RULE_VERSION
from ..store import Store, MODE
from ..legal import legal_overview, legal_checklist
from ..deps import edit, investment_of, require_appraisal, save, store, validate_final_review, writable
from ..schemas import (
    Assignment,
    CreateCase,
    LegalContextReview,
    LegalRequirementReview,
    ProjectLink,
    Supplement,
    WorkflowCommand,
)

router = APIRouter()


@router.get('/v1/submissions')
def submissions(
    s: Store = Depends(store),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    procedure: Literal['bcnckt', 'gpxd', 'nghiem_thu'] | None = None,
    projectId: str | None = Query(default=None, max_length=100),
    search: str = Query(default='', max_length=200),
    kind: str = '',
    status: str = '',
    dateFrom: str = '',
    dateTo: str = '',
    sort: str = 'updatedAt',
    direction: str = 'desc',
    sla: str = Query(default='', max_length=30),
):
    return s.page(offset, limit, procedure, projectId, search, kind, status, dateFrom, dateTo, sort, direction, sla=sla)


@router.get('/v1/cases')
def cases(
    s: Store = Depends(store),
    offset: int = Query(default=0, ge=0),
    procedure: Literal['bcnckt', 'gpxd', 'nghiem_thu'] | None = None,
    projectId: str | None = Query(default=None, max_length=100),
):
    return [
        {
            **{
                k: c.get(k)
                for k in [
                    'id',
                    'name',
                    'province',
                    'department',
                    'projectId',
                    'projectName',
                    'projectCode',
                    'sample',
                    'submissionCode',
                    'submissionRound',
                    'sampleScenario',
                    'legalDate',
                    'createdAt',
                    'updatedAt',
                    'status',
                    'revision',
                ]
            },
            'procedure': c.get('procedure', 'bcnckt'),
            'documentCount': len(c.get('documents', [])),
        }
        for c in s.all(offset, procedure, projectId)
    ]


@router.post('/v1/cases')
def create(body: CreateCase, s: Store = Depends(store)):
    writable(s)
    project = s.project(body.projectId) if body.projectId else None
    if MODE != 'demo' and not project:
        raise HTTPException(422, 'Chọn dự án trước khi tạo hồ sơ.')
    case = new_case(
        body.name,
        body.province,
        s.actor,
        body.legalDate.isoformat(),
        body.projectId,
        procedure=body.procedure,
        project_name=body.projectName,
        project_code=body.projectCode,
    )
    if project:
        case.update(
            projectName=project.get('title', project.get('name')),
            projectCode=project['code'],
            department=project.get('department', s.actor['department']) if MODE != 'demo' else s.actor['department'],
        )
    audit(case, s.actor, 'Tạo hồ sơ', 'Tiếp nhận hồ sơ theo nghiệp vụ và dự án đã chọn.')
    return s.save(case)


@router.post('/v1/cases/{id}/project')
def link_project(id: str, body: ProjectLink, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    old = case.get('projectName') or 'Chưa gắn dự án'
    project = s.project(body.projectId)
    case.update(
        projectId=project['id'], projectName=project.get('title', project.get('name')), projectCode=project['code']
    )
    if MODE != 'demo':
        case['department'] = project['department']
    invalidate(case)
    return save(
        s,
        case,
        body.revision,
        'Gắn hồ sơ với dự án',
        old + ' → ' + body.projectName + ' (' + body.projectCode + '). Cần rà soát lại kết quả sau thay đổi liên kết.',
    )


@router.get('/v1/cases/{id}')
def get_case(id: str, s: Store = Depends(store)):
    from ..sla import evaluate

    case = s.get(id)
    case['readOnly'] = s.has_successor(id)
    for run in case['runs']:
        if run['ruleVersion'] != RULE_VERSION:
            run['stale'] = True
    case['slaState'] = evaluate(case.get('sla'), s.calendar(), case['readOnly'])
    return case


@router.get('/v1/cases/{id}/progress')
def case_progress(id: str, s: Store = Depends(store)):
    return s.progress(id)


@router.get('/v1/cases/{id}/submissions')
def submission_history(id: str, s: Store = Depends(store), offset: int = Query(default=0, ge=0)):
    return s.lineage(id, offset)


@router.post('/v1/cases/{id}/supplements')
def create_supplement(id: str, body: Supplement, s: Store = Depends(store)):
    writable(s)
    prior = s.get(id)
    fingerprint = hashlib.sha256(
        json.dumps({'actor': s.actor['id'], 'previous': id, **body.model_dump(mode='json')}, sort_keys=True).encode()
    ).hexdigest()
    try:
        existing = s.get(str(body.requestId))
    except HTTPException as error:
        if error.status_code != 404:
            raise
    else:
        if existing.get('creationRequest') != fingerprint:
            raise HTTPException(409, 'Yêu cầu tạo lần nộp đã được dùng với nội dung khác.')
        return existing
    if prior['revision'] != body.revision or s.has_successor(id):
        raise HTTPException(409, 'Lần nộp đã thay đổi hoặc đã có lần bổ sung. Tải lại hồ sơ.')
    if prior.get('job', {}).get('status') == 'running':
        raise HTTPException(409, 'Chờ lượt kiểm tra hoàn tất trước khi tạo lần bổ sung.')
    if body.legalDate.isoformat() < prior['legalDate']:
        raise HTTPException(422, 'Ngày đánh giá lần bổ sung không được trước lần nộp trước.')
    if not prior.get('projectId'):
        raise HTTPException(422, 'Gắn hồ sơ với dự án trước khi tạo lần bổ sung.')
    s.project(prior['projectId'])
    case = new_case(
        body.name,
        prior['province'],
        s.actor,
        body.legalDate.isoformat(),
        prior['projectId'],
        sample=prior['sample'],
        procedure=prior.get('procedure', 'bcnckt'),
        project_name=prior.get('projectName'),
        project_code=prior.get('projectCode'),
    )
    case.update(
        id=str(body.requestId),
        department=prior['department'],
        previousSubmissionId=id,
        previousRevision=prior['revision'],
        previousSubmissionName=prior['name'],
        dossierId=prior.get('dossierId', id),
        submissionRound=prior.get('submissionRound', 1) + 1,
        submissionReason=body.reason,
        creationRequest=fingerprint,
    )
    case['requirements'] = [{**r, 'status': 'missing', 'note': '', 'verifiedBy': None} for r in prior['requirements']]
    # Supplement/suspension limits apply to the whole dossier (NĐ 217/2026 Điều 36, 54), not to each round.
    case['workflow'] = {'state': 'received', 'counters': dict((prior.get('workflow') or {}).get('counters') or {})}
    audit(case, s.actor, 'Tạo lần bổ sung', prior['name'] + ' — ' + body.reason)
    return s.save(case)


@router.get('/v1/cases/{id}/legal')
def get_legal(id: str, s: Store = Depends(store)):
    case = s.get(id)
    require_appraisal(case)
    return legal_overview(case)


def case_authority(s, case):
    """Suggested competent authority for this submission (officer confirms; never auto-rejects)."""
    from ..authority import resolve
    from fastapi import HTTPException as Missing

    procedure = case.get('procedure', 'bcnckt')
    project = {}
    if case.get('projectId'):
        try:
            project = s.project(case['projectId'])
        except Missing:
            project = {}
    appraised = False
    if procedure == 'gpxd' and case.get('projectId'):
        appraised = s.page(limit=1, procedure='bcnckt', project_id=case['projectId'], status='reviewed')['total'] > 0
    return resolve(procedure, project, appraised, (case.get('procedureReview') or {}).get('subtype'))


def policy_summary(case):
    from ..procedure_policy import VERSION, policy
    from ..workflow import counters

    rules = policy(case.get('procedure', 'bcnckt'))
    limits = {
        key: {
            'used': counters(case).get(key, 0),
            'max': (rules.get(key) or {}).get('max'),
            'form': (rules.get(key) or {}).get('form'),
        }
        for key in ('request_supplement', 'suspend', 'extend')
        if rules.get(key if key != 'request_supplement' else 'supplement')
    }
    if 'request_supplement' in limits:
        limits['request_supplement'].update(max=rules['supplement'].get('max'), form=rules['supplement'].get('form'))
    return {'version': VERSION, 'limits': limits, 'resultForm': rules.get('resultForm')}


@router.get('/v1/cases/{id}/workflow')
def workflow_state(id: str, s: Store = Depends(store)):
    from ..workflow import state, options, STATES

    case = s.get(id)
    reviewers = []
    if MODE != 'demo':
        from ..database import read

        (reviewers,) = read(s.actor['id'], ('select * from public.appraisal_reviewers(%s)', (id,)))
    frozen = s.has_successor(id)
    return {
        'authority': case_authority(s, case),
        'policy': policy_summary(case),
        'state': state(case),
        'label': STATES[state(case)],
        'actions': [] if frozen else options(case, s.actor),
        'reviewers': reviewers,
        'canAssign': not frozen
        and not case.get('finalReview')
        and s.actor['role'] in ('head_of_department', 'director'),
        'canReopen': not frozen
        and bool(case.get('finalReview'))
        and s.actor['role'] in ('head_of_department', 'director'),
        'workflow': case.get('workflow', {}),
    }


@router.post('/v1/cases/{id}/assignment')
def assign_case(id: str, body: Assignment, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    if s.actor['role'] not in ('head_of_department', 'director'):
        raise HTTPException(403, 'Chỉ lãnh đạo được phân công.')
    info = workflow_state(id, s)
    target = next((p for p in info['reviewers'] if str(p['id']) == str(body.assigneeId)), None)
    if not target:
        raise HTTPException(422, 'Người được phân công phải đang hoạt động và cùng phạm vi hồ sơ.')
    if body.deadline and body.deadline.isoformat() < case['legalDate']:
        raise HTTPException(422, 'Hạn xử lý không được trước ngày đánh giá.')
    current = case.get('workflow', {})
    source = info['state']
    case['workflow'] = {
        **current,
        'state': 'assigned' if source in ('received', 'assigned') else source,
        'assigneeId': str(body.assigneeId),
        'assigneeName': target['full_name'],
        'deadline': body.deadline.isoformat() if body.deadline else None,
        'deadlineBasis': body.note,
        'history': current.get('history', [])
        + [
            {
                'action': 'Phân công',
                'note': target['full_name'] + ' — ' + body.note,
                'actor': s.actor['name'],
                'at': now(),
            }
        ],
    }
    case['assignee'] = target['full_name']
    return save(s, case, body.revision, 'Phân công xử lý', target['full_name'] + ' — ' + body.note)


@router.post('/v1/cases/{id}/workflow')
def transition_case(id: str, body: WorkflowCommand, s: Store = Depends(store)):
    from ..workflow import apply

    case = edit(s, id, body.revision)
    if body.action == 'approve' and case.get('procedure', 'bcnckt') == 'bcnckt':
        validate_final_review(case, investment_of(s, case))
    label = apply(case, s.actor, body.action, body.note, body.visitDate.isoformat() if body.visitDate else None)
    return save(s, case, body.revision, label, body.note)


@router.post('/v1/cases/{id}/legal/context')
def review_legal_context(id: str, body: LegalContextReview, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    require_appraisal(case)
    if body.submissionDate.isoformat() > case['legalDate']:
        raise HTTPException(422, 'Ngày trình không được sau ngày đánh giá của hồ sơ.')
    if body.submissionDate.isoformat() >= '2026-07-01' and body.priorStatus in ['eligible_pending', 'ineligible']:
        raise HTTPException(
            422,
            'Trạng thái đã trình trước 01/07 không phù hợp ngày trình. Chọn chưa xác định nếu không có hồ sơ chuyển tiếp.',
        )
    case['legalContext'] = {
        **body.model_dump(exclude={'revision'}, mode='json'),
        'confirmedBy': s.actor['name'],
        'confirmedAt': now(),
    }
    invalidate(case)
    return save(s, case, body.revision, 'Xác nhận phạm vi pháp lý', body.note)


@router.post('/v1/cases/{id}/legal/requirements/{key}')
def review_legal_requirement(id: str, key: str, body: LegalRequirementReview, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    require_appraisal(case)
    item = next((x for x in legal_checklist(case) if x['id'] == key), None)
    if not item:
        raise HTTPException(404, 'Thành phần không thuộc chế độ pháp lý/phạm vi hiện tại.')
    if not item['conditional'] and body.applicability != 'applicable':
        raise HTTPException(422, 'Thành phần cơ bản không thể đánh dấu không áp dụng.')
    if not set(body.requirementIds).issubset({r['id'] for r in case['requirements']}):
        raise HTTPException(422, 'Nhóm tài liệu không thuộc hồ sơ.')
    case.setdefault('legalRequirements', {})[key] = {
        **body.model_dump(exclude={'revision'}),
        'reviewedBy': s.actor['name'],
        'reviewedAt': now(),
    }
    invalidate(case)
    return save(s, case, body.revision, 'Đối chiếu thành phần theo pháp luật', item['name'] + ' — ' + body.note)
