"""Build labelled sample inputs and actual pipeline outputs; never copy official signatures."""

import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from app.domain import new_case, uid, now, audit, invalidate
from app.ingestion import read_document, extract_facts, checklist_candidates
from app.samples import sample_specs
from app.reporting import document_bytes, export_document
from app.rules import analyze

root = Path(__file__).resolve().parents[1] / 'output' / 'appraisal'
root.mkdir(parents=True, exist_ok=True)
actor = {'name': 'Chuyên viên mẫu', 'tenantId': 'demo', 'department': 'Phòng thẩm định mẫu'}
case = new_case(
    'Trường liên cấp Hương Xuân — hồ sơ mô phỏng', 'Hà Tĩnh', actor, '2026-09-27', sample=True, school_template=True
)
manifest = []
snapshots = {}
for spec in sample_specs('revised'):
    revision = 2 if '_v2.' in spec['filename'] else 1
    folder = root / 'dau-vao' / ('02-bo-sung' if revision == 2 else '01-lan-dau')
    folder.mkdir(parents=True, exist_ok=True)
    data = document_bytes(spec['title'], spec['blocks'], 'docx', True)
    for format in ['docx', 'pdf']:
        path = folder / Path(spec['filename']).with_suffix('.' + format)
        content = data if format == 'docx' else document_bytes(spec['title'], spec['blocks'], 'pdf', True)
        path.write_bytes(content)
        manifest.append(
            {
                'path': path.relative_to(root).as_posix(),
                'requirementId': spec['requirementId'],
                'version': revision,
                'sha256': hashlib.sha256(content).hexdigest(),
                'size': len(content),
            }
        )
    segments, warnings, signature = read_document(spec['filename'], data)
    doc = {
        'id': uid(),
        'requirementId': spec['requirementId'],
        'name': spec['filename'],
        'version': revision,
        'role': 'submission',
        'hash': hashlib.sha256(data).hexdigest(),
        'size': len(data),
        'uploadedAt': now(),
        'segments': segments,
        'warnings': warnings,
        'signature': signature,
    }
    case['documents'].append(doc)
    case['facts'].extend(extract_facts(doc))
    if spec['requirementId'] == 'TTR':
        case['checklistCandidates'] = checklist_candidates(doc)
    next(r for r in case['requirements'] if r['id'] == spec['requirementId'])['status'] = 'submitted'
    invalidate(case)
    case['revision'] += 1
    audit(case, actor, 'Nộp tài liệu mẫu', doc['name'])
    if spec['filename'] == 'NL01_v1.docx':
        case['runs'].append(analyze(case))
        case['status'] = 'analyzed'
        snapshots['01-lan-dau'] = json.loads(json.dumps(case))
case['runs'].append(analyze(case))
case['status'] = 'analyzed'
case['consultations'].append(
    {
        'id': uid(),
        'text': 'Giải trình mô phỏng về diện tích, chứng chỉ và cơ cấu tổng mức đầu tư.',
        'response': 'Bản v2 minh họa sửa giá trị thành 17.551 m², thống nhất mã SAMPLE và điều chỉnh 7 khoản mục; tổng vẫn 217.230.000.000 đồng. Chưa chứng minh tính hợp lý chuyên ngành.',
        'actor': actor['name'],
        'at': now(),
        'status': 'responded',
    }
)
snapshots['02-sau-bo-sung'] = case
for scenario, snapshot in snapshots.items():
    folder = root / 'dau-ra' / scenario
    folder.mkdir(parents=True, exist_ok=True)
    for kind in ['report', 'supplement', 'suspension', 'notice', 'decision']:
        for format in ['docx', 'pdf']:
            path = folder / f'{kind}.{format}'
            content, _ = export_document(snapshot, kind, format)
            path.write_bytes(content)
            manifest.append(
                {
                    'path': path.relative_to(root).as_posix(),
                    'sha256': hashlib.sha256(content).hexdigest(),
                    'size': len(content),
                }
            )
    (folder / 'ket-qua-co-cau-truc.json').write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8'
    )
summary = {
    name: {
        'documents': len(c['documents']),
        'facts': len(c['facts']),
        'findings': len(c['runs'][-1]['findings']),
        'costComparison': c['runs'][-1]['costComparison'],
        'areaCheck': next(f['calculation'] for f in c['runs'][-1]['findings'] if f['code'] == 'AREA.SUM'),
    }
    for name, c in snapshots.items()
}
(root / 'manifest.json').write_text(
    json.dumps({'synthetic': True, 'files': manifest, 'results': summary}, ensure_ascii=False, indent=2),
    encoding='utf-8',
)
(root / 'HUONG-DAN.md').write_text(
    '''# Bộ hồ sơ mẫu đầu vào và đầu ra BCNCKT

Tất cả tài liệu là dữ liệu mô phỏng để thử phần mềm, không có giá trị pháp lý. Các phiếu PL là dữ liệu tham chiếu, không giả lập văn bản được ký bởi cơ quan nhà nước. Không dùng số chứng chỉ hoặc tên nhân sự thật.

Ngày trình giả lập: 27/09/2026; dùng bộ quy định sau 01/07/2026 theo yêu cầu. NĐ 217/2026 điều chỉnh quy trình, NĐ 206/2026 điều chỉnh chi phí. Đây là tình huống trình mới mô phỏng, không sửa hồ sơ Hương Xuân gốc. Checklist Điều 35 có các điều kiện còn chờ xác nhận và tài liệu còn thiếu, được thể hiện trong kết quả.

## Cách sử dụng

1. Mở phân hệ Thẩm định BCNCKT, chọn Nạp mẫu lần đầu hoặc Nạp mẫu đã bổ sung. Phần mềm tạo hồ sơ riêng và đọc lại tài liệu bằng cùng quy trình tiếp nhận.
2. Có thể tự tạo hồ sơ, nộp TTR trước, xác nhận danh mục pháp lý được nhận diện, rồi nộp 13 tài liệu còn lại. Mỗi thành phần chọn một bản DOCX hoặc PDF, không nộp cả hai như hai lần trình.
3. Lần bổ sung nộp ba tệp v2 vào đúng KT03, KT05, NL01. Chạy lại kiểm tra. Dữ liệu và nhận xét cần chuyên viên xác nhận.
4. Xem bằng chứng và xuất dự thảo tại tab Dự thảo kết quả. Nút xuất trên phần mềm lấy dữ liệu hồ sơ hiện tại.

## Thành phần đầu vào

`dau-vao/01-lan-dau`: 14 tài liệu, mỗi tài liệu có DOCX và PDF: tờ trình; 7 phiếu pháp lý; khảo sát địa hình; khảo sát địa chất; thuyết minh BCNCKT; thuyết minh TKCS; bảng TMĐT; năng lực 2 đơn vị và 6 nhân sự mẫu.

`dau-vao/02-bo-sung`: thuyết minh BCNCKT, bảng TMĐT và năng lực phiên bản 2.

TKCS/khảo sát là nội dung minh họa, chưa có bản vẽ thi công, số liệu thí nghiệm, mô hình kết cấu hoặc chứng nhận. Không đủ để kết luận an toàn công trình.

## Kết quả đầu ra

Mỗi thư mục kết quả có 5 tài liệu, mỗi loại gồm DOCX/PDF A4:
- report: báo cáo hỗ trợ kiểm tra có nguồn.
- supplement: khung Mẫu 15, các thành phần hồ sơ cần chuyên viên xác minh trước khi yêu cầu bổ sung.
- suspension: khung Mẫu 16, lỗi/sai sót cần xem xét có cản trở kết luận hay không; không tự phát hành tạm dừng.
- notice: khung Mẫu 03 đủ sáu phần; chưa phải văn bản ban hành.
- decision: khung Mẫu 09 với 19 nhóm thông tin và ba điều; chưa kết luận đủ điều kiện phê duyệt.

Kèm `ket-qua-co-cau-truc.json` chứa dữ liệu, nguồn, các lượt kiểm tra và lịch sử; `manifest.json` chứa mã SHA-256 và kết quả tóm tắt.

Lần đầu: khác mã chứng chỉ mẫu, khác năm tiêu chuẩn, tổng diện tích hạng mục 17.551 so với 17.140 m², chênh 411 m² theo giả thiết cộng đã nêu.

Sau bổ sung: các số liệu mẫu trên được thống nhất. Tổng mức đầu tư hai phiên bản đều 217.230.000.000 đồng, tiết kiệm ròng bằng 0; từng khoản mục tăng/giảm vẫn phải được thẩm định.

Mọi phiên bản: bể hữu ích 45 m³ và kích thước ngoài 7,12 × 5,35 × 2,25 m không đủ kết luận PCCC. Chữ ký, pháp lý, khảo sát, kết cấu, đấu nối, đơn giá và năng lực vẫn cần kiểm tra nghiệp vụ. Các trường trích xuất đang ở trạng thái chờ xác nhận.

Các báo cáo được tạo bằng bộ kiểm tra quy tắc trên chính tài liệu mẫu. Chưa gọi mô hình AI để tạo các kết quả đóng gói này.
''',
    encoding='utf-8',
)
archive = root / 'bo-ho-so-mau-bcnckt.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file() and p != archive and 'qa' not in p.relative_to(root).parts:
            z.write(p, p.relative_to(root).as_posix())
print(json.dumps({'archive': str(archive), 'documents': len(manifest), 'results': summary}, ensure_ascii=False))
