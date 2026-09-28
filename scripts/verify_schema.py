"""Capture private schema evidence and apply one ledgered migration transactionally."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse
from supabase_admin import query

ROOT = Path(__file__).resolve().parents[1]


def load_environment():
    inherited = set(os.environ)
    for path in (
        ROOT / '.env',
        ROOT / '.env.local',
        Path(os.getenv('APPRAISAL_CONFIG_FILE', str(Path.home() / '.config/buildappraisal/runtime.env'))),
    ):
        if not path.is_file():
            continue
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            match = re.match(r'^([A-Z_][A-Z_0-9]*)=(.*)$', line)
            if match and match[1] not in inherited:
                os.environ[match[1]] = match[2].strip().strip('"\'')
    base = os.getenv('SUPABASE_URL', os.getenv('VITE_SUPABASE_URL', ''))
    os.environ.setdefault('SUPABASE_PROJECT_REF', urlparse(base).hostname.split('.')[0])


def capture(destination):
    destination.mkdir(parents=True, exist_ok=True)
    metadata = query("""select json_build_object(
      'columns',(select json_agg(c) from (select table_schema,table_name,column_name,
         data_type,udt_name,is_nullable,column_default,is_identity,identity_generation,ordinal_position
         from information_schema.columns where table_schema='public' order by table_name,ordinal_position)c),
      'constraints',(select json_agg(c) from (select conrelid::regclass::text as relation,conname,
         pg_get_constraintdef(oid) as definition from pg_constraint where connamespace='public'::regnamespace)c),
      'indexes',(select json_agg(i) from pg_indexes i where schemaname='public'),
      'policies',(select json_agg(p) from pg_policies p where schemaname in ('public','storage')),
      'functions',(select json_agg(f) from (select p.proname,pg_get_functiondef(p.oid) as definition,
         p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prokind='f')f),
      'relations',(select json_agg(r) from (select c.relname,c.relkind,c.relrowsecurity,c.relacl::text as acl,
         c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind in ('r','v','S'))r),
      'views',(select json_agg(v) from pg_views v where schemaname='public'),
      'triggers',(select json_agg(t) from (select pg_get_triggerdef(t.oid) as definition from pg_trigger t
         join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and not t.tgisinternal)t),
      'ledger',(select json_agg(version) from public.schema_migrations)
    ) as metadata""")[0]['metadata']
    (destination / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    tables = query("select tablename from pg_tables where schemaname='public' order by tablename")
    statements = []
    for table in tables:
        name = table['tablename']
        quoted = '"' + name.replace('"', '""') + '"'
        statements.append(
            "select '" + name.replace("'", "''") + "' as table_name,count(*) as rows,"
            "md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as fingerprint "
            'from public.' + quoted + ' t'
        )
    manifest = query(' union all '.join(statements))
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def apply_migration(path):
    path = path.resolve()
    if path.parent != (ROOT / 'supabase/migrations').resolve():
        raise ValueError('Migration must belong to this workspace.')
    name = path.name
    literal = "'" + name.replace("'", "''") + "'"
    if query('select version from public.schema_migrations where version=' + literal):
        return False
    body = re.sub(r'(?im)^\s*(begin|commit);\s*$', '', path.read_text(encoding='utf-8-sig'))
    sql = 'begin;\n' + body + '\ninsert into public.schema_migrations(version) values(' + literal + ');\n'
    query(sql + 'rollback;', False)
    query(sql + 'commit;', False)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--apply', type=Path)
    args = parser.parse_args()
    load_environment()
    if args.snapshot:
        manifest = capture(args.snapshot)
        print(
            json.dumps(
                {'snapshot': str(args.snapshot), 'tables': len(manifest), 'rows': sum(r['rows'] for r in manifest)}
            )
        )
    if args.apply:
        print(json.dumps({'migration': args.apply.name, 'applied': apply_migration(args.apply)}))


if __name__ == '__main__':
    main()
