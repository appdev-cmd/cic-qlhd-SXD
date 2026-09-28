"""Create persistent, project-linked local demo submissions without replacing user data."""

import hashlib
import json
import sys
from datetime import date
from uuid import NAMESPACE_URL, uuid5

from app.domain import COSTS, audit, new_case, now
from app.ingestion import extract_facts, read_document
from app.rules import analyze
from app.store import DEMO_ACTOR, MODE, db

LABELS = {'bcnckt': 'Thẩm định BCNCKT', 'gpxd': 'Cấp giấy phép xây dựng', 'nghiem_thu': 'Hậu kiểm và nghiệm thu'}


def stable_id(key):
    return str(uuid5(NAMESPACE_URL, 'buildappraisal/project-submissions/v1/' + key))


def money(value):
    return f'{value:,}'.replace(',', '.')


def make_case(project, index, procedure, round_number):
    key = f"{project['id']}/{procedure}/{round_number}"
    month_bucket = hashlib.sha256(project['id'].encode()).digest()[0] % 100
    month = 7 if month_bucket < 20 else 8 if month_bucket < 55 else 9
    submitted = date(2026, month, 1 + (index * 7) % 20 + (round_number - 1) * 7)
    submitted_at = submitted.isoformat() + 'T02:00:00+00:00'
    actor = {**DEMO_ACTOR, 'name': project['assignee']}
    case = new_case(
        f"{project['code']} · {LABELS[procedure]} · Lần {round_number:02d}",
        project['location'],
        actor,
        submitted.isoformat(),
        project['id'],
        sample=True,
        procedure=procedure,
        project_name=project['name'],
        project_code=project['code'],
    )
    case.update(
        id=stable_id(key),
        createdAt=submitted_at,
        assignee=actor['name'],
        submissionCode=f"HS-{procedure.upper()}-{project['code']}-{round_number:02d}",
        submissionRound=round_number,
        previousSubmissionId=stable_id(f"{project['id']}/{procedure}/1") if round_number == 2 else None,
        seedVersion='project-submissions-v2',
    )
    case['legalContext']['submissionDate'] = submitted.isoformat()
    files = []
    common = [
        f"Tên dự án: {project['name']}",
        f"Mã dự án: {project['code']}",
        f"Địa phương công trình: {project['location']}",
        f"Chủ đầu tư: {project['investorName']}",
        f"Nhóm dự án: {project['projectGroup']}",
        f"Cấp công trình: {project['buildingGrade']}",
        f"Lần nộp: {round_number:02d}; ngày trình: {submitted.strftime('%d/%m/%Y')}",
        f"Nghiệp vụ: {LABELS[procedure]}",
    ]

    def attach(code, title, lines, role='submission'):
        data = ('\n'.join([title.upper(), *common, '', *lines]) + '\n').encode('utf-8')
        segments, warnings, signature = read_document('sample.txt', data)
        document = {
            'id': stable_id(key + '/' + code),
            'requirementId': code,
            'name': f"{project['code']}_{procedure}_L{round_number:02d}_{code}.txt",
            'role': role,
            'version': 1,
            'hash': hashlib.sha256(data).hexdigest(),
            'size': len(data),
            'uploadedAt': submitted_at,
            'segments': segments,
            'warnings': warnings,
            'signature': signature,
        }
        case['documents'].append(document)
        if role == 'submission':
            case['facts'].extend(extract_facts(document))
            requirement = next(r for r in case['requirements'] if r['id'] == code)
            requirement['status'] = 'submitted'
        files.append((case['id'], document['id'], data))
        audit(case, actor, 'Nộp tài liệu', title)

    audit(case, actor, 'Tiếp nhận hồ sơ', project['code'] + ' · ' + LABELS[procedure])
    if round_number == 2:
        audit(
            case,
            actor,
            'Liên kết lần bổ sung',
            'Tiếp nối lần 01 của cùng dự án và nghiệp vụ; giữ nguyên hồ sơ lần đầu.',
        )

    if procedure == 'bcnckt':
        total = project['totalInvestment']
        percentages = [5, 65, 10, 2, 5, 3]
        values = [total * p // 100 for p in percentages]
        values.append(total - sum(values) - (1_000_000 if round_number == 1 else 0))
        costs = [f'{label}: {money(value)} đồng' for (_, label), value in zip(COSTS, values)]
        attach(
            'TTR',
            'Tờ trình thẩm định',
            [
                f'Tổng mức đầu tư: {money(total)} đồng',
                'Đề nghị tiếp nhận tài liệu và đối chiếu nội dung thuyết minh, khảo sát, thiết kế cơ sở, chi phí và năng lực.',
                'Danh mục gửi kèm: KT01, KT02, KT03, KT04, KT05' + (', NL01.' if round_number == 2 else '.'),
                'Ngày đánh giá: 27/09/2026. Chuyên viên cần xác nhận phạm vi pháp lý trong tab Căn cứ pháp lý.',
                'Lần đầu cố ý thiếu tài liệu năng lực và có chênh lệch cộng chi phí; lần bổ sung sửa hai nội dung này.',
            ],
        )
        attach(
            'KT01',
            'Thuyết minh khảo sát địa hình',
            [
                'Phạm vi: ranh giới công trình, cao độ, điểm đấu nối và hệ thống hạ tầng hiện có.',
                'Nhiệm vụ: thu thập mốc khống chế, đo đạc địa hình, xác định vị trí công trình trên tổng mặt bằng.',
                'Chưa có tọa độ, số liệu đo gốc và bản đồ địa hình có xác nhận. Cần bổ sung trước khi sử dụng thiết kế.',
            ],
        )
        attach(
            'KT02',
            'Thuyết minh khảo sát địa chất',
            [
                'Phạm vi: khu vực bố trí công trình chính và hạ tầng kỹ thuật.',
                'Nội dung cần đối chiếu: vị trí lỗ khoan, nhật ký khoan, kết quả thí nghiệm, mực nước và kiến nghị móng.',
                'Cần đối chiếu số liệu địa chất, bản khảo sát và phụ lục kèm theo.',
            ],
        )
        attach(
            'KT03',
            'Thuyết minh BCNCKT',
            [
                f'Tổng mức đầu tư: {money(total)} đồng',
                'Mục tiêu: thực hiện dự án theo tên và quy mô trong danh mục dự án.',
                'Nội dung: sự cần thiết, địa điểm, phương án công trình, tổ chức thực hiện, vận hành và chi phí.',
                'Các quy mô kỹ thuật, nguồn vốn, đất đai, môi trường và quy hoạch cần hồ sơ chứng minh riêng.',
            ],
        )
        attach(
            'KT04',
            'Danh mục thiết kế cơ sở',
            [
                'Danh mục dự kiến: tổng mặt bằng, giải pháp kiến trúc / tuyến, kết cấu, điện, cấp thoát nước và an toàn cháy.',
                'Đây là thuyết minh danh mục; không phải bản vẽ thiết kế cơ sở có tỷ lệ và không dùng để thi công.',
                'Cần bổ sung bản vẽ, tính toán và xác nhận của người chịu trách nhiệm theo từng chuyên ngành.',
            ],
        )
        attach(
            'KT05',
            'Tổng mức đầu tư',
            [
                f'Tổng mức đầu tư: {money(total)} đồng',
                *costs,
                'Đối chiếu căn cứ lập chi phí, khối lượng và định mức áp dụng.',
            ],
        )
        if round_number == 2:
            attach(
                'NL01',
                'Danh mục năng lực',
                [
                    'Vai trò cần kiểm tra: chủ nhiệm lập báo cáo, chủ trì thiết kế, chủ nhiệm khảo sát và đơn vị thẩm tra.',
                    'Chưa có chứng chỉ thật hoặc kết quả tra cứu năng lực. Cần đối chiếu tài liệu do đơn vị cung cấp.',
                    'Giải trình: đã nộp danh mục năng lực và sửa phép cộng bảng chi phí; cần kiểm tra tài liệu kèm theo.',
                ],
            )
        run = analyze(case)
        case['runs'].append(run)
        case['status'] = 'analyzed'
        case['requirements'].append(
            {
                'id': 'SUMMARY',
                'name': 'Tóm tắt kết quả kiểm tra',
                'category': 'Tham khảo',
                'required': False,
                'status': 'submitted',
                'note': '',
                'verifiedBy': None,
            }
        )
        attach(
            'SUMMARY',
            'Tóm tắt kết quả kiểm tra bằng quy tắc',
            [
                f"Có {len(run['findings'])} nhận xét do bộ kiểm tra tạo từ các tài liệu của lần nộp này.",
                *[f"{f['title']}: {f['explanation']}" for f in run['findings']],
                'Chuyên viên cần rà soát nội dung và nguồn trích dẫn.',
            ],
            role='reference',
        )
        audit(case, actor, 'Kiểm tra tài liệu', 'Đã chạy bộ quy tắc; chờ chuyên viên rà soát.')
        if round_number == 2 and index % 5 == 0:
            case['status'] = 'reviewed'
            case['workflow'] = {'state': 'reviewed', 'history': []}
            case['finalReview'] = {
                'decision': 'reviewed',
                'note': 'Đã hoàn tất rà soát nội bộ hồ sơ.',
                'actor': actor['name'],
                'at': submitted_at,
                'simulation': True,
            }
            audit(case, actor, 'Hoàn tất rà soát nội bộ', 'Hồ sơ đã được rà soát và hoàn tất xử lý nội bộ.')
    else:
        if procedure == 'gpxd':
            content = {
                'APPLICATION': (
                    'Đơn đề nghị cấp phép',
                    [
                        'Đề nghị tiếp nhận hồ sơ cấp giấy phép xây dựng cho dự án nêu trên.',
                        'Thông tin cần chuyên viên xác nhận: loại giấy phép, phạm vi công trình, địa điểm, quy mô và thời hạn.',
                        'Thông tin người đại diện, quyền sử dụng đất và điều kiện cấp phép chưa được xác minh.',
                    ],
                ),
                'ATTACHMENTS': (
                    'Danh mục tài liệu cấp phép',
                    [
                        'Danh mục gồm: giấy tờ đất đai, quyết định dự án, tài liệu thiết kế và các văn bản liên quan.',
                        'Đây là danh mục tham khảo, không khẳng định mọi mục đều bắt buộc hoặc hồ sơ đã đầy đủ.',
                        'Lần 01: thiếu tài liệu xác nhận ranh giới. Lần 02: có giải trình, cần đối chiếu bản gốc.',
                    ],
                ),
                'DRAWINGS': (
                    'Thuyết minh danh mục bản vẽ cấp phép',
                    [
                        'Các bản vẽ cần đối chiếu theo hồ sơ thực tế: vị trí, mặt bằng, mặt đứng, mặt cắt và đấu nối hạ tầng.',
                        'Tệp văn bản này trình bày danh mục; chưa có bản vẽ kỹ thuật có tỷ lệ hoặc chữ ký thiết kế.',
                    ],
                ),
            }
            followup = (
                'Bổ sung tài liệu về ranh giới khu đất và giải trình thống nhất quy mô giữa đơn đề nghị với thiết kế.'
            )
        else:
            content = {
                'APPLICATION': (
                    'Văn bản đề nghị kiểm tra nghiệm thu',
                    [
                        'Đề nghị tiếp nhận hồ sơ kiểm tra công tác nghiệm thu của dự án nêu trên.',
                        'Phạm vi minh họa: công trình chính và hạ tầng phụ trợ; cần xác định hạng mục kiểm tra từ hồ sơ thực tế.',
                        'Lịch kiểm tra hiện trường và thành phần tham gia chưa được xác nhận.',
                    ],
                ),
                'ATTACHMENTS': (
                    'Danh mục hồ sơ quản lý chất lượng',
                    [
                        'Danh mục tham khảo: hồ sơ hoàn thành, nhật ký thi công, nghiệm thu công việc, thí nghiệm vật liệu và thiết bị.',
                        'Lần 01: thiếu danh mục đối chiếu thí nghiệm. Lần 02: nộp giải trình và đề xuất kiểm tra lại.',
                        'Chưa có chứng cứ hiện trường hoặc kết quả thí nghiệm được xác minh.',
                    ],
                ),
                'DRAWINGS': (
                    'Thuyết minh danh mục bản vẽ hoàn công',
                    [
                        'Danh mục: bản vẽ hoàn công công trình chính, hạ tầng và bảng tổng hợp thay đổi so với thiết kế.',
                        'Cần đối chiếu vị trí, kích thước, vật liệu và thiết bị với nhật ký, nghiệm thu và thực địa.',
                        'Tệp này không thay thế bản vẽ hoàn công.',
                    ],
                ),
            }
            followup = (
                'Bổ sung danh mục thí nghiệm, tài liệu hoàn công và kế hoạch kiểm tra các tồn tại tại hiện trường.'
            )
        for code, (title, lines) in content.items():
            attach(code, title, lines)
        result_note = (
            followup
            if round_number == 1
            else 'Đã tiếp nhận giải trình và tài liệu bổ sung; chuyên viên tiếp tục đối chiếu nội dung và bản gốc.'
        )
        attach(
            'RESULTS',
            'Phiếu xử lý nội bộ',
            [
                result_note,
                'Không phải giấy phép xây dựng, thông báo nghiệm thu hoặc văn bản cho phép sử dụng công trình.',
                'Chưa có chữ ký, con dấu, kiểm tra hiện trường hoặc quyết định của cơ quan có thẩm quyền.',
            ],
        )
        case['status'] = 'request_supplement' if round_number == 1 else 'intake'
        case['consultations'].append(
            {
                'id': stable_id(key + '/response'),
                'text': followup,
                'response': '' if round_number == 1 else result_note,
                'actor': actor['name'],
                'at': submitted_at,
                'status': 'open' if round_number == 1 else 'responded',
            }
        )
        audit(case, actor, 'Xử lý nội bộ', result_note)
    case['updatedAt'] = now()
    return case, files


def main():
    if MODE != 'demo':
        raise SystemExit('Chỉ nạp bộ mẫu vào kho demo cục bộ; không ghi vào dữ liệu nghiệp vụ thật.')
    projects = json.load(sys.stdin)
    if not projects or len({p['id'] for p in projects}) != len(projects):
        raise SystemExit('Danh mục dự án rỗng hoặc trùng mã.')
    counts = {key: {'created': 0, 'updated': 0, 'kept': 0, 'documents': 0} for key in LABELS}
    for index, project in enumerate(projects):
        for procedure in LABELS:
            for round_number in (1, 2):
                id = stable_id(f"{project['id']}/{procedure}/{round_number}")
                with db() as con:
                    existing = con.execute('SELECT revision,payload FROM cases WHERE id=?', (id,)).fetchone()
                if existing:
                    saved = json.loads(existing['payload'])
                    if saved.get('seedVersion') == 'project-submissions-v1':
                        case, files = make_case(project, index, procedure, round_number)
                        with db() as con:
                            con.execute(
                                'UPDATE cases SET revision=?,payload=? WHERE id=?',
                                (case['revision'], json.dumps(case, ensure_ascii=False), case['id']),
                            )
                            con.execute('DELETE FROM files WHERE case_id=?', (case['id'],))
                            con.executemany('INSERT INTO files (case_id,id,data) VALUES (?,?,?)', files)
                        counts[procedure]['updated'] += 1
                        counts[procedure]['documents'] += len(files)
                    else:
                        counts[procedure]['kept'] += 1
                    continue
                case, files = make_case(project, index, procedure, round_number)
                with db() as con:
                    inserted = con.execute(
                        'INSERT OR IGNORE INTO cases VALUES (?,?,?)',
                        (case['id'], case['revision'], json.dumps(case, ensure_ascii=False)),
                    )
                    if inserted.rowcount:
                        con.executemany('INSERT INTO files (case_id,id,data) VALUES (?,?,?)', files)
                        counts[procedure]['created'] += 1
                        counts[procedure]['documents'] += len(files)
                    else:
                        counts[procedure]['kept'] += 1
    print(json.dumps({'projects': len(projects), 'procedures': counts, 'mode': MODE}, ensure_ascii=False))


if __name__ == '__main__':
    main()
