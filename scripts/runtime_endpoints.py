"""Shared public endpoint from the canonical port configuration."""

import json
from pathlib import Path

PORTS = json.loads((Path(__file__).resolve().parents[1] / 'config/runtime-ports.json').read_text(encoding='utf-8'))
API_BASE = f'http://127.0.0.1:{PORTS["web"]}/api/appraisal'
