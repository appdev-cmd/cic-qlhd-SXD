"""Optional local Vietnamese OCR. Original PDF bytes are never rewritten."""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def executable():
    candidate = (
        os.getenv('TESSERACT_CMD')
        or shutil.which('tesseract')
        or ('C:/Program Files/Tesseract-OCR/tesseract.exe' if os.name == 'nt' else None)
    )
    return candidate if candidate and Path(candidate).is_file() else None


def available():
    command = executable()
    if not command:
        return False
    try:
        result = subprocess.run(
            [command, '--list-langs'],
            capture_output=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        languages = result.stdout.decode('utf-8', errors='replace').splitlines()
        return result.returncode == 0 and 'vie' in languages and 'eng' in languages
    except (OSError, subprocess.TimeoutExpired):
        return False


def page_text(pdf_bytes, page_index):
    command = executable()
    if not command:
        return None
    import pypdfium2

    with tempfile.TemporaryDirectory(prefix='appraisal-ocr-') as folder:
        path = Path(folder) / 'page.png'
        with pypdfium2.PdfDocument(pdf_bytes) as document:
            page = document[page_index]
            width, height = page.get_size()
            if width <= 0 or height <= 0:
                raise ValueError('Kích thước trang PDF không hợp lệ.')
            scale = min(2.0, (12_000_000 / (width * height)) ** 0.5)
            page.render(scale=scale).to_pil().save(path)
        result = subprocess.run(
            [command, str(path), 'stdout', '-l', 'vie+eng', '--oem', '1', '--psm', '3'],
            capture_output=True,
            timeout=20,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        if result.returncode:
            raise ValueError('OCR chưa sẵn sàng; kiểm tra bộ ngôn ngữ vie và eng.')
        return result.stdout.decode('utf-8', errors='replace')
