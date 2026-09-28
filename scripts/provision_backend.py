"""Provision a least-privilege database login; never emit credentials."""

import json
import os
from pathlib import Path
import re
import secrets
from urllib.parse import quote
from supabase_admin import query

root = Path(__file__).resolve().parents[1]
name = '20260927000004_backend_persistence.sql'
sql = (root / 'supabase/migrations' / name).read_text(encoding='utf-8')
body = re.sub(r'(?im)^(begin|commit);\s*$', '', sql)
query('begin;\n' + body + '\nrollback;', read_only=False)
password = secrets.token_urlsafe(36)
query(
    'begin;\n'
    + body
    + "\nalter role appraisal_backend login password '"
    + password
    + "';\n"
    + "insert into public.schema_migrations(version) values('"
    + name
    + "');\ncommit;",
    read_only=False,
)
config = Path.home() / '.config/buildappraisal/runtime.env'
url = (
    'postgresql://appraisal_backend.cekaigfnriatarytvymb:'
    + quote(password, safe='')
    + '@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
)
config.write_text('APPRAISAL_DATABASE_URL=' + url + '\n', encoding='utf-8')
print(json.dumps({'applied': name, 'config_file': str(config), 'role': 'appraisal_backend'}))
