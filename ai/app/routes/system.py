"""Runtime, readiness, staging test login, model probe and demo samples."""

from fastapi import APIRouter
import os
from pathlib import Path
from typing import Literal
from fastapi import Depends, Header, HTTPException, Response
from ..domain import new_case, audit
from ..rules import analyze
from ..store import Store, MODE
from ..provider import configured, provider_id, status as provider_status, check_connection
from ..deps import SECRET, attach, save, store, test_login_guard, writable
from ..schemas import TestLogin

router = APIRouter()


@router.get('/v1/health')
def health(s: Store = Depends(store)):
    from ..ocr import available

    return {
        'status': 'ok',
        'mode': MODE,
        'modelConfigured': configured(),
        'modelProvider': provider_status(),
        'actor': s.actor,
        'formats': ['pdf', 'docx', 'txt'],
        'ocrAvailable': available(),
    }


@router.get('/v1/runtime')
def runtime(x_internal_token: str = Header(default='')):
    import hmac

    if not hmac.compare_digest(x_internal_token, SECRET):
        raise HTTPException(403, 'Chỉ nhận yêu cầu qua Core API.')
    return {
        'mode': MODE,
        'environment': os.getenv('APPRAISAL_ENVIRONMENT', 'demo' if MODE == 'demo' else 'staging'),
        'authenticationRequired': MODE != 'demo',
    }


@router.get('/v1/readiness')
def readiness(s: Store = Depends(store)):
    from ..ocr import available

    if MODE == 'cloud':
        from ..database import connection

        with connection(s.actor['id']) as con:
            secure = con.execute(
                'select not (rolsuper or rolbypassrls) as secure from pg_roles where rolname=current_user'
            ).fetchone()['secure']
            if not secure:
                raise HTTPException(503, 'Kết nối runtime có quyền quản trị vượt mức.')
            con.execute('select id from public.appraisal_cases limit 1')
    return {
        'ready': True,
        'mode': MODE,
        'database': 'connected',
        'modelConfigured': configured(),
        'ocrAvailable': available(),
    }


@router.get('/v1/test-login/accounts')
def test_accounts(x_internal_token: str = Header(default=''), x_local_test_login: str = Header(default='')):
    test_login_guard(x_internal_token, x_local_test_login)
    from ..test_login import options

    return {'accounts': options()}


@router.post('/v1/test-login')
def login_test_account(
    body: TestLogin, x_internal_token: str = Header(default=''), x_local_test_login: str = Header(default='')
):
    test_login_guard(x_internal_token, x_local_test_login)
    from ..test_login import login

    return login(body.role)


@router.post('/v1/model/check')
def model_check(s: Store = Depends(store)):
    writable(s)
    if provider_id() != 'vertex':
        raise HTTPException(422, 'Chưa chọn nhà cung cấp Vertex AI.')
    return check_connection()


@router.post('/v1/samples/{scenario}')
def import_sample(scenario: Literal['initial', 'revised'], s: Store = Depends(store)):
    from ..samples import sample_documents

    writable(s)
    if MODE != 'demo':
        raise HTTPException(422, 'Chỉ nạp bộ mẫu tự động trong môi trường cục bộ.')
    case = new_case(
        'Trường liên cấp Hương Xuân — hồ sơ mô phỏng',
        'Hà Tĩnh',
        s.actor,
        '2026-09-27',
        sample=True,
        school_template=True,
    )
    audit(case, s.actor, 'Tạo bộ hồ sơ mẫu', 'Dữ liệu mô phỏng; không phải hồ sơ thật hoặc văn bản có giá trị pháp lý.')
    s.save(case)
    try:
        for spec, data in sample_documents(scenario):
            attach(s, case, spec['requirementId'], spec['filename'], data)
        case['runs'].append(analyze(case))
        return save(
            s, case, 1, 'Nạp bộ mẫu', f'Kịch bản {scenario}; đọc và kiểm tra lại tài liệu bằng cùng quy trình upload.'
        )
    except Exception as exc:
        raise HTTPException(500, 'Không tạo được bộ mẫu; kiểm tra bộ sinh tài liệu.') from exc


@router.get('/v1/samples.zip')
def sample_zip(s: Store = Depends(store)):
    path = Path('output/appraisal/bo-ho-so-mau-bcnckt.zip')
    if not path.exists():
        raise HTTPException(404, 'Chạy pnpm samples:build để tạo gói tài liệu.')
    return Response(
        path.read_bytes(),
        media_type='application/zip',
        headers={'Content-Disposition': 'attachment; filename="bo-ho-so-mau-bcnckt.zip"'},
    )
