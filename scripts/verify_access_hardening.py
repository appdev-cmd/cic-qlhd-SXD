"""Cloud access checks with dedicated staging identities and rollback-only scope changes."""

import json
import os
from pathlib import Path
import sys
from uuid import uuid4
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from verify_schema import load_environment
from supabase_admin import query


def main():
    load_environment()
    sys.path[:0] = [str(Path('ai/.deps').resolve()), str(Path('ai').resolve())]
    from app.database import connection
    import httpx

    accounts = json.loads((Path.home() / '.config/buildappraisal/test-accounts.json').read_text())['accounts']
    base = os.getenv('SUPABASE_URL', os.environ['VITE_SUPABASE_URL'])
    key = os.getenv('SUPABASE_ANON_KEY', os.environ['VITE_SUPABASE_ANON_KEY'])
    checks = []
    for resource in ['projects', 'appraisal_cases', 'staff_users', 'audit_logs', 'appraisal_jobs']:
        response = httpx.get(
            base + '/rest/v1/' + resource, params={'select': 'id', 'limit': 1}, headers={'apikey': key}, timeout=20
        )
        assert response.status_code in (401, 403), 'Anonymous table read allowed.'
    checks.append('anonymous_tables_denied')
    for account in accounts:
        signed = httpx.post(
            base + '/auth/v1/token?grant_type=password',
            headers={'apikey': key},
            json={k: account[k] for k in ('email', 'password')},
            timeout=20,
        )
        assert signed.status_code == 200, 'Dedicated sign-in failed.'
        token = signed.json()['access_token']
        headers = {'apikey': key, 'Authorization': 'Bearer ' + token}
        profile = httpx.get(
            base + '/rest/v1/profiles',
            params={'select': 'id,role', 'id': 'eq.' + account['user_id']},
            headers=headers,
            timeout=20,
        )
        assert profile.status_code == 200 and profile.json()[0]['role'] == account['role']
        for name, arguments in [('claim_appraisal_job', {'worker_id': str(uuid4())}), ('persist_appraisal_case', {})]:
            response = httpx.post(base + '/rest/v1/rpc/' + name, headers=headers, json=arguments, timeout=20)
            assert response.status_code >= 400, 'Backend RPC exposed to browser.'
        with connection(account['user_id']) as con:
            assert con.execute('select count(*) as n from public.projects').fetchone()['n'] > 0
        checks.append('role_' + account['role'])
    with connection(str(uuid4())) as con:
        assert con.execute('select count(*) as n from public.projects').fetchone()['n'] == 0
        assert con.execute('select count(*) as n from public.appraisal_cases').fetchone()['n'] == 0
    checks.append('unknown_actor_denied')
    officer = next(a for a in accounts if a['role'] == 'officer')
    uid = "'" + officer['user_id'] + "'::uuid"
    for alteration, label in [
        ("province_id='QA_OTHER'", 'other_province_denied'),
        ("department='QA_OTHER'", 'other_department_denied'),
        ('is_active=false', 'inactive_actor_denied'),
    ]:
        # Only a marked staging test account can be changed, and the entire test rolls back.
        query(
            f"""begin;
        update public.profiles set {alteration} where id={uid} and exists(select 1 from auth.users u where u.id={uid} and u.raw_app_meta_data->>'staging_test_account'='true');
        select set_config('request.jwt.claim.sub',{uid}::text,true);
        do $$ begin
          if public.app_has_scope('DB','Phòng Quản lý Xây dựng')
            or public.appraisal_has_scope('DB','Phòng Quản lý Xây dựng') then
            raise exception 'Scope leaked'; end if;
        end $$;
        rollback;""",
            False,
        )
        checks.append(label)
    print(json.dumps({'passed': checks, 'scope_changes': 'rolled_back', 'passwords_printed': False}))


if __name__ == '__main__':
    main()
