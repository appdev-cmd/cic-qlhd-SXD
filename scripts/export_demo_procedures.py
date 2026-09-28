"""Export linked demo outputs and a synthetic scanned input from the running app."""
import io,json,zipfile,time
from pathlib import Path
import httpx
import pypdfium2
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from app.reporting import document_bytes

root=Path(__file__).resolve().parents[1];out=root/'output/appraisal/gpxd-nghiem-thu';out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((root/'output/appraisal/procedure-demo-manifest.json').read_text(encoding='utf-8'))
base='http://127.0.0.1:3001/api/appraisal';client=httpx.Client(timeout=120)
for attempt in range(4):
    response=client.post(base+'/test-login',json={'role':'admin'})
    if response.status_code==200:break
    time.sleep(attempt+1)
response.raise_for_status()
headers={'Authorization':'Bearer '+response.json()['access_token']}
files=[]
for procedure in ('gpxd','nghiem_thu'):
    record=next(x for x in manifest['updated'] if x['procedure']==procedure)
    for kind in (['review','draft','application','minutes'] if procedure=='nghiem_thu' else ['review','draft','application']):
        for format in ('pdf','docx'):
            for attempt in range(4):
                response=client.get(base+f'/cases/{record["id"]}/procedure-review/{kind}/{format}',headers=headers)
                if response.status_code<500:break
                time.sleep(attempt+1)
            if response.status_code!=200:raise RuntimeError(f'Export {procedure}/{kind}/{format}: {response.status_code}')
            path=out/f'{procedure}-{kind}.{format}';path.write_bytes(response.content);files.append(path)
blocks=[{'heading':'Tài liệu đầu vào mô phỏng','text':['Tờ trình phục vụ trình diễn OCR tiếng Việt.',
 'Tên dự án: Công trình trường học mô phỏng','Tổng mức đầu tư: 25.000.000.000 đồng','Cấp công trình: III',
 'Số tầng: 3','Đây là trang ảnh được tạo từ dữ liệu giả lập, chưa có chữ ký hoặc con dấu.',
 'Chuyên viên phải đối chiếu số liệu với bản gốc sau khi OCR.']}]
digital=document_bytes('HỒ SƠ SCAN MẪU — OCR TIẾNG VIỆT',blocks,'pdf',True)
data=io.BytesIO();canvas=Canvas(data,pagesize=(595.2756,841.8898))
with pypdfium2.PdfDocument(digital) as source:
    for page in source:
        canvas.drawImage(ImageReader(page.render(scale=2).to_pil()),0,0,width=595.2756,height=841.8898);canvas.showPage()
canvas.save();scan=out/'ho-so-scan-mau.pdf';scan.write_bytes(data.getvalue());files.append(scan)
(out/'HUONG_DAN.md').write_text('''# Bộ mẫu GPXD và nghiệm thu

Các tệp đầu ra xuất trực tiếp từ phiếu chuyên môn của hồ sơ mô phỏng đã liên kết dự án trên Supabase. Dự thảo đang chờ rà soát, chưa cấp số, chưa ký, không phải giấy phép hoặc thông báo có hiệu lực.

- `gpxd-review`: phiếu rà soát cấp phép.
- `gpxd-application`: đơn đề nghị Mẫu 01/02, Phụ lục II theo thủ tục của phiếu.
- `gpxd-draft`: khung dự thảo GPXD, chọn Mẫu 03/04/05 hoặc nội dung trên giấy phép gốc theo loại thủ tục tại Phụ lục II NĐ 217/2026.
- `nghiem_thu-review`: phiếu kiểm tra nghiệm thu và theo dõi khắc phục.
- `nghiem_thu-application`: báo cáo hoàn thành thi công theo Phụ lục VI.
- `nghiem_thu-draft`: khung thông báo nghiệm thu tham chiếu Phụ lục VIII NĐ 207/2026.
- `nghiem_thu-minutes`: biên bản ghi nhận hiện trường.
- `ho-so-scan-mau.pdf`: đầu vào PDF chỉ có ảnh để trình diễn OCR. Nộp vào hồ sơ đang mở, chọn tài liệu trong mục OCR và bấm Đọc OCR. Kết quả phải được đối chiếu lại.

PDF/DOCX dùng A4. Các chỗ [chưa xác nhận] phải được cán bộ hoàn thiện; không tự điền mã định danh quốc gia hoặc chữ ký.
''',encoding='utf-8')
files.append(out/'HUONG_DAN.md')
with zipfile.ZipFile(out.parent/'bo-mau-gpxd-nghiem-thu.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in files:archive.write(path,path.name)
print(json.dumps({'output':str(out),'files':len(files)},ensure_ascii=False))
