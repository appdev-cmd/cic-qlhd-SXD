"""Compare raster OCR with existing text layers, never treat them as expert labels."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import time
import unicodedata
from difflib import SequenceMatcher
from pypdf import PdfReader


def normalized(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip().casefold()


def main():
    root=Path(__file__).resolve().parents[1]
    for line in (Path.home()/'.config/buildappraisal/runtime.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.startswith('#'):
            key,value=line.split('=',1); os.environ.setdefault(key,value.strip('"\''))
    from app.ocr import available, page_text
    assert available(), 'Vietnamese OCR is unavailable'
    results=[]; start=time.monotonic()
    output=root/'output/appraisal/ocr-real-documents'; output.mkdir(parents=True,exist_ok=True)
    for index,path in enumerate(sorted((root/'docs/THCS Hương Xuân').glob('*.pdf')),1):
        data=path.read_bytes(); reader=PdfReader(io.BytesIO(data),strict=False)
        for number,page in enumerate(reader.pages,1):
            begin=time.monotonic(); reference=page.extract_text() or ''
            recognized=page_text(data,number-1) or ''
            expected=set(re.findall(r'\b\d+(?:[.,/]\d+)+\b',reference))
            found=set(re.findall(r'\b\d+(?:[.,/]\d+)+\b',recognized))
            result=dict(document=path.name,sha256=hashlib.sha256(data).hexdigest(),page=number,
                seconds=round(time.monotonic()-begin,2),textLayerChars=len(reference),ocrChars=len(recognized),
                textSimilarity=round(SequenceMatcher(None,normalized(reference),normalized(recognized),autojunk=False).ratio(),4),
                numericTokens=len(expected),numericTokensMatched=len(expected&found),
                numericTokensMissing=sorted(expected-found))
            (output/f'document-{index}-page-{number:02d}.txt').write_text(recognized,encoding='utf-8')
            results.append(result)
        print(json.dumps({'document':path.name,'pages':len(reader.pages),'completed':True},ensure_ascii=False),flush=True)
    report={'method':'OCR raster trang PDF gốc, đối chiếu lớp chữ có sẵn. Lớp chữ chưa được chuyên gia gán nhãn; similarity không phải độ chính xác OCR. Không thay đổi bản gốc.',
        'documents':2,'pages':len(results),'readablePages':sum(x['ocrChars']>=20 for x in results),
        'seconds':round(time.monotonic()-start,1),'meanTextSimilarity':round(sum(x['textSimilarity'] for x in results)/len(results),4),
        'numericTokens':sum(x['numericTokens'] for x in results),'numericTokensMatched':sum(x['numericTokensMatched'] for x in results),'items':results}
    (root/'output/appraisal/ocr-real-documents-evaluation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('items','method')},ensure_ascii=False),flush=True)


if __name__=='__main__': main()
