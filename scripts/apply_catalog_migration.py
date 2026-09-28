"""Apply the approved catalog migration with a transactional dry run and ledger."""

from pathlib import Path
import re
from supabase_admin import query

name = '20260927000010_catalog_commands.sql'
if query("select version from public.schema_migrations where version='" + name + "'"):
    print('Catalog migration already applied.')
else:
    body = (Path(__file__).resolve().parents[1] / 'supabase/migrations' / name).read_text(encoding='utf-8')
    body = re.sub(r'(?im)^(begin|commit);\s*$', '', body)
    sql = 'begin;\n' + body + "\ninsert into public.schema_migrations(version) values('" + name + "');\n"
    query(sql + 'rollback;', False)
    query(sql + 'commit;', False)
    print('Catalog migration applied; ledger recorded.')
