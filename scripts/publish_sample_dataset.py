"""Replace the synthetic submissions of cloud staging with the local sample dataset (scripts/sample_dataset.py).

    python scripts/publish_sample_dataset.py --staging [--apply] [--replace]

Dry-run by default. With --apply:
1. Snapshot every synthetic case (payload.sample = true) and its audit/AI/job/upload rows outside the repo.
2. Upsert the sample projects (new projects, field, investment form, decided-by-commune flag).
3. Delete only synthetic cases and their dependent rows in one transaction; real submissions are untouched.
4. Insert the sample-v3 cases with their audit trail, upload originals to private Storage, and
   recompute SLA facts with the cloud holiday calendar and the cloud project classification.
Uploaded originals of removed synthetic cases stay in Storage (not deleted).
An interrupted run resumes (existing sample-v3 ids are skipped); --replace republishes a regenerated dataset.
"""

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from supabase_admin import query
from verify_schema import load_environment

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ai/.deps'), str(ROOT / 'ai')]
sys.stdout.reconfigure(encoding='utf-8')
SEED = 'sample-v3'
PROCEDURE_TYPES = {'bcnckt': 'tham_dinh_bcnckt', 'gpxd': 'cap_gpxd', 'nghiem_thu': 'kiem_tra_nghiem_thu'}


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def http(url, headers, body=None, method='GET'):
    request = urllib.request.Request(url, headers=headers, data=body, method=method)
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def project_sql(p):
    columns = {
        'id': p['id'],
        'code': p['code'],
        'title': p['name'],
        'field': p.get('field') or 'Dân dụng',
        'group_type': p['projectGroup'],
        'grade': p['buildingGrade'],
        'investment_cost': p.get('totalInvestment') or 0,
        'procedure_type': PROCEDURE_TYPES.get(p['stage'], 'tham_dinh_bcnckt'),
        'location_district': p['location'],
        'stage': p['stage'],
        'investment_form': p.get('investmentForm') or 'dau_tu_cong',
        'department': p['department'],
        'investor_name': p['investorName'],
        'lead_reviewer_name': p.get('assignee'),
        'submission_date': p['submissionDate'],
        'deadline': p.get('deadlineDate') or None,
        'decided_by_commune': bool(p.get('decidedByCommune')),
        'fire_safety_status': p.get('fireSafetyStatus'),
        'thumbnail_url': p.get('coverImage'),
        'sla_status': p.get('slaStatus') or 'tiep_nhan',
    }
    jsonb = {
        'images': p.get('images') or [],
        'contractors': p.get('contractors') or [],
        'tt39_data': p.get('tt39_data') or {},
    }
    names = list(columns) + list(jsonb)
    values = [
        ('null' if v is None else 'true' if v is True else 'false' if v is False else quote(v))
        for v in columns.values()
    ]
    values += [quote(json.dumps(v, ensure_ascii=False)) + '::jsonb' for v in jsonb.values()]
    updates = ','.join(f'{n}=excluded.{n}' for n in names if n not in ('id', 'code', 'images'))
    return f"insert into public.projects({','.join(names)}) values({','.join(values)}) on conflict (code) do update set {updates};"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--staging', action='store_true', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--replace', action='store_true', help='replace a previously published sample-v3 dataset')
    parser.add_argument('--data-dir', default=str(ROOT / '.appraisal-data'))
    args = parser.parse_args()
    load_environment()
    data_dir = Path(args.data_dir)
    projects = {p['code']: p for p in json.loads((data_dir / 'projects.json').read_text(encoding='utf-8'))}
    con = sqlite3.connect((data_dir / 'appraisal.sqlite').as_uri() + '?mode=ro', uri=True)
    rows = [json.loads(r[0]) for r in con.execute('select payload from cases')]
    cases = [c for c in rows if c.get('seedVersion') == SEED]
    cases.sort(key=lambda c: (c.get('createdAt') or '', c.get('submissionRound') or 1))
    for case in cases:
        for doc in case['documents']:
            data = con.execute('select data from files where case_id=? and id=?', (case['id'], doc['id'])).fetchone()
            if not data or hashlib.sha256(data[0]).hexdigest() != doc['hash']:
                raise SystemExit('Tệp gốc cục bộ không khớp hash: ' + doc['name'])
    old = query("select id from public.appraisal_cases where coalesce((payload->>'sample')::boolean,false)")
    real = query(
        "select count(*) n from public.appraisal_cases where not coalesce((payload->>'sample')::boolean,false)"
    )[0]['n']
    print(
        json.dumps(
            {
                'sample_v3_cases': len(cases),
                'cloud_synthetic_to_replace': len(old),
                'cloud_real_kept': real,
                'projects': len(projects),
                'apply': args.apply,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    if not args.apply:
        return
    resume = not args.replace and bool(
        query(f"select 1 from public.appraisal_cases where payload->>'seedVersion'={quote(SEED)} limit 1")
    )

    # 1. Snapshot (skipped when resuming: the synthetic rows were already replaced).
    folder = (
        Path.home()
        / '.config/buildappraisal/backups'
        / (datetime.now().strftime('%Y%m%d-%H%M%S') + '-cloud-before-' + SEED)
    )
    folder.mkdir(parents=True)
    synthetic = "select id from public.appraisal_cases where coalesce((payload->>'sample')::boolean,false)"
    snapshot = {
        'cases': query(f'select * from public.appraisal_cases where id in ({synthetic})'),
        'audit_logs': query(f'select * from public.appraisal_audit_logs where case_id in ({synthetic})'),
        'ai_logs': query(f'select * from public.appraisal_ai_logs where case_id in ({synthetic})'),
        'jobs': query(f'select * from public.appraisal_jobs where case_id in ({synthetic})'),
        'upload_sessions': query(f'select * from public.appraisal_upload_sessions where case_id in ({synthetic})'),
        'dossiers': query(
            f'select * from public.appraisal_dossiers where id in (select dossier_id from public.appraisal_cases where id in ({synthetic}))'
        ),
        'projects': query('select * from public.projects'),
    }
    data = json.dumps(snapshot, ensure_ascii=False, default=str).encode()
    if not resume:
        (folder / 'snapshot.json').write_bytes(data)
    (folder / 'manifest.json').write_text(
        json.dumps({k: len(v) for k, v in snapshot.items()} | {'sha256': hashlib.sha256(data).hexdigest()}),
        encoding='utf-8',
    )
    print(json.dumps({'snapshot': str(folder)}, ensure_ascii=False), flush=True)

    # 2. Projects.
    if resume:
        print(json.dumps({'resume': True}), flush=True)
    query('begin;\n' + '\n'.join(project_sql(p) for p in projects.values()) + '\ncommit;', False)

    # 3. Remove synthetic cases and dependents in one transaction.
    if not resume:
        query(
            f"""begin;
      create temporary table doomed on commit drop as {synthetic};
      create temporary table doomed_dossiers on commit drop as
        select distinct dossier_id as id from public.appraisal_cases where id in (select id from doomed);
      delete from public.appraisal_upload_sessions where case_id in (select id from doomed);
      delete from public.appraisal_jobs where case_id in (select id from doomed);
      delete from public.appraisal_ai_logs where case_id in (select id from doomed);
      delete from public.appraisal_audit_logs where case_id in (select id from doomed);
      delete from public.appraisal_cases where id in (select id from doomed);
      delete from public.appraisal_dossiers where id in (select id from doomed_dossiers)
        and not exists (select 1 from public.appraisal_cases c where c.dossier_id = appraisal_dossiers.id);
      commit;""",
            False,
        )
    existing = {
        r['id']: r['revision']
        for r in query(
            f"select id::text,revision from public.appraisal_cases where payload->>'seedVersion'={quote(SEED)}"
        )
    }

    # 4. Insert sample-v3 with cloud calendar and classification.
    from app.sla import Calendar, compute

    holidays = query('select holiday_date,kind,is_confirmed from public.holidays')
    calendar = Calendar(
        [(date.fromisoformat(h['holiday_date']), h['kind'], h['is_confirmed']) for h in holidays], 'public.holidays'
    )
    cloud_projects = {
        p['id']: p for p in query('select id,code,title,department,group_type,grade from public.projects')
    }
    admin = json.loads((Path.home() / '.config/buildappraisal/test-accounts.json').read_text(encoding='utf-8'))
    admin_id = next(a['user_id'] for a in admin['accounts'] if a['role'] == 'admin')
    ref = os.environ['SUPABASE_PROJECT_REF']
    base = f'https://{ref}.supabase.co'
    keys = json.loads(
        http(
            f'https://api.supabase.com/v1/projects/{ref}/api-keys',
            {'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']},
        )
    )
    service = next(k['api_key'] for k in keys if k['name'] == 'service_role')
    headers = {
        'apikey': service,
        'Authorization': 'Bearer ' + service,
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
    }

    def upload(item):
        case_id, doc_id, blob = item
        http(base + '/storage/v1/object/appraisal-originals/' + case_id + '/' + doc_id, headers, blob, 'POST')

    uploaded = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for index, case in enumerate(cases):
            if case['id'] in existing:
                continue
            project = cloud_projects[case['projectId']]
            if case.get('previousSubmissionId'):
                # The predecessor was published with one extra audit event (revision + 1).
                case['previousRevision'] = existing[case['previousSubmissionId']]
            files = [
                (
                    case['id'],
                    d['id'],
                    con.execute('select data from files where case_id=? and id=?', (case['id'], d['id'])).fetchone()[0],
                )
                for d in case['documents']
            ]
            list(pool.map(upload, files))
            uploaded += len(files)
            case['tenantId'] = 'DB'
            case['department'] = project['department']
            case.update(projectName=project['title'], projectCode=project['code'])
            case['sla'] = compute(case, calendar, {'group': project['group_type'], 'grade': project['grade']})
            case['audit'].append(
                {
                    'id': str(uuid4()),
                    'at': datetime.now(timezone.utc).isoformat(),
                    'actor': 'Quản trị hệ thống',
                    'action': 'Nạp bộ dữ liệu mẫu ' + SEED,
                    'detail': 'Dữ liệu mô phỏng theo NĐ 217/2026, NĐ 207/2026; không phải hồ sơ hoặc kết quả pháp lý.',
                }
            )
            case['revision'] += 1
            payload = quote(json.dumps(case, ensure_ascii=False)) + '::jsonb'
            # auth.uid() of the staging admin: the lineage trigger checks the predecessor's scope.
            query(
                f"""begin;
              select set_config('request.jwt.claim.sub',{quote(admin_id)},true);
              insert into public.appraisal_cases(id,province_id,department,revision,payload,project_id,procedure,created_at,updated_at)
              values({quote(case['id'])}::uuid,'DB',{quote(case['department'])},{case['revision']},{payload},{quote(case['projectId'])},
                     {quote(case['procedure'])},{quote(case['createdAt'])}::timestamptz,{quote(case['updatedAt'])}::timestamptz);
              insert into public.appraisal_audit_logs(case_id,actor_id,actor_name,revision,event)
              select id,{quote(admin_id)}::uuid,'Quản trị hệ thống',revision,payload->'audit'->-1
              from public.appraisal_cases where id={quote(case['id'])}::uuid;
              insert into public.appraisal_ai_logs(case_id,actor_id,run_id,run)
              select id,{quote(admin_id)}::uuid,r->>'id',r
              from public.appraisal_cases c cross join lateral jsonb_array_elements(c.payload->'runs') r
              where c.id={quote(case['id'])}::uuid;
              commit;""",
                False,
            )
            existing[case['id']] = case['revision']
            if (index + 1) % 10 == 0:
                print(json.dumps({'inserted': index + 1, 'total': len(cases)}), flush=True)
    print(
        json.dumps(
            {'completed': True, 'cases': len(cases), 'files': uploaded, 'snapshot': str(folder)}, ensure_ascii=False
        )
    )


if __name__ == '__main__':
    main()
