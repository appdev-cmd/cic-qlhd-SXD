"""Write the worker OpenAPI contract to docs/api/openapi.json (input for src/types/api.gen.ts)."""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ai/.deps'), str(ROOT / 'ai')]
os.environ.update(APPRAISAL_MODE='demo', APPRAISAL_ENVIRONMENT='demo')
os.environ.setdefault('APPRAISAL_INTERNAL_TOKEN', 'openapi-export')
os.chdir(ROOT)
from app.main import app  # noqa: E402

target = ROOT / 'docs/api/openapi.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(
    json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8', newline='\n'
)
print(target.relative_to(ROOT))
