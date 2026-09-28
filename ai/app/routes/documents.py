"""Uploads, originals, requirements, extracted facts and OCR jobs."""

from fastapi import APIRouter
import base64
from fastapi import Depends, HTTPException, Response
from ..domain import uid, invalidate
from ..store import Store, MODE
from ..deps import attach, edit, save, start_queue, store
from ..schemas import AcceptChecklist, AddRequirement, FactReview, Mutation, PrepareUpload, RequirementReview, Upload

router = APIRouter()


@router.post('/v1/cases/{id}/uploads')
def prepare_upload(id: str, body: PrepareUpload, s: Store = Depends(store)):
    from ..uploads import prepare

    return prepare(s, edit(s, id, body.revision), body)


@router.post('/v1/cases/{id}/uploads/{upload_id}/finalize')
def finalize_upload(id: str, upload_id: str, s: Store = Depends(store)):
    from ..uploads import finalize

    case = s.get(id)
    edit(s, id, case['revision'])
    return finalize(s, case, upload_id, attach, save)


@router.post('/v1/cases/{id}/documents')
def upload(id: str, body: Upload, s: Store = Depends(store)):
    if MODE != 'demo':
        raise HTTPException(422, 'Sử dụng phiên tải tài liệu trực tiếp.')
    case = edit(s, id, body.revision)
    try:
        data = base64.b64decode(body.contentBase64, validate=True)
        doc = attach(s, case, body.requirementId, body.name, data, body.role)
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(422, 'Không đọc được tệp: ' + str(exc)[:200]) from exc
    return save(
        s, case, body.revision, 'Nộp tài liệu', f"{doc['name']} • phiên bản {doc['version']}; bản gốc được giữ nguyên."
    )


@router.get('/v1/cases/{id}/documents/{doc_id}')
def download(id: str, doc_id: str, s: Store = Depends(store)):
    case = s.get(id)
    doc = next((d for d in case['documents'] if d['id'] == doc_id), None)
    if not doc:
        raise HTTPException(404, 'Không có tệp.')
    ext = doc['name'].rsplit('.', 1)[-1].lower()
    mime = {
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain; charset=utf-8',
    }.get(ext, 'application/octet-stream')
    return Response(s.file(id, doc_id), media_type=mime, headers={'X-Content-Type-Options': 'nosniff'})


@router.post('/v1/cases/{id}/requirements')
def add_requirement(id: str, body: AddRequirement, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    case['requirements'].append(
        {
            'id': 'ADD-' + uid()[:8],
            'name': body.name,
            'category': body.category,
            'required': True,
            'status': 'missing',
            'note': 'Bổ sung theo danh mục tờ trình/chuyên viên.',
            'verifiedBy': None,
        }
    )
    invalidate(case)
    return save(s, case, body.revision, 'Thêm thành phần hồ sơ', body.name)


@router.post('/v1/cases/{id}/checklist/accept')
def accept_checklist(id: str, body: AcceptChecklist, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    candidate = next((c for c in case.get('checklistCandidates', []) if c['id'] == body.candidateId), None)
    if not candidate:
        raise HTTPException(404, 'Không có đề xuất thành phần.')
    if not any(r['id'] == candidate['requirementId'] for r in case['requirements']):
        case['requirements'].append(
            {
                'id': candidate['requirementId'],
                'name': candidate['name'],
                'category': candidate['category'],
                'required': True,
                'status': 'missing',
                'note': 'Xác nhận từ tờ trình: ' + candidate['locator'],
                'verifiedBy': None,
            }
        )
    candidate['accepted'] = True
    invalidate(case)
    return save(s, case, body.revision, 'Xác nhận danh mục theo tờ trình', candidate['name'])


@router.patch('/v1/cases/{id}/requirements/{req_id}')
def review_requirement(id: str, req_id: str, body: RequirementReview, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    req = next((r for r in case['requirements'] if r['id'] == req_id), None)
    if not req:
        raise HTTPException(404, 'Không có thành phần hồ sơ.')
    if body.status == 'verified' and not any(
        d['requirementId'] == req_id and d['role'] != 'reference' and d['segments'] for d in case['documents']
    ):
        raise HTTPException(422, 'Chưa có tài liệu đầu vào để xác nhận.')
    req.update(status=body.status, note=body.note, verifiedBy=s.actor['name'] if body.status == 'verified' else None)
    invalidate(case)
    return save(s, case, body.revision, 'Kiểm tra thành phần', req['name'] + ': ' + body.note)


@router.patch('/v1/cases/{id}/facts/{fact_id}')
def review_fact(id: str, fact_id: str, body: FactReview, s: Store = Depends(store)):
    case = edit(s, id, body.revision)
    fact = next((f for f in case['facts'] if f['id'] == fact_id), None)
    if not fact:
        raise HTTPException(404, 'Không có dữ liệu.')
    # UI submits canonical decimal strings, unlike Vietnamese source documents.
    from decimal import Decimal, InvalidOperation

    value = body.value.strip()
    if fact['unit']:
        try:
            n = Decimal(value)
            if not n.is_finite() or abs(n) >= Decimal('1e18'):
                raise InvalidOperation
            value = str(n)
        except InvalidOperation:
            raise HTTPException(422, 'Nhập số hợp lệ; phần thập phân dùng dấu chấm.')
    if value is None or value == '':
        raise HTTPException(422, 'Giá trị không hợp lệ.')
    old = fact['value']
    fact.update(value=value, reviewStatus=body.decision, reviewedBy=s.actor['name'], reviewNote=body.note)
    invalidate(case)
    return save(s, case, body.revision, 'Xác nhận dữ liệu', f"{fact['label']}: {old} → {value}. {body.note}")


@router.post('/v1/cases/{id}/documents/{doc_id}/ocr')
def start_ocr(id: str, doc_id: str, body: Mutation, s: Store = Depends(store)):
    from ..ocr_jobs import prepare

    case = edit(s, id, body.revision)
    path = prepare(s, case, doc_id)
    try:
        result = save(
            s,
            case,
            body.revision,
            'Đưa tài liệu vào hàng đợi OCR',
            'Đọc trang scan; giữ nguyên bản gốc, dữ liệu trích xuất cần xác nhận lại.',
        )
    except Exception:
        path.unlink(missing_ok=True)
        raise
    start_queue()
    return result
