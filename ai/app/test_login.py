"""Opt-in staging login for dedicated test identities; never expose their passwords."""

import json
import os
from pathlib import Path
import httpx
from fastapi import HTTPException

ALLOWED = ('officer', 'head_of_department', 'director', 'admin')
LABELS = {
    'officer': ('Chuyên viên', 'Tiếp nhận và xử lý hồ sơ'),
    'head_of_department': ('Trưởng phòng', 'Rà soát và mở lại hồ sơ'),
    'director': ('Lãnh đạo Sở', 'Rà soát kết quả theo thẩm quyền'),
    'admin': ('Quản trị', 'Quản lý dữ liệu thử nghiệm'),
}


def accounts():
    if (
        os.getenv('APPRAISAL_ENVIRONMENT') != 'staging'
        or os.getenv('APPRAISAL_ENABLE_TEST_LOGIN') != 'true'
        or os.getenv('APPRAISAL_MODE') not in ('cloud', 'supabase')
    ):
        return []
    path = Path(
        os.getenv('APPRAISAL_TEST_ACCOUNTS_FILE', str(Path.home() / '.config/buildappraisal/test-accounts.json'))
    )
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        if (
            os.getenv('SUPABASE_URL', os.getenv('VITE_SUPABASE_URL', '')).rstrip('/')
            != 'https://' + payload['projectRef'] + '.supabase.co'
        ):
            return []
        return [a for a in payload['accounts'] if a['role'] in ALLOWED]
    except (OSError, ValueError, KeyError):
        return []


def options():
    return [{'role': a['role'], 'label': LABELS[a['role']][0], 'description': LABELS[a['role']][1]} for a in accounts()]


def login(role):
    account = next((a for a in accounts() if a['role'] == role), None)
    if not account:
        raise HTTPException(404, 'Đăng nhập thử nghiệm đang tắt hoặc vai trò không được cấu hình.')
    from .store import actor_for

    base = os.getenv('SUPABASE_URL', os.getenv('VITE_SUPABASE_URL', '')).rstrip('/')
    key = os.getenv('SUPABASE_ANON_KEY', os.getenv('VITE_SUPABASE_ANON_KEY', ''))
    try:
        response = httpx.post(
            base + '/auth/v1/token?grant_type=password',
            headers={'apikey': key},
            json={'email': account['email'], 'password': account['password']},
            timeout=30,
        )
        if response.status_code != 200:
            raise HTTPException(503, 'Chưa đăng nhập được tài khoản thử nghiệm. Vui lòng thử lại.')
        session = response.json()
        actor = actor_for('Bearer ' + session['access_token'])
        if (
            actor['id'] != account['user_id']
            or actor['role'] != role
            or not session['user'].get('app_metadata', {}).get('staging_test_account')
        ):
            raise HTTPException(403, 'Tài khoản không khớp cấu hình thử nghiệm.')
        return {key: session[key] for key in ['access_token', 'refresh_token']}
    except httpx.HTTPError:
        raise HTTPException(503, 'Chưa kết nối được dịch vụ đăng nhập.') from None
