"""Exercise BIM RLS with the application's restricted runtime connection, rolling back fixtures."""
import os
import sys
from pathlib import Path
import httpx
from verify_schema import load_environment

root = Path(__file__).resolve().parents[1]
load_environment()
sys.path[:0] = [str(root / 'ai/.deps'), str(root / 'ai')]
from app.database import connection

with httpx.Client(timeout=30) as client:
    runtime = client.get('http://127.0.0.1:8208/api/appraisal/runtime').json()
    if runtime.get('environment') != 'staging':
        raise RuntimeError('RLS verification requires the configured staging environment.')
    response = client.post('http://127.0.0.1:8208/api/appraisal/test-login', json={'role': 'officer'})
    response.raise_for_status()
    user = client.get(os.environ.get('SUPABASE_URL', os.environ.get('VITE_SUPABASE_URL')) + '/auth/v1/user',
                      headers={'apikey': os.environ.get('SUPABASE_ANON_KEY', os.environ.get('VITE_SUPABASE_ANON_KEY')),
                               'Authorization': 'Bearer ' + response.json()['access_token']})
    user.raise_for_status()
    actor = user.json()['id']
with connection(actor) as con:
    cursor = con.execute((root / 'tests/bim_rls.sql').read_text(encoding='utf-8'))
    while cursor.description is None:
        if not cursor.nextset():
            raise RuntimeError('RLS verification did not return a result.')
    print(cursor.fetchone())
