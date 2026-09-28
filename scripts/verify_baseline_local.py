"""Replay the baseline only in an empty, isolated loopback PostgreSQL database."""

import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ai/.deps')]
import psycopg


def main():
    dsn = os.environ['BASELINE_TEST_DATABASE_URL']
    parsed = urlparse(dsn)
    if parsed.hostname not in ('localhost', '127.0.0.1', '::1') or not parsed.path.startswith(
        '/appraisal_baseline_test'
    ):
        raise ValueError('Chỉ chạy trên DB appraisal_baseline_test cục bộ cách ly.')
    with psycopg.connect(dsn, autocommit=True) as con:
        assert not con.execute("select 1 from pg_tables where schemaname in ('public','auth','storage')").fetchone(), (
            'DB kiểm thử phải trống.'
        )
        con.execute((ROOT / 'scripts/sql/supabase_test_prerequisites.sql').read_text(encoding='utf-8'))
        con.execute((ROOT / 'supabase/baselines/20260928.sql').read_text(encoding='utf-8'))
        tables = con.execute("select count(*) from pg_tables where schemaname='public'").fetchone()[0]
        policies = con.execute("select count(*) from pg_policies where schemaname in ('public','storage')").fetchone()[
            0
        ]
        sequences = con.execute("select count(*) from pg_sequences where schemaname='public'").fetchone()[0]
        assert (tables, policies, sequences) == (22, 33, 5)
        assert (
            con.execute(
                "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity"
            ).fetchone()[0]
            == 0
        )
        assert not con.execute("select has_table_privilege('anon','public.projects','select')").fetchone()[0]
        assert not con.execute(
            "select has_function_privilege('authenticated','public.save_project_images(text,integer,jsonb)','execute')"
        ).fetchone()[0]
        assert con.execute(
            "select has_function_privilege('appraisal_backend','public.save_project_images(text,integer,jsonb)','execute')"
        ).fetchone()[0]
        assert con.execute("select count(*) from storage.buckets where public").fetchone()[0] == 0
        assert con.execute("select public.f_unaccent('Điện Biên')").fetchone()[0] == 'Dien Bien'
        assert con.execute("select public.add_working_days('2026-09-25'::date,1)::text").fetchone()[0] == '2026-09-28'
        assert not con.execute(
            "select rolbypassrls or rolsuper from pg_roles where rolname='appraisal_backend'"
        ).fetchone()[0]
        # The baseline must contain no business records. Only the ledger is populated.
        for (name,) in con.execute(
            "select tablename from pg_tables where schemaname='public' and tablename<>'schema_migrations'"
        ):
            assert (
                con.execute(
                    psycopg.sql.SQL('select count(*) from public.{}').format(psycopg.sql.Identifier(name))
                ).fetchone()[0]
                == 0
            )
        print(
            json.dumps(
                {
                    'tables': tables,
                    'policies': policies,
                    'sequences': sequences,
                    'rls': True,
                    'anonymous_denied': True,
                    'baseline_replayed': True,
                    'supabase_prerequisites': 'test_stubs',
                }
            )
        )


if __name__ == '__main__':
    main()
