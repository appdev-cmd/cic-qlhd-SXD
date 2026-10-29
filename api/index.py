"""Vercel's ASGI entry point; secrets and database connections are server-only."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ai'))
# Fail closed: this entry point never exposes demo identities or the local test-login routes.
os.environ['APPRAISAL_MODE'] = 'cloud'
os.environ['APPRAISAL_ENVIRONMENT'] = 'production'
os.environ['APPRAISAL_ENABLE_TEST_LOGIN'] = 'false'
os.environ.setdefault('APPRAISAL_DATA_DIR', '/tmp/buildappraisal')
os.environ.setdefault('APPRAISAL_DB_POOL_MIN', '0')
os.environ.setdefault('APPRAISAL_DB_POOL_MAX', '2')
if os.environ.get('APPRAISAL_DATABASE_CA_PEM'):
    import ssl

    pem = os.environ['APPRAISAL_DATABASE_CA_PEM']
    if 'PRIVATE KEY' in pem:
        raise RuntimeError('Database CA must contain only a public certificate.')
    ssl.PEM_cert_to_DER_cert(pem)
    temporary = Path(os.environ['APPRAISAL_DATA_DIR'])
    temporary.mkdir(parents=True, exist_ok=True)
    certificate = temporary / 'database-ca.crt'
    certificate.write_text(pem, encoding='ascii')
    certificate.chmod(0o600)
    os.environ['APPRAISAL_DATABASE_CA'] = str(certificate)

from app.main import app  # noqa: E402
from app.deps import SECRET  # noqa: E402
from app.serverless_gateway import ServerlessGateway  # noqa: E402

origins = [os.environ.get('APPRAISAL_ORIGIN', 'https://cic-qlhd-sxd.vercel.app')]
if os.environ.get('VERCEL_URL'):
    origins.append('https://' + os.environ['VERCEL_URL'])
app.add_middleware(ServerlessGateway, secret=SECRET, origins=origins)
