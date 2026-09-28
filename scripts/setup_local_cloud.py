"""Provision an isolated local staging login without rotating existing credentials."""

import json
import os
from pathlib import Path
import secrets
from urllib.parse import urlparse, quote
from verify_schema import load_environment
from supabase_admin import query
from bootstrap_cloud import request


def main():
    load_environment()
    private = Path.home() / '.config/buildappraisal'
    private.mkdir(parents=True, exist_ok=True)
    runtime = private / 'runtime.env'
    if runtime.exists():
        raise RuntimeError('Private runtime already exists; inspect and reuse it instead of rotating credentials.')
    ref = os.environ['SUPABASE_PROJECT_REF']
    role = 'appraisal_local_' + secrets.token_hex(4)
    password = secrets.token_urlsafe(36)
    query(
        "create role "
        + role
        + " login inherit nosuperuser nocreatedb nocreaterole nobypassrls password '"
        + password
        + "'; grant appraisal_backend to "
        + role
        + ';',
        False,
    )
    base = urlparse(os.environ['DATABASE_URL'])
    url = (
        'postgresql://'
        + role
        + '.'
        + ref
        + ':'
        + quote(password, safe='')
        + '@'
        + base.hostname
        + ':'
        + str(base.port or 6543)
        + '/postgres'
    )
    # Persist immediately so retries retain the newly provisioned login.
    runtime.write_text(
        'APPRAISAL_MODE=cloud\nAPPRAISAL_ENVIRONMENT=staging\nAPPRAISAL_DATABASE_URL=' + url + '\n', encoding='utf-8'
    )
    keys = request(
        f'https://api.supabase.com/v1/projects/{ref}/api-keys',
        {'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']},
    )
    service = next(k['api_key'] for k in keys if k['name'] == 'service_role')
    headers = {'apikey': service, 'Authorization': 'Bearer ' + service, 'Content-Type': 'application/json'}
    saved = {'projectRef': ref, 'accounts': []}
    accounts = private / 'test-accounts.json'
    if accounts.exists():
        raise RuntimeError('Dedicated test accounts already exist; reuse the private file.')
    for identity, label in [
        ('officer', 'Chuyên viên thử nghiệm'),
        ('head_of_department', 'Trưởng phòng thử nghiệm'),
        ('director', 'Lãnh đạo Sở thử nghiệm'),
        ('admin', 'Quản trị thử nghiệm'),
    ]:
        email = identity.replace('_', '-') + '.' + secrets.token_hex(5) + '@buildappraisal.test'
        password = secrets.token_urlsafe(32)
        user = request(
            f'https://{ref}.supabase.co/auth/v1/admin/users',
            headers,
            {
                'email': email,
                'password': password,
                'email_confirm': True,
                'user_metadata': {'full_name': label},
                'app_metadata': {'staging_test_account': True},
            },
        )
        saved['accounts'].append(
            {'role': identity, 'name': label, 'email': email, 'password': password, 'user_id': user['id']}
        )
        accounts.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding='utf-8')
        q = lambda v: "'" + v.replace("'", "''") + "'"
        uid, name, mail, scope = map(q, [user['id'], label, email, identity])
        query(
            f"""begin;
        insert into public.profiles(id,full_name,email,role,province_id,department,is_active)
        values({uid}::uuid,{name},{mail},{scope},'DB','Phòng Quản lý Xây dựng',true);
        insert into public.staff_users(id,full_name,title,department,role,email,province_code,is_active,auth_user_id)
        values('auth-'||{uid},{name},{name},'Phòng Quản lý Xây dựng',{scope},{mail},'DB',true,{uid}::uuid);
        commit;""",
            False,
        )
    with runtime.open('a', encoding='utf-8') as f:
        f.write('APPRAISAL_ENABLE_TEST_LOGIN=true\n')
    print(
        json.dumps(
            {
                'runtime_file': str(runtime),
                'backend_role': role,
                'test_roles': [a['role'] for a in saved['accounts']],
                'emails_sent': False,
            }
        )
    )


if __name__ == '__main__':
    main()
