"""Provision the initial Auth administrator and apply the reviewed G0 migration atomically."""

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import urllib.request
from supabase_admin import query


def request(url, headers, body=None):
    req = urllib.request.Request(
        url,
        headers=headers,
        data=json.dumps(body).encode() if body is not None else None,
        method='POST' if body is not None else 'GET',
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            return json.load(response)
    except Exception as error:
        raise RuntimeError('Bootstrap API call failed: ' + type(error).__name__) from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--credentials-file', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    credentials_path = Path(args.credentials_file)
    ref = os.environ['SUPABASE_PROJECT_REF']
    email = os.environ['APPRAISAL_ADMIN_EMAIL'].strip().lower()
    if credentials_path.exists():
        credentials = json.loads(credentials_path.read_text(encoding='utf-8'))
        if credentials['email'] != email:
            raise RuntimeError('Existing bootstrap file belongs to a different account.')
    else:
        keys = request(
            f'https://api.supabase.com/v1/projects/{ref}/api-keys',
            {'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']},
        )
        service_key = next(k['api_key'] for k in keys if k['name'] == 'service_role')
        password = secrets.token_urlsafe(24)
        user = request(
            f'https://{ref}.supabase.co/auth/v1/admin/users',
            {'apikey': service_key, 'Authorization': 'Bearer ' + service_key, 'Content-Type': 'application/json'},
            {
                'email': email,
                'password': password,
                'email_confirm': True,
                'user_metadata': {'full_name': 'Quản trị hệ thống'},
                'app_metadata': {'bootstrap_account': True},
            },
        )
        credentials = {'email': email, 'password': password, 'user_id': user['id']}
        credentials_path.write_text(json.dumps(credentials, ensure_ascii=False, indent=2), encoding='utf-8')
    migrations = ['20260927000002_appraisal_workspace.sql', '20260927000003_security_identity.sql']
    chunks = []
    for name in migrations:
        sql = (root / 'supabase/migrations' / name).read_text(encoding='utf-8-sig')
        chunks.append(re.sub(r'(?im)^(begin|commit);\s*$', '', sql))
    # Values are generated UUID and a user-supplied email, always SQL-quoted.
    quote = lambda value: "'" + value.replace("'", "''") + "'"
    uid = quote(credentials['user_id'])
    mail = quote(email)
    chunks.append(f"""
      insert into public.profiles(id,full_name,email,role,province_id,department,is_active)
      values({uid}::uuid,'Quản trị hệ thống',{mail},'admin','DB','Phòng Quản lý Xây dựng',true);
      insert into public.staff_users(id,full_name,title,department,role,email,province_code,is_active,auth_user_id)
      values('auth-'||{uid},'Quản trị hệ thống','Quản trị hệ thống','Phòng Quản lý Xây dựng',
             'admin',{mail},'DB',true,{uid}::uuid);
    """)
    for name in migrations:
        chunks.append(f'insert into public.schema_migrations(version) values({quote(name)});')
    sql = 'begin;\n' + '\n'.join(chunks)
    # First exercise the exact DDL and bootstrap data with rollback before committing.
    query(sql + '\nrollback;', read_only=False)
    if args.apply:
        query(sql + '\ncommit;', read_only=False)
    print(
        json.dumps(
            {
                'ddl_validated': True,
                'applied': args.apply,
                'admin_email': email,
                'credentials_file': str(credentials_path),
            },
            ensure_ascii=False,
        )
    )


if __name__ == '__main__':
    main()
