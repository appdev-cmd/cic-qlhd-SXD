"""Durable leased analysis queue shared by API processes and restarts."""

import json
import threading
import time
import uuid
from .store import MODE, Store, db
from .database import connection

_started = False
_lock = threading.Lock()
_stop = threading.Event()


def claim(worker):
    if MODE == 'demo':
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            con.execute(
                "update jobs set state='failed',lease_until=null where state='running' and lease_until<? and attempts>=3",
                (time.time(),),
            )
            row = con.execute(
                "select id,case_id,actor,snapshot from jobs where (state='queued' or (state='running' and lease_until<?)) and attempts<3 order by created_at limit 1",
                (time.time(),),
            ).fetchone()
            if not row:
                return None
            con.execute(
                "update jobs set state='running',attempts=attempts+1,lease_owner=?,lease_until=? where id=?",
                (worker, time.time() + 180, row[0]),
            )
            return {'id': row[0], 'case_id': row[1], 'actor': json.loads(row[2]), 'snapshot': json.loads(row[3])}
    with connection() as con:
        job = con.execute('select * from public.claim_appraisal_job(%s)', (worker,)).fetchone()
    if not job:
        return None
    with connection(job['actor_id']) as con:
        actor = con.execute(
            'select id,full_name,province_id,department,role from public.profiles where id=%s and is_active is true',
            (job['actor_id'],),
        ).fetchone()
    if not actor:
        finish(job['id'], worker, 'failed')
        return None
    job['actor'] = {
        'id': str(actor['id']),
        'name': actor['full_name'],
        'tenantId': actor['province_id'],
        'department': actor['department'],
        'role': actor['role'],
    }
    job['id'] = str(job['id'])
    job['case_id'] = str(job['case_id'])
    return job


def finish(id, worker, state):
    if MODE == 'demo':
        with db() as con:
            con.execute(
                "update jobs set state=?,lease_until=null where id=? and lease_owner=? and state='running'",
                (state, id, worker),
            )
    else:
        with connection() as con:
            con.execute('select public.finish_appraisal_job(%s,%s,%s)', (id, worker, state))


def keep_lease(id, worker, done):
    while not done.wait(20):
        try:
            if MODE == 'demo':
                with db() as con:
                    con.execute(
                        "update jobs set lease_until=? where id=? and lease_owner=? and state='running'",
                        (time.time() + 180, id, worker),
                    )
            else:
                with connection() as con:
                    con.execute('select public.renew_appraisal_job(%s,%s)', (id, worker))
        except Exception:
            pass


def start(handler):
    global _started
    with _lock:
        if _started:
            return
        _started = True
        _stop.clear()

    def consume():
        worker = str(uuid.uuid4())
        while not _stop.is_set():
            try:
                job = claim(worker)
                if not job:
                    _stop.wait(1)
                    continue
                snapshot = job['snapshot']
                s = Store(actor=job['actor'])
                current = s.get(job['case_id'])
                if current['revision'] != snapshot['revision'] or current.get('job', {}).get('status') != 'running':
                    if snapshot.get('job', {}).get('mode') == 'ocr':
                        from .ocr_jobs import spool

                        spool(job['id']).unlink(missing_ok=True)
                    finish(job['id'], worker, 'stale')
                    continue
                config = snapshot.get('job', {})
                done = threading.Event()
                threading.Thread(target=keep_lease, args=(job['id'], worker, done), daemon=True).start()
                try:
                    handler(
                        s,
                        job['case_id'],
                        job['id'],
                        config.get('mode', 'intake'),
                        config.get('useModel', False),
                        snapshot,
                    )
                finally:
                    done.set()
                current = s.get(job['case_id'])
                state = current.get('job', {}).get('status')
                finish(job['id'], worker, state if state in ('completed', 'failed', 'cancelled') else 'stale')
            except Exception:
                # A lease survives transient outages and is retried after expiration.
                _stop.wait(3)

    for _ in range(2):
        threading.Thread(target=consume, daemon=True, name='appraisal-queue').start()


def stop():
    _stop.set()
