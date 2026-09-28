"""Inspect generated A4 exports and render each PDF page for visual review."""

import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import pypdfium2
from pypdf import PdfReader
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
folder = root / 'output/appraisal/gpxd-nghiem-thu'
render = root / 'tmp/pdfs/legal-v2'
render.mkdir(parents=True, exist_ok=True)
results = []
for path in sorted(folder.glob('*.pdf')):
    reader = PdfReader(path)
    images = []
    with pypdfium2.PdfDocument(path) as source:
        for index, page in enumerate(source):
            assert abs(page.get_width() - 595.2756) < 1 and abs(page.get_height() - 841.8898) < 1
            image = page.render(scale=1.25).to_pil()
            image.save(render / f'{path.stem}-{index + 1}.png')
            images.append(image)
    sheet = Image.new(
        'RGB',
        (
            max(i.width for i in images) * min(2, len(images)),
            (max(i.height for i in images) + 30) * ((len(images) + 1) // 2),
        ),
        '#dddddd',
    )
    draw = ImageDraw.Draw(sheet)
    for n, image in enumerate(images):
        x = (n % 2) * image.width
        y = (n // 2) * (image.height + 30)
        draw.text((x + 8, y + 5), f'{path.stem} page {n + 1}', fill='black')
        sheet.paste(image, (x, y + 30))
    sheet.save(render / (path.stem + '-contact.png'))
    results.append({'file': path.name, 'pages': len(reader.pages), 'a4': True})
for path in sorted(folder.glob('*.docx')):
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with ZipFile(path) as archive:
        doc = ET.fromstring(archive.read('word/document.xml'))
        for sect in doc.findall('.//w:sectPr', ns):
            size = sect.find('w:pgSz', ns)
            margin = sect.find('w:pgMar', ns)
            get = lambda e, k: int(e.attrib['{' + ns['w'] + '}' + k])
            assert abs(get(size, 'w') - 11906) <= 1 and abs(get(size, 'h') - 16838) <= 1
            for key, mm in [('left', 30), ('right', 20), ('top', 22), ('bottom', 20)]:
                assert abs(get(margin, key) - mm * 1440 / 25.4) <= 1
    results.append(
        {
            'file': path.name,
            'a4': True,
            'marginsMm': [30, 20, 22, 20],
            'visualRender': 'unavailable_bundled_libreoffice_missing',
        }
    )
(root / 'output/appraisal/legal-export-validation.json').write_text(
    json.dumps(
        {
            'files': results,
            'docxVisualLimitation': 'Bundled LibreOffice missing; DOCX XML verified. PDF rendered separately.',
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding='utf-8',
)
print(json.dumps({'files': len(results), 'pdfPages': sum(r.get('pages', 0) for r in results), 'render': str(render)}))
