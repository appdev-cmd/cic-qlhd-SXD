"""Durable OCR jobs with a local private spool; never persist user access tokens."""

import hashlib
import os
import time
from pathlib import Path
from uuid import UUID
from fastapi import HTTPException
from .domain import uid, now, invalidate
from .ingestion import read_document, extract_facts, checklist_candidates
from .ocr import available
from .store import DATA_DIR


def spool(job_id):
    folder = Path(os.getenv('APPRAISAL_OCR_SPOOL', str(DATA_DIR / 'ocr-spool'))).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    return folder / (str(UUID(job_id)) + '.pdf')


def prepare(s, case, doc_id):
    if not available():
        raise HTTPException(503, 'OCR cần Tesseract cùng bộ ngôn ngữ vie và eng.')
    if case.get('job', {}).get('status') == 'running':
        raise HTTPException(409, 'Đợi công việc đang chạy hoàn tất hoặc hủy trước.')
    doc = next((d for d in case['documents'] if d['id'] == doc_id), None)
    if not doc or not doc['name'].lower().endswith('.pdf'):
        raise HTTPException(422, 'OCR chỉ áp dụng cho PDF đã nộp.')
    data = s.file(case['id'], doc_id)
    if hashlib.sha256(data).hexdigest() != doc['hash']:
        raise HTTPException(409, 'Tệp không khớp dấu kiểm tra bản gốc.')
    job_id = uid()
    path = spool(job_id)
    with path.open('xb') as f:
        f.write(data)
    case['job'] = {
        'id': job_id,
        'mode': 'ocr',
        'status': 'running',
        'documentId': doc_id,
        'startedAt': now(),
        'useModel': False,
    }
    return path


def run(s, id, job_id, snapshot, save):
    path = spool(job_id)
    terminal = False
    try:
        started = time.monotonic()
        case = snapshot
        expected = case['revision']
        doc_id = case['job']['documentId']
        doc = next(d for d in case['documents'] if d['id'] == doc_id)
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != doc['hash']:
            raise ValueError('Invalid source hash')

        def check(page, total):
            if time.monotonic() - started > 900:
                raise TimeoutError('OCR time budget exhausted')
            # Poll at every page so cancellation stops expensive OCR promptly.
            current = s.get(id)
            if current['revision'] != expected or current.get('job', {}).get('status') != 'running':
                raise InterruptedError()

        segments, warnings, signature = read_document(doc['name'], data, ocr_limit=300, before_page=check)
        if not segments:
            raise ValueError('OCR produced no readable text')
        current = s.get(id)
        if (
            current['revision'] != expected
            or current.get('job', {}).get('id') != job_id
            or current['job']['status'] != 'running'
        ):
            terminal = True
            return
        target = next(d for d in current['documents'] if d['id'] == doc_id)
        target.update(segments=segments, warnings=warnings, signature=signature, ocrAt=now())
        current['facts'] = [f for f in current['facts'] if f['documentId'] != doc_id] + extract_facts(target)
        if target['requirementId'] == 'TTR' and target['role'] == 'submission':
            current['checklistCandidates'] = checklist_candidates(target)
        for req in current['requirements']:
            if req['id'] == target['requirementId'] and target['role'] != 'reference':
                req.update(status='submitted' if segments else 'needs_supplement', verifiedBy=None)
        invalidate(current)
        current['procedureReview'] = None
        current['job'].update(status='completed', finishedAt=now())
        save(
            s,
            current,
            expected,
            'Hoàn tất OCR',
            target['name'] + ': ' + str(len(segments)) + ' đoạn; cần đối chiếu bản gốc và xác nhận lại dữ liệu.',
        )
        terminal = True
    except InterruptedError:
        terminal = True
    except Exception:
        current = s.get(id)
        if current.get('job', {}).get('id') == job_id and current['job']['status'] == 'running':
            expected = current['revision']
            current['job'].update(status='failed', finishedAt=now())
            save(s, current, expected, 'OCR chưa hoàn tất', 'Có thể chạy lại; bản gốc được giữ nguyên.')
        terminal = True
    finally:
        if terminal:
            path.unlink(missing_ok=True)
