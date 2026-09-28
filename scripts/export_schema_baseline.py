"""Export a schema-only public baseline from catalog metadata; no rows or credentials."""
from collections import defaultdict
import json
from pathlib import Path
from verify_schema import load_environment
from supabase_admin import query

ROOT=Path(__file__).resolve().parents[1]
identifier=lambda s:'"'+s.replace('"','""')+'"'
literal=lambda s:"'"+s.replace("'","''")+"'"


def main():
    load_environment()
    columns=query("""select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,
      pg_get_expr(d.adbin,d.adrelid) as default_value,a.attidentity,a.attgenerated
      from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum""")
    tables=defaultdict(list)
    for c in columns:tables[c['relname']].append(c)
    sql=['-- Baseline schema cloud 28/09/2026; không chứa dữ liệu/credential.',
         '-- Chỉ áp vào database Supabase trống. Database hiện hữu dùng migration tăng dần.',
         'begin;',"set local check_function_bodies=off;",
         'create schema if not exists extensions;',
         'create extension if not exists "uuid-ossp" with schema extensions;',
         'create extension if not exists pgcrypto with schema extensions;',
         'create extension if not exists unaccent with schema extensions;',
         "do $$ begin if not exists(select 1 from pg_roles where rolname='appraisal_backend') then create role appraisal_backend nologin inherit nosuperuser nocreatedb nocreaterole nobypassrls; end if; end $$;",
         'grant authenticated to appraisal_backend;','grant usage on schema public to authenticated,appraisal_backend;']
    sequences=query("""select s.* from pg_sequences s where schemaname='public' and not exists(
      select 1 from pg_depend d where d.objid=(quote_ident(s.schemaname)||'.'||quote_ident(s.sequencename))::regclass and d.deptype='i')
      order by sequencename""")
    for sequence in sequences:
        sql.append('create sequence public.'+identifier(sequence['sequencename'])+' as '+sequence['data_type']+
                   ' increment by '+str(sequence['increment_by'])+' minvalue '+str(sequence['min_value'])+
                   ' maxvalue '+str(sequence['max_value'])+' start with '+str(sequence['start_value'])+
                   ' cache '+str(sequence['cache_size'])+(' cycle;' if sequence['cycle'] else ' no cycle;'))
    for name,fields in tables.items():
        definitions=[]
        for c in fields:
            definition=identifier(c['attname'])+' '+c['type']
            if c['attidentity']:definition+=' generated '+('always' if c['attidentity']=='a' else 'by default')+' as identity'
            elif c['attgenerated']:definition+=' generated always as ('+c['default_value']+') stored'
            elif c['default_value'] is not None:definition+=' default '+c['default_value']
            if c['attnotnull']:definition+=' not null'
            definitions.append(definition)
        sql.append('create table public.'+identifier(name)+' (\n  '+',\n  '.join(definitions)+'\n);')
    owners=query("""select s.relname as sequence,t.relname as relation,a.attname as column_name from pg_depend d
      join pg_class s on s.oid=d.objid join pg_namespace n on n.oid=s.relnamespace
      join pg_class t on t.oid=d.refobjid join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
      where n.nspname='public' and s.relkind='S' and d.deptype='a'""")
    sql.extend('alter sequence public.'+identifier(o['sequence'])+' owned by public.'+identifier(o['relation'])+'.'+identifier(o['column_name'])+';' for o in owners)
    functions=query("""select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.proname,p.oid""")
    sql.extend(f['definition'].rstrip().rstrip(';')+';' for f in functions)
    constraints=query("select conrelid::regclass::text as relation,conname,pg_get_constraintdef(oid) as definition,contype from pg_constraint where connamespace='public'::regnamespace order by (contype='f'),conrelid,conname")
    sql.extend('alter table '+c['relation']+' add constraint '+identifier(c['conname'])+' '+c['definition']+';' for c in constraints)
    indexes=query("""select i.indexdef from pg_indexes i where schemaname='public'
      and not exists(select 1 from pg_constraint c where c.conindid=(quote_ident(i.schemaname)||'.'||quote_ident(i.indexname))::regclass) order by indexname""")
    sql.extend(i['indexdef']+';' for i in indexes)
    views=query("select v.viewname,v.definition,c.reloptions from pg_views v join pg_class c on c.relname=v.viewname join pg_namespace n on n.oid=c.relnamespace where v.schemaname='public' and n.nspname='public'")
    sql.extend('create view public.'+identifier(v['viewname'])+(' with ('+','.join(v['reloptions'])+')' if v['reloptions'] else '')+' as '+v['definition'] for v in views)
    triggers=query("select pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal")
    sql.extend(t['definition']+';' for t in triggers)
    for name in tables:sql.append('alter table public.'+identifier(name)+' enable row level security;')
    policies=query("select schemaname,tablename,policyname,permissive,array_to_json(roles) as roles,cmd,qual,with_check from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects') order by schemaname,tablename,policyname")
    for p in policies:
        if 'anon' in p['roles'] or p['policyname'] in ('dev_open_access','anon_dev_read'):raise RuntimeError('Unsafe anonymous policy; baseline refused.')
        statement='create policy '+identifier(p['policyname'])+' on '+identifier(p['schemaname'])+'.'+identifier(p['tablename'])+' as '+p['permissive']+' for '+p['cmd']+' to '+','.join(identifier(r) for r in p['roles'])
        if p['qual']:statement+=' using ('+p['qual']+')'
        if p['with_check']:statement+=' with check ('+p['with_check']+')'
        sql.append(statement+';')
    sql.extend(['revoke all on all tables in schema public from anon,authenticated;',
                'revoke all on all sequences in schema public from anon,authenticated;',
                'revoke execute on all functions in schema public from public,anon,authenticated;',
                'alter default privileges in schema public revoke all on tables from anon,authenticated;',
                'alter default privileges in schema public revoke all on sequences from anon,authenticated;',
                'alter default privileges in schema public revoke execute on functions from public,anon,authenticated;'])
    grants=query("""select case when c.relkind='S' then 'sequence' else 'table' end as kind,c.oid::regclass::text as target,r.rolname,a.privilege_type from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid=a.grantee where n.nspname='public' and c.relkind in ('r','v','S') and r.rolname in ('authenticated','appraisal_backend')
      union all select 'function',p.oid::regprocedure::text,r.rolname,a.privilege_type from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee where n.nspname='public' and r.rolname in ('authenticated','appraisal_backend') order by 1,2,3,4""")
    sql.extend('grant '+g['privilege_type']+' on '+g['kind']+' '+g['target']+' to '+identifier(g['rolname'])+';' for g in grants)
    for b in query("select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('appraisal-originals','appraisal-project-images')"):
        if b['public']:raise RuntimeError('Public bucket; baseline refused.')
        limit=str(b['file_size_limit']) if b['file_size_limit'] is not None else 'null'
        mime="array["+','.join(literal(m) for m in b['allowed_mime_types'])+']::text[]' if b['allowed_mime_types'] is not None else 'null'
        sql.append('insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('+literal(b['id'])+','+literal(b['name'])+',false,'+limit+','+mime+') on conflict(id) do nothing;')
    for row in query('select version from public.schema_migrations order by version'):
        sql.append('insert into public.schema_migrations(version) values('+literal(row['version'])+');')
    sql.append('commit;')
    destination=ROOT/'supabase/baselines/20260928.sql';destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text('\n\n'.join(sql)+'\n',encoding='utf-8')
    print(json.dumps({'baseline':str(destination),'tables':len(tables),'functions':len(functions),'policies':len(policies),'includes_data':False}))


if __name__=='__main__':main()
