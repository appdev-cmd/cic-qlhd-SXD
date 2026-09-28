"""Explicit administrative SQL and baseline capture; credentials come from the environment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.request


def query(sql, read_only=True):
    project = os.environ['SUPABASE_PROJECT_REF']
    request = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{project}/database/query',
        data=json.dumps({'query': sql, 'read_only': read_only}).encode(),
        headers={'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN'],
                 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Database diagnostics can include SQL containing credentials. Never print them.
        raise RuntimeError(f'Management API rejected SQL (HTTP {error.code}).') from None


def baseline(destination):
    destination.mkdir(parents=True, exist_ok=False)
    metadata = query("""select json_build_object(
      'columns',(select json_agg(c) from (select table_schema,table_name,column_name,
         data_type,udt_name,is_nullable,column_default,is_identity,identity_generation
         from information_schema.columns where table_schema='public'
         order by table_name,ordinal_position)c),
      'constraints',(select json_agg(c) from (select conrelid::regclass::text as relation,
         conname,pg_get_constraintdef(oid) as definition from pg_constraint
         where connamespace='public'::regnamespace)c),
      'indexes',(select json_agg(i) from pg_indexes i where schemaname='public'),
      'policies',(select json_agg(p) from pg_policies p where schemaname in ('public','storage')),
      'functions',(select json_agg(f) from (select p.proname,pg_get_functiondef(p.oid) as definition,
         p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prokind='f')f),
      'relations',(select json_agg(r) from (select c.relname,c.relkind,c.relrowsecurity,
         c.relacl::text as acl,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind in ('r','v','S'))r),
      'views',(select json_agg(v) from pg_views v where schemaname='public'),
      'triggers',(select json_agg(t) from (select pg_get_triggerdef(t.oid) as definition
         from pg_trigger t join pg_class c on c.oid=t.tgrelid
         join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal)t),
      'buckets',(select coalesce(json_agg(b),'[]'::json) from storage.buckets b)
    ) as metadata""")
    (destination / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    tables = query("select tablename from pg_tables where schemaname='public' order by tablename")
    manifest = []
    for table in tables:
        name = table['tablename']
        quoted = '"' + name.replace('"', '""') + '"'
        count = query(f'select count(*) as n from public.{quoted}')[0]['n']
        rows = []
        for offset in range(0, count, 500):
            rows.extend(query(f'select * from public.{quoted} order by 1 limit 500 offset {offset}'))
        path = destination / (name + '.json')
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        manifest.append({'table': name, 'rows': len(rows), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'backup': str(destination), 'tables': len(manifest), 'rows': sum(x['rows'] for x in manifest)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline')
    parser.add_argument('--sql')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.baseline:
        baseline(Path(args.baseline))
    elif args.sql:
        print(json.dumps(query(Path(args.sql).read_text(encoding='utf-8-sig'), not args.apply), ensure_ascii=False))
    else:
        parser.error('Provide --baseline or --sql. Writes require --apply.')
