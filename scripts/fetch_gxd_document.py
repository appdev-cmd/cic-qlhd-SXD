"""Import a legal document page from qlda.gxd.vn into the legal corpus as text/markdown.

    python scripts/fetch_gxd_document.py <url> <output-name.md> [--title "..."]

The page's main content is converted to plain text (tables become " | " rows) with a source header.
qlda.gxd.vn is the user's designated source for current construction legislation; always check the
official gazette before quoting in documents that are issued.
"""

import argparse
import html
import re
import sys
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / '01_phap_ly_quy_chuan'


def to_text(page):
    page = re.sub(r'<(script|style|nav|header|footer)[^>]*>.*?</\1>', '', page, flags=re.S | re.I)
    article = re.search(r'<article[^>]*>(.*?)</article>', page, flags=re.S | re.I)
    page = article.group(1) if article else page
    page = re.sub(r'<br\s*/?>', '\n', page)
    page = re.sub(r'</(p|div|tr|h\d|li)>', '\n', page)
    page = re.sub(r'</t[dh]>', ' | ', page)
    text = html.unescape(re.sub(r'<[^>]+>', '', page))
    text = re.sub(r'[ \t]+', ' ', text)
    return re.sub(r'\n\s*\n+', '\n', text).strip()


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('url')
    parser.add_argument('name')
    parser.add_argument('--title', default='')
    args = parser.parse_args()
    if not args.url.startswith('https://qlda.gxd.vn/') and '.gxd.vn/' not in args.url:
        raise SystemExit('Chỉ nhận nguồn văn bản trên *.gxd.vn.')
    request = Request(args.url, headers={'User-Agent': 'Mozilla/5.0 (BuildAppraisal legal corpus import)'})
    with urlopen(request, timeout=60) as response:
        page = response.read().decode('utf-8', errors='replace')
    text = to_text(page)
    cut = text.find('Last Updated:')
    if cut > 0:
        text = text[:cut].strip()
    title = args.title or (re.search(r'<title>(.*?)</title>', page, flags=re.S | re.I) or [None, args.name])[1]
    header = (
        f'# {html.unescape(str(title)).strip()}\n\n'
        f'> Nguồn văn bản: {args.url} (truy cập {date.today().strftime("%d/%m/%Y")}). '
        'Bảng chuyển thành dòng phân cách "|". Đối chiếu Công báo trước khi trích dẫn trong văn bản ban hành.\n\n'
    )
    target = CORPUS / args.name
    target.write_text(header + text + '\n', encoding='utf-8', newline='\n')
    print(f'{target.relative_to(ROOT)} — {len(text):,} ký tự')


if __name__ == '__main__':
    main()
