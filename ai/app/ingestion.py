"""Read original documents without modifying bytes or claiming signature validity."""
import io
import re
import zipfile
import unicodedata
from decimal import Decimal, InvalidOperation
from .domain import FIELDS, REQUIREMENTS, uid

MAX_BYTES = 18 * 1024 * 1024

def read_document(filename, data, ocr_limit=2, before_page=None):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Tệp phải có dữ liệu và nhỏ hơn 18 MB.')
    ext = filename.rsplit('.', 1)[-1].lower()
    segments, warnings = [], []
    signature = 'not_checked'
    if ext == 'pdf':
        from pypdf import PdfReader
        if b'%PDF' not in data[:1024]:
            raise ValueError('Nội dung không phải PDF hợp lệ.')
        if not data.startswith(b'%PDF'):
            warnings.append('PDF có phần đầu bất thường; chỉ đọc phục hồi, giữ nguyên bản.')
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ValueError('PDF có mật khẩu. Cần bản cho phép đọc.')
        if len(reader.pages) > 300:
            raise ValueError('Giới hạn 300 trang mỗi tệp. Hãy chia theo bộ hồ sơ.')
        signature = 'present_unverified' if any(v.get('/FT') == '/Sig' for v in (reader.get_fields() or {}).values()) else 'not_detected'
        ocr_count=0
        for i, page in enumerate(reader.pages):
            if before_page:before_page(i+1,len(reader.pages))
            text = page.extract_text() or ''
            ocr_used=False
            if len(text.strip())<20 and ocr_count<ocr_limit:
                ocr_count+=1
                from .ocr import page_text
                try:
                    recognized=page_text(data,i)
                    if recognized:
                        text=recognized;ocr_used=True
                        warnings.append(f'Trang {i+1} đọc bằng OCR; phải kiểm tra số liệu với bản gốc.')
                except Exception:
                    warnings.append(f'Trang {i+1} OCR không thành công; cần bản có lớp chữ.')
            if len(text.strip()) < 20:
                warnings.append(f'Trang {i+1} cần OCR hoặc bản PDF có lớp chữ; chưa đọc đủ.')
            for j, line in enumerate(text.splitlines()):
                if line.strip():
                    segments.append({'id': uid(), 'locator': f'Trang {i+1}, dòng {j+1}'+(' (OCR)' if ocr_used else ''), 'page': i+1, 'text': line.strip()})
    elif ext == 'docx':
        from docx import Document
        from docx.oxml.ns import qn
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(z.file_size for z in archive.infolist()) > 60 * 1024 * 1024:
                raise ValueError('DOCX giải nén quá lớn.')
        doc = Document(io.BytesIO(data))
        for i, block in enumerate(doc.element.body):
            if block.tag == qn('w:p'):
                lines = [''.join(t.text or '' for t in block.iter(qn('w:t')))]
            elif block.tag == qn('w:tbl'):
                lines = [' | '.join(''.join(t.text or '' for t in cell.iter(qn('w:t'))) for cell in row.findall(qn('w:tc'))) for row in block.findall(qn('w:tr'))]
            else:
                continue
            for j,line in enumerate(lines):
                if line.strip():
                    segments.append({'id': uid(), 'locator': f'Khối {i+1}, dòng {j+1}', 'page': None, 'text': line.strip()})
    elif ext == 'txt':
        text = data.decode('utf-8-sig')
        segments = [{'id': uid(), 'locator': f'Dòng {i+1}', 'page': None, 'text': t.strip()} for i,t in enumerate(text.splitlines()) if t.strip()]
    else:
        raise ValueError('Hỗ trợ PDF, DOCX và TXT UTF-8. Bảng chi phí có thể nộp trong DOCX/PDF.')
    if sum(len(s['text']) for s in segments) > 1_500_000:
        raise ValueError('Nội dung vượt giới hạn xử lý mỗi tệp.')
    return segments, warnings, signature

def normalize(text):
    return unicodedata.normalize('NFC', text).strip()

def number(text):
    value = re.match(r'\s*([+-]?[\d.,\s]+)', text)
    if not value:
        return None
    raw = value[1].strip().replace(' ', '')
    if ',' in raw:
        raw = raw.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(\.\d{3})+', raw):
        raw = raw.replace('.', '')
    try:
        n = Decimal(raw)
        return str(n) if n.is_finite() and abs(n) < Decimal('1e18') else None
    except InvalidOperation:
        return None

def extract_facts(document):
    result = []
    for seg in document['segments']:
        text = normalize(seg['text'])
        for key, (label, unit) in FIELDS.items():
            m = re.search(re.escape(label) + r'\s*[:|]\s*([^|;]+)', text, re.I)
            if not m:
                continue
            raw = m[1].strip()
            value = number(raw) if unit else raw
            if value is not None:
                result.append({'id': uid(), 'key': key, 'label': label, 'value': value,
                               'rawValue': raw, 'unit': unit, 'documentId': document['id'],
                               'segmentId': seg['id'], 'locator': seg['locator'],
                               'quote': text, 'method': 'label_parser', 'reviewStatus': 'pending',
                               'reviewedBy': None, 'reviewNote': ''})
    return result

def checklist_candidates(document):
    """Extract explicit references, retaining evidence; acceptance is a separate action."""
    candidates=[]
    for code,name,category in REQUIREMENTS:
        if not code.startswith('PL'): continue
        reference=re.search(r'\d+[/-][\wÀ-ỹĐđ/-]+',name)
        if not reference: continue
        for seg in document['segments']:
            if reference[0].casefold() in seg['text'].casefold():
                candidates.append({'id':uid(),'requirementId':code,'name':name,'category':category,
                    'documentId':document['id'],'segmentId':seg['id'],'locator':seg['locator'],
                    'quote':seg['text'],'accepted':False})
                break
    # Other projects may have a different legal checklist. Preserve listed lines as candidates.
    in_section=False
    for seg in document['segments']:
        text=seg['text'].strip()
        if re.search(r'danh mục.*(?:gửi kèm|kèm theo)|hồ sơ.*(?:gửi kèm|trình thẩm định gồm)',text,re.I):
            in_section=True;continue
        if in_section and re.match(r'III[.\s]|Nơi nhận|ĐẠI DIỆN',text,re.I):break
        if in_section and len(text)<300 and re.match(r'(?:[-•]|\d+[.)]|PL\d+:)',text):
            if any(c['quote']==text for c in candidates):continue
            if re.search(r'khảo sát|thiết kế cơ sở|thuyết minh|tổng mức|năng lực',text,re.I):continue
            candidates.append({'id':uid(),'requirementId':'ADD-'+uid()[:8],'name':text[:200],'category':'Theo tờ trình',
                'documentId':document['id'],'segmentId':seg['id'],'locator':seg['locator'],'quote':text,'accepted':False})
    return candidates
