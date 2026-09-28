"""Authorized direct uploads with hash verification and revision-aware finalization."""

import hashlib
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from fastapi import HTTPException
from .database import connection
from .store import remote, MODE
from .domain import uid


def prepare(s, case, body):
    if MODE == 'demo':
        raise HTTPException(422, 'Dùng tải tài liệu cục bộ trong chế độ mẫu.')
    if Path(body.name).suffix.lower() not in ('.pdf', '.docx', '.txt'):
        raise HTTPException(422, 'Hỗ trợ PDF, DOCX và TXT.')
    if not any(r['id'] == body.requirementId for r in case['requirements']):
        raise HTTPException(422, 'Thành phần không thuộc hồ sơ.')
    document_id = uid()
    with connection(s.actor['id']) as con:
        con.execute(
            'insert into public.appraisal_upload_sessions(id,case_id,actor_id,expected_revision,requirement_id,file_name,file_size,sha256,file_role) values(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
            (
                document_id,
                case['id'],
                s.actor['id'],
                body.revision,
                body.requirementId,
                Path(body.name).name,
                body.size,
                body.sha256,
                body.role,
            ),
        )
    path = case['id'] + '/' + document_id
    signed = remote(
        '/storage/v1/object/upload/sign/appraisal-originals/' + path, s.token, 'POST', json={'upsert': False}
    ).json()
    token = parse_qs(urlparse(signed.get('url', '')).query).get('token', [''])[0]
    if not token:
        raise HTTPException(503, 'Không tạo được phiên tải tệp.')
    return {'id': document_id, 'path': path, 'token': token}


def finalize(s, case, session_id, attach, save):
    existing = next((d for d in case['documents'] if d['id'] == session_id), None)
    if existing:
        return case
    with connection(s.actor['id']) as con:
        session = con.execute(
            "select * from public.appraisal_upload_sessions where id=%s and case_id=%s and state='pending' and expires_at>now()",
            (session_id, case['id']),
        ).fetchone()
    if not session:
        raise HTTPException(404, 'Phiên tải không tồn tại hoặc đã hết hạn.')
    if case['revision'] != session['expected_revision']:
        raise HTTPException(409, 'Hồ sơ đã thay đổi trong lúc tải. Tải lại hồ sơ và chọn lại tệp.')
    data = remote(
        '/storage/v1/object/authenticated/appraisal-originals/' + case['id'] + '/' + session_id, s.token
    ).content
    if len(data) != session['file_size'] or hashlib.sha256(data).hexdigest() != session['sha256']:
        raise HTTPException(422, 'Dung lượng hoặc mã kiểm tra tệp không khớp.')
    attach(s, case, session['requirement_id'], session['file_name'], data, session['file_role'], session_id, False)
    result = save(s, case, case['revision'], 'Tiếp nhận tài liệu', session['file_name'])
    with connection(s.actor['id']) as con:
        con.execute("update public.appraisal_upload_sessions set state='completed' where id=%s", (session_id,))
    return result
