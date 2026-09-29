"""Shared request dependencies and write helpers used by the route modules."""

import os
import hashlib
from pathlib import Path
from fastapi import Header, HTTPException
from .domain import uid, now, audit, invalidate
from .ingestion import read_document, extract_facts, checklist_candidates
from .rules import analyze, RULE_VERSION
from .store import Store, actor_for
from .provider import configured, semantic_notes, provider_id, model_name, record_connection
from .vertex import VertexError
from .legal import resolve_profile, legal_checklist
from .jobs import start as _start_jobs

SECRET = os.getenv('APPRAISAL_INTERNAL_TOKEN', '')
if not SECRET:
    raise RuntimeError('APPRAISAL_INTERNAL_TOKEN is required. Use pnpm dev:appraisal.')


def start_queue():
    _start_jobs(run_analysis)


def store(x_internal_token: str = Header(default=''), authorization: str = Header(default='')):
    import hmac

    if not hmac.compare_digest(x_internal_token, SECRET):
        raise HTTPException(403, 'Chỉ nhận yêu cầu qua Core API.')
    return Store(authorization, actor_for(authorization))


def require_appraisal(case):
    if case.get('procedure', 'bcnckt') != 'bcnckt':
        raise HTTPException(422, 'Chức năng thẩm định BCNCKT không áp dụng cho loại hồ sơ này.')


def writable(s):
    if s.actor['role'] not in ['officer', 'head_of_department', 'director', 'admin']:
        raise HTTPException(403, 'Tài khoản không có quyền sửa hồ sơ.')


def edit(s, id, revision):
    writable(s)
    case = s.get(id)
    if case['revision'] != revision:
        raise HTTPException(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.')
    if s.has_successor(id):
        raise HTTPException(409, 'Lần nộp này đã có lần bổ sung; mở lần mới nhất để xử lý.')
    assigned = case.get('workflow', {}).get('assigneeId')
    if assigned and assigned != s.actor['id'] and s.actor['role'] == 'officer':
        raise HTTPException(403, 'Hồ sơ đã phân công chuyên viên khác.')
    if case.get('finalReview'):
        raise HTTPException(409, 'Hồ sơ đã khóa sau rà soát. Cần người có thẩm quyền mở lại trước khi sửa.')
    return case


def save(s, case, expected, action, detail):
    case['revision'] = expected + 1
    case['updatedAt'] = now()
    audit(case, s.actor, action, detail)
    return s.save(case, expected)


def test_login_guard(token, local):
    import hmac

    if not hmac.compare_digest(token, SECRET) or local != 'true':
        raise HTTPException(403, 'Chỉ cho phép đăng nhập thử nghiệm từ máy cục bộ.')


def attach(s, case, requirement_id, name, data, role='submission', document_id=None, store_file=True):
    req = next((r for r in case['requirements'] if r['id'] == requirement_id), None)
    if not req:
        raise HTTPException(400, 'Chọn một thành phần hồ sơ có trong checklist.')
    digest = hashlib.sha256(data).hexdigest()
    if any(
        d['hash'] == digest and d['requirementId'] == requirement_id and d['role'] == role for d in case['documents']
    ):
        raise HTTPException(409, 'Tệp này đã có trong cùng thành phần hồ sơ.')
    segments, warnings, signature = read_document(name, data, ocr_limit=0)
    doc = {
        'id': document_id or uid(),
        'requirementId': requirement_id,
        'name': Path(name).name,
        'role': role,
        'version': 1 + sum(d['requirementId'] == requirement_id and d['role'] == role for d in case['documents']),
        'hash': digest,
        'size': len(data),
        'uploadedAt': now(),
        'segments': segments,
        'warnings': warnings,
        'signature': signature,
    }
    if store_file:
        s.put_file(case['id'], doc['id'], data)
    case['documents'].append(doc)
    case['facts'].extend(extract_facts(doc))
    if requirement_id == 'TTR' and role == 'submission':
        case['checklistCandidates'] = checklist_candidates(doc)
    if role != 'reference':
        req['status'] = 'submitted' if segments and not warnings else 'needs_supplement'
        req['verifiedBy'] = None
    invalidate(case)
    return doc


def run_analysis(s, id, job_id, mode, use_model, snapshot=None):
    if mode == 'ocr':
        from .ocr_jobs import run

        return run(s, id, job_id, snapshot, save)
    try:
        case = snapshot or s.get(id)
        expected = case['revision']
        result = analyze(case, mode)
        if use_model:
            try:
                result['aiNotes'], result['aiStatus'] = semantic_notes(case, result)
                if configured():
                    result['provider'] = 'rules+' + provider_id()
                    result['model'] = model_name()
            except Exception as exc:
                message = str(exc) if isinstance(exc, VertexError) else 'Lỗi gọi mô hình hoặc kết quả không hợp lệ.'
                record_connection(False, message)
                result['aiStatus'] = message + ' Chỉ có kết quả quy tắc; có thể chạy lại.'
        current = s.get(id)
        if (
            current['revision'] != expected
            or current.get('job', {}).get('id') != job_id
            or current.get('job', {}).get('status') != 'running'
        ):
            return
        current['runs'].append(result)
        current['job'].update(status='completed', finishedAt=now())
        save(s, current, expected, 'Hoàn tất kiểm tra', f"{len(result['findings'])} nhận xét; {result['aiStatus']}")
    except Exception:
        try:
            case = s.get(id)
            if case.get('job', {}).get('id') == job_id:
                expected = case['revision']
                case['job']['status'] = 'failed'
                save(s, case, expected, 'Kiểm tra thất bại', 'Chưa ghi kết quả mới. Có thể chạy lại.')
        except Exception:
            pass


def investment_of(s, case):
    """Investment form of the case's project (None when unknown or out of scope)."""
    from .authority import facts

    if not case.get('projectId'):
        return None
    try:
        return facts(s.project(case['projectId']))['investment']
    except HTTPException:
        return None


def validate_final_review(case, investment=None):
    if not case['runs'] or case['runs'][-1]['stale'] or case['runs'][-1]['ruleVersion'] != RULE_VERSION:
        raise HTTPException(409, 'Cần kết quả kiểm tra theo bộ quy tắc hiện tại.')
    profile = resolve_profile(case)
    if not profile['confirmed']:
        raise HTTPException(422, 'Cần xác nhận phạm vi và chế độ pháp lý trước khi hoàn tất rà soát.')
    if any(r['applicability'] == 'unknown' for r in legal_checklist(case)):
        raise HTTPException(422, 'Còn thành phần pháp lý chưa xác định điều kiện áp dụng.')
    if any(not f.get('review') or f['review']['decision'] == 'defer' for f in case['runs'][-1]['findings']):
        raise HTTPException(422, 'Còn nhận xét chưa được đánh giá hoặc đang chờ làm rõ.')
    from .domain import latest_documents

    ids = {d['id'] for d in latest_documents(case)}
    if any(f['reviewStatus'] == 'pending' and f['documentId'] in ids for f in case['facts']):
        raise HTTPException(422, 'Còn dữ liệu trích xuất chưa được xác nhận.')
    if profile['code'] == 'nd217' and profile['scope'] in ('construction', 'concurrent'):
        # Khoản 6 Điều 38: every content group is assessed and the notice carries one of three conclusions.
        from .appraisal_sheet import require_complete

        require_complete(case, investment)
