"""Cache official public sources and OCR selected pages for manual comparison."""

import hashlib
import json
import os
from pathlib import Path
import httpx
from pypdf import PdfReader

folder = Path.home() / '.config/buildappraisal/legal'
for line in (folder.parent / 'runtime.env').read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.startswith('#'):
        key, value = line.split('=', 1)
        os.environ.setdefault(key, value.strip('"\''))
from app.ocr import page_text

sources = [
    ('nd217', 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/217-ndcp.signed.pdf', range(52, 70)),
    (
        'nd207',
        'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/207-ndcp.signed.pdf',
        list(range(28, 40)) + list(range(70, 101)),
    ),
    ('pl217', 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/pl217.pdf', range(47, 63)),
    ('tt32', 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/32-bxd.pdf', range(1, 8)),
]
manifest = []
for code, url, pages in sources:
    path = folder / (code + '.pdf')
    if not path.exists():
        response = httpx.get(url, timeout=90, follow_redirects=True)
        response.raise_for_status()
        assert response.content.startswith(b'%PDF')
        path.write_bytes(response.content)
    data = path.read_bytes()
    reader = PdfReader(path)
    for page in pages:
        out = folder / f'{code}-{page:03d}.txt'
        if not out.exists():
            out.write_text(reader.pages[page - 1].extract_text() or page_text(data, page - 1) or '', encoding='utf-8')
    manifest.append(
        dict(
            id=code,
            url=url,
            sha256=hashlib.sha256(data).hexdigest(),
            pages=len(reader.pages),
            capturedPages=list(pages),
        )
    )
    print(json.dumps({'source': code, 'pagesCaptured': len(pages)}), flush=True)
output = Path(__file__).resolve().parents[1] / 'output/appraisal/legal-source-capture.json'
output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
