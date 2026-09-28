"""Restore private application JSON backups only in an isolated loopback test DB."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'ai/.deps')]
import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb


def main():
    parser=argparse.ArgumentParser();parser.add_argument('backup',type=Path);args=parser.parse_args()
    dsn=os.environ['BASELINE_TEST_DATABASE_URL'];parsed=urlparse(dsn)
    if parsed.hostname not in ('localhost','127.0.0.1','::1') or not parsed.path.startswith('/appraisal_baseline_test'):
        raise ValueError('Chỉ khôi phục vào DB kiểm thử cách ly cục bộ.')
    manifest=json.loads((args.backup/'manifest.json').read_text(encoding='utf-8'))
    tables={item['table']:item for item in manifest}
    with psycopg.connect(dsn) as con:
        for table in tables:
            if table!='schema_migrations':
                assert con.execute(sql.SQL('select count(*) from public.{}').format(sql.Identifier(table))).fetchone()[0]==0,'DB phải chưa có dữ liệu nghiệp vụ.'
        con.execute("set local session_replication_role='replica'")
        profiles=json.loads((args.backup/'profiles.json').read_text(encoding='utf-8'))
        for profile in profiles:con.execute('insert into auth.users(id) values(%s) on conflict do nothing',(profile['id'],))
        con.execute('delete from public.schema_migrations')
        for table,item in tables.items():
            path=args.backup/(table+'.json');content=path.read_bytes()
            assert hashlib.sha256(content).hexdigest()==item['sha256']
            records=json.loads(content);assert len(records)==item['rows']
            columns={r[0] for r in con.execute("select column_name from information_schema.columns where table_schema='public' and table_name=%s",(table,))}
            assert all(set(record)==columns for record in records),'Schema không khớp backup: '+table
            if records:
                con.execute(sql.SQL('insert into public.{} overriding system value select * from jsonb_populate_recordset(null::public.{},%s)').format(sql.Identifier(table),sql.Identifier(table)),(Jsonb(records),))
            # Compare typed SQL records: timestamp offsets and numeric formatting may differ in JSON.
            digest="select count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) from "
            actual=con.execute(sql.SQL(digest+'public.{} t').format(sql.Identifier(table))).fetchone()
            expected=con.execute(sql.SQL(digest+'jsonb_populate_recordset(null::public.{},%s) t').format(sql.Identifier(table)),(Jsonb(records),)).fetchone()
            assert actual==expected,'Đối soát dữ liệu khôi phục thất bại: '+table
        for relation,column in [('ai_logs','id'),('audit_logs','id'),('workflow_transitions','id'),('appraisal_audit_logs','id'),('appraisal_ai_logs','id')]:
            con.execute(sql.SQL("select setval(pg_get_serial_sequence(%s,%s),coalesce((select max({}) from public.{}),1),(select count(*)>0 from public.{}))").format(sql.Identifier(column),sql.Identifier(relation),sql.Identifier(relation)),(relation,column))
        con.execute("set local session_replication_role='origin'")
        # Force foreign-key validation after restoring with triggers suppressed.
        constraints=con.execute("select conrelid::regclass::text,conname,pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and contype='f'").fetchall()
        for relation,name,definition in constraints:
            target=sql.Identifier('public',relation.removeprefix('public.'))
            con.execute(sql.SQL('alter table {} drop constraint {}').format(target,sql.Identifier(name)))
            con.execute(sql.SQL('alter table {} add constraint {} '+definition).format(target,sql.Identifier(name)))
        print(json.dumps({'tables':len(tables),'rows':sum(t['rows'] for t in tables.values()),'allRowsMatched':True,'foreignKeysValidated':len(constraints),'authUsers':'ID stubs only','storageOriginalsRestored':False}))


if __name__=='__main__':main()
