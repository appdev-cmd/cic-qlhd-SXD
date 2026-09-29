"""Analysis runs, findings, final review, reopening and exports."""

from fastapi import APIRouter
from typing import Literal
from datetime import date
from fastapi import Depends, HTTPException, Response
from ..domain import uid, now, invalidate
from ..rules import RULE_VERSION
from ..store import Store, MODE
from ..procedure_review import Review as ProcedureReview
from ..deps import (
    edit,
    investment_of,
    require_appraisal,
    save,
    start_queue,
    store,
    validate_final_review,
    writable,
)
from ..schemas import Consultation, FinalReview, Mutation, ReopenReview, Review, RunRequest
from ..appraisal_sheet import SheetInput
from ..stamping import StampingCommand

router = APIRouter()


@router.post('/v1/cases/{id}/analysis')
def start_analysis(id: str, body: RunRequest, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    require_appraisal(case)
    if case.get('job', {}).get('status') == 'running':
        raise HTTPException(409, 'Hồ sơ đang được kiểm tra.')
    job_id = uid()
    case['job'] = {'id': job_id, 'status': 'running', 'startedAt': now(), 'mode': body.mode, 'useModel': body.useModel}
    saved = save(s, case, body.revision, 'Bắt đầu kiểm tra', f'Phạm vi {body.mode}; mô hình: {body.useModel}')
    start_queue()
    return saved


@router.post('/v1/cases/{id}/cancel')
def cancel(id: str, body: Mutation, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    if case.get('job'):
        case['job']['status'] = 'cancelled'
    result = save(s, case, body.revision, 'Hủy kiểm tra', 'Kết quả của lượt đang chạy sẽ không được ghi.')
    if case.get('job', {}).get('mode') == 'ocr':
        from ..ocr_jobs import spool

        spool(case['job']['id']).unlink(missing_ok=True)
    return result


@router.patch('/v1/cases/{id}/findings/{finding_id}')
def review_finding(id: str, finding_id: str, body: Review, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    if not case['runs'] or case['runs'][-1]['stale']:
        raise HTTPException(409, 'Cần chạy lại kiểm tra trước khi đánh giá.')
    finding = next((f for f in case['runs'][-1]['findings'] if f['id'] == finding_id), None)
    if not finding:
        raise HTTPException(404, 'Không có nhận xét trong lượt hiện tại.')
    finding['review'] = {'decision': body.decision, 'note': body.note, 'actor': s.actor['name'], 'at': now()}
    case['finalReview'] = None
    return save(s, case, body.revision, 'Đánh giá nhận xét', finding['title'] + ': ' + body.note)


@router.post('/v1/cases/{id}/consultations')
def consultation(id: str, body: Consultation, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    case['consultations'].append(
        {
            'id': uid(),
            'text': body.text,
            'response': body.response,
            'actor': s.actor['name'],
            'at': now(),
            'status': 'responded' if body.response.strip() else 'open',
        }
    )
    case['finalReview'] = None
    return save(s, case, body.revision, 'Ghi ý kiến và giải trình', body.text)


@router.post('/v1/cases/{id}/final-review')
def final_review(id: str, body: FinalReview, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    require_appraisal(case)
    if MODE != 'demo' and s.actor['role'] not in ['head_of_department', 'director']:
        raise HTTPException(403, 'Chỉ trưởng phòng hoặc lãnh đạo được hoàn tất rà soát.')
    if not case['runs'] or case['runs'][-1]['stale'] or case['runs'][-1]['ruleVersion'] != RULE_VERSION:
        raise HTTPException(409, 'Cần kết quả kiểm tra theo bộ quy tắc hiện tại.')
    if body.decision == 'reviewed':
        validate_final_review(case, investment_of(s, case))
    from ..workflow import state

    case['finalReview'] = {
        'decision': body.decision,
        'note': body.note,
        'actor': s.actor['name'],
        'at': now(),
        'simulation': bool(case.get('sample')) or MODE == 'demo',
    }
    workflow = case.get('workflow', {})
    target = 'reviewed' if body.decision == 'reviewed' else 'awaiting_supplement'
    case['workflow'] = {
        **workflow,
        'state': target,
        'history': workflow.get('history', [])
        + [
            {
                'from': state(case),
                'to': target,
                'action': 'Hoàn tất rà soát nội bộ' if target == 'reviewed' else 'Yêu cầu bổ sung',
                'note': body.note,
                'actor': s.actor['name'],
                'at': now(),
            }
        ],
    }
    return save(s, case, body.revision, 'Hoàn tất rà soát nội bộ', body.note)


@router.post('/v1/cases/{id}/reopen')
def reopen_review(id: str, body: ReopenReview, s: Store = Depends(store)):
    writable(s)
    if MODE != 'demo' and s.actor['role'] not in ['head_of_department', 'director']:
        raise HTTPException(403, 'Chỉ trưởng phòng hoặc lãnh đạo được mở lại hồ sơ.')
    case = s.get(id)
    if case['revision'] != body.revision:
        raise HTTPException(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.')
    if not case.get('finalReview'):
        raise HTTPException(409, 'Hồ sơ chưa khóa sau rà soát.')
    if s.has_successor(id):
        raise HTTPException(409, 'Mở lần nộp mới nhất để xử lý.')
    if (case.get('stamping') or {}).get('status') in ('stamped', 'archived'):
        raise HTTPException(409, 'Bản vẽ đã được đóng dấu thẩm định; xử lý điều chỉnh bằng lần trình mới.')
    case.pop('stamping', None)
    case.setdefault('reviewHistory', []).append(case['finalReview'])
    invalidate(case)
    workflow = case.get('workflow', {})
    case['workflow'] = {
        **workflow,
        'state': 'processing',
        'history': workflow.get('history', [])
        + [
            {
                'from': workflow.get('state'),
                'to': 'processing',
                'action': 'Mở lại để rà soát',
                'actor': s.actor['name'],
                'at': now(),
                'note': body.note,
            }
        ],
    }
    return save(s, case, body.revision, 'Mở lại hồ sơ để rà soát', body.note)


@router.get('/v1/cases/{id}/export/{kind}/{format}')
def export_case(
    id: str,
    kind: Literal['report', 'supplement', 'suspension', 'notice', 'decision', 'stamp'],
    format: Literal['pdf', 'docx', 'json'],
    s: Store = Depends(store),
):
    from ..reporting import export_document

    case = s.get(id)
    require_appraisal(case)
    if format != 'json' and case['runs'] and case['runs'][-1]['ruleVersion'] != RULE_VERSION:
        raise HTTPException(409, 'Bộ quy tắc đã cập nhật. Chạy kiểm tra lại trước khi xuất dự thảo.')
    data, mime = export_document(case, kind, format)
    return Response(data, media_type=mime, headers={'Content-Disposition': f'attachment; filename="{kind}.{format}"'})


@router.get('/v1/cases/{id}/internal-record/{format}')
def internal_record(id: str, format: Literal['pdf', 'docx'], s: Store = Depends(store)):
    from ..reporting import document_bytes

    case = s.get(id)
    procedure = {
        'bcnckt': 'Thẩm định BCNCKT',
        'gpxd': 'Cấp giấy phép xây dựng',
        'nghiem_thu': 'Hậu kiểm và nghiệm thu',
    }[case.get('procedure', 'bcnckt')]
    blocks = [
        {
            'heading': 'Thông tin hồ sơ',
            'text': [
                case['name'],
                'Dự án: ' + str(case.get('projectName') or 'Chưa gắn'),
                'Nghiệp vụ: ' + procedure,
                'Lần nộp: ' + str(case.get('submissionRound', 1)),
                'Phòng xử lý: ' + case['department'],
                'Phụ trách: ' + case.get('assignee', 'Chưa phân công'),
                'Phiếu ghi nhận quá trình xử lý nội bộ; chưa ký, chưa cấp số, không thay thế văn bản ban hành.',
            ],
        },
        {
            'heading': 'Danh mục tài liệu',
            'rows': [['STT', 'Tên tài liệu', 'Phiên bản']]
            + [[str(i + 1), d['name'], str(d.get('version', 1))] for i, d in enumerate(case['documents'])],
        },
        {
            'heading': 'Quá trình xử lý',
            'rows': [['Thời điểm', 'Thao tác', 'Người thực hiện', 'Nội dung']]
            + [
                [date.fromisoformat(a['at'][:10]).strftime('%d/%m/%Y'), a['action'], a['actor'], a['detail']]
                for a in case['audit']
            ],
        },
        {
            'heading': 'Ý kiến và giải trình',
            'text': [x['text'] + '\nGiải trình: ' + (x['response'] or 'Chưa có') for x in case['consultations']],
        },
    ]
    data = document_bytes('PHIẾU THEO DÕI XỬ LÝ HỒ SƠ', blocks, format, case['sample'])
    return Response(
        data,
        media_type='application/pdf'
        if format == 'pdf'
        else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        headers={'Content-Disposition': f'attachment; filename="phieu-xu-ly.{format}"'},
    )


@router.get('/v1/cases/{id}/procedure-review')
def procedure_review(id: str, subtype: str | None = None, s: Store = Depends(store)):
    from ..procedure_review import specification

    case = s.get(id)
    return {**specification(case, subtype), 'review': case.get('procedureReview')}


@router.post('/v1/cases/{id}/procedure-review')
def save_procedure_review(id: str, body: ProcedureReview, s: Store = Depends(store)):
    from ..procedure_review import apply

    case = edit(s, id, body.revision)
    apply(case, s.actor, body)
    return save(
        s,
        case,
        body.revision,
        'Lưu phiếu rà soát chuyên môn',
        'Đã ghi nhận checklist, dẫn chứng và nội dung theo dõi khắc phục.',
    )


@router.get('/v1/cases/{id}/procedure-review/{kind}/{format}')
def export_procedure_review(
    id: str,
    kind: Literal['review', 'minutes', 'draft', 'application'],
    format: Literal['pdf', 'docx'],
    s: Store = Depends(store),
):
    from ..procedure_review import export_blocks
    from ..reporting import document_bytes

    case = s.get(id)
    title, blocks = export_blocks(case, kind)
    return Response(
        document_bytes(title, blocks, format, case.get('sample', False)),
        media_type='application/pdf'
        if format == 'pdf'
        else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        headers={'Content-Disposition': f'attachment; filename="{kind}.{format}"'},
    )


@router.get('/v1/cases/{id}/appraisal-sheet')
def appraisal_sheet(id: str, s: Store = Depends(store)):
    from ..appraisal_sheet import view

    case = s.get(id)
    require_appraisal(case)
    return view(case, investment_of(s, case))


@router.post('/v1/cases/{id}/appraisal-sheet')
def save_appraisal_sheet(id: str, body: SheetInput, s: Store = Depends(store)):
    from ..appraisal_sheet import CONCLUSIONS, apply

    case = edit(s, id, body.revision)
    require_appraisal(case)
    sheet = apply(case, s.actor, body, investment_of(s, case))
    detail = 'Kết luận: ' + CONCLUSIONS.get(sheet['conclusion'], 'chưa chọn')
    return save(s, case, body.revision, 'Cập nhật phiếu thẩm định (Điều 38)', detail)


@router.get('/v1/cases/{id}/stamping')
def stamping(id: str, s: Store = Depends(store)):
    from ..stamping import view

    case = s.get(id)
    require_appraisal(case)
    return view(case, s.calendar())


@router.post('/v1/cases/{id}/stamping')
def stamping_action(id: str, body: StampingCommand, s: Store = Depends(store)):
    from ..stamping import apply

    case = edit(s, id, body.revision)
    require_appraisal(case)
    label = apply(case, s.actor, body, s.calendar(), MODE == 'demo')
    detail = ' — '.join(x for x in (body.reference, body.note) if x) or label
    return save(s, case, body.revision, label, detail)
