"""Draft sections aligned to Annex I of Decree 217; unsigned placeholders stay explicit."""

from .legal import legal_overview, ANNEX217
from .domain import latest_documents

GENERAL_FIELDS = [
    'Tên dự án',
    'Nhóm dự án; loại, cấp công trình chính; thời hạn sử dụng theo thiết kế',
    'Mã định danh dự án',
    'Quy mô đầu tư; phạm vi công trình trình thẩm định',
    'Người quyết định đầu tư',
    'Cơ quan chuẩn bị dự án và thông tin liên hệ',
    'Địa điểm cấp xã, tỉnh; vị trí, hướng tuyến nếu có; diện tích đất',
    'Tổng mức đầu tư; chi phí hạng mục trình thẩm định nếu có',
    'Nguồn vốn đầu tư',
    'Thời gian thực hiện; phân kỳ và thời hạn hoạt động nếu có',
    'Quy chuẩn, tiêu chuẩn áp dụng',
    'Nhà thầu lập BCNCKT, thiết kế; mã số doanh nghiệp',
    'Nhà thầu khảo sát; mã số doanh nghiệp',
    'Nhà thầu thẩm tra nếu có; mã số doanh nghiệp',
    'Thông tin khác nếu có',
]
DECISION_FIELDS = [
    'Tên dự án',
    'Loại, nhóm dự án; loại, cấp công trình chính; thời hạn sử dụng theo thiết kế',
    'Mã định danh dự án',
    'Địa điểm, vị trí/hướng tuyến, diện tích đất',
    'Người quyết định đầu tư',
    'Chủ đầu tư',
    'Nhà thầu lập BCNCKT, thiết kế, khảo sát; mã số doanh nghiệp',
    'Mục tiêu',
    'Quy mô dự án và phạm vi được phê duyệt',
    'Số bước thiết kế; danh mục quy chuẩn, tiêu chuẩn',
    'Tổng mức đầu tư và các khoản mục; chi phí theo phân kỳ nếu có',
    'Thời gian thực hiện; phân kỳ và thời hạn hoạt động nếu có',
    'Nguồn vốn và kế hoạch bố trí vốn',
    'Hình thức quản lý dự án',
    'Phân chia gói thầu; dự toán EPC/EC/EP nếu có',
    'Kế hoạch tổng thể lựa chọn nhà thầu nếu có',
    'Đào tạo, chuyển giao công nghệ nếu có',
    'Nguồn lực, tài nguyên; bồi thường, hỗ trợ, tái định cư nếu có',
    'Nội dung khác nếu có',
]


def draft_blocks(case, kind):
    overview = legal_overview(case)
    profile = overview['profile']
    if profile['code'] != 'nd217' or kind == 'report':
        return None
    # Templates 07/08 require a distinct assessment model, not relabelling template 03.
    if profile['scope'] != 'construction' and kind in ['notice', 'supplement', 'suspension']:
        return None
    titles = {
        'notice': 'DỰ THẢO THÔNG BÁO KẾT QUẢ THẨM ĐỊNH BCNCKT',
        'decision': 'KHUNG DỰ THẢO QUYẾT ĐỊNH PHÊ DUYỆT DỰ ÁN',
        'supplement': 'DỰ THẢO PHIẾU THÔNG BÁO BỔ SUNG, HOÀN THIỆN HỒ SƠ',
        'suspension': 'DỰ THẢO PHIẾU THÔNG BÁO TẠM DỪNG THẨM ĐỊNH',
    }
    numbers = {'notice': '03', 'decision': '09', 'supplement': '15', 'suspension': '16'}
    run = case['runs'][-1] if case['runs'] and not case['runs'][-1]['stale'] else None
    findings = run['findings'] if run else []
    docs = {d['id']: d for d in case['documents']}
    blocks = [
        {
            'letterhead': True,
            'agency': '[CƠ QUAN/TỔ CHỨC PHÊ DUYỆT]' if kind == 'decision' else '[CƠ QUAN CHUYÊN MÔN VỀ XÂY DỰNG]',
        },
        {
            'text': [
                f'Khung nội dung Mẫu số {numbers[kind]}, Phụ lục I NĐ 217/2026/NĐ-CP.',
                'Dự án: ' + str(case.get('projectName') or case['name']),
                'Chưa xác nhận đủ điều kiện; các chỗ trong ngoặc vuông do chuyên viên hoàn thiện từ hồ sơ đã kiểm tra.',
                'Phạm vi pháp lý: '
                + ('đã được xác nhận lựa chọn.' if profile['confirmed'] else 'đang chờ chuyên viên xác nhận.'),
            ]
        },
    ]
    legal = [
        'Luật Xây dựng số 135/2025/QH15; Nghị định 217/2026/NĐ-CP.',
        '[Bổ sung căn cứ giao thẩm quyền, văn bản dự án và các căn cứ áp dụng cụ thể đã xác minh].',
    ]

    def description(f):
        lines = [f['title'] + ': ' + f['explanation']]
        if f.get('calculation'):
            lines.append('Kiểm tra sơ bộ: ' + f['calculation'])
        for r in f.get('sources', [])[:1]:
            lines.append(
                'Chứng cứ: '
                + docs.get(r['documentId'], {}).get('name', 'Tài liệu')
                + ' — '
                + r['locator']
                + ': '
                + r['quote']
            )
        for r in f.get('legalRefs', []):
            lines.append('Căn cứ đối chiếu: ' + r['label'])
        if f.get('review'):
            lines.append('Ý kiến chuyên viên: ' + f['review']['note'])
        return lines

    if kind == 'notice':
        blocks += [
            {
                'text': [
                    'Kính gửi: [Cơ quan chuẩn bị dự án].',
                    'Tờ trình số [chưa xác nhận], ngày [chưa xác nhận].',
                    *legal,
                ]
            },
            {
                'heading': 'I. THÔNG TIN CHUNG VỀ DỰ ÁN',
                'text': [
                    f'{i + 1}. {name}: '
                    + (str(case.get('projectName') or case['name']) if i == 0 else '[Chưa xác nhận]')
                    for i, name in enumerate(GENERAL_FIELDS)
                ],
            },
            {
                'heading': 'II. HỒ SƠ TRÌNH THẨM ĐỊNH',
                'text': [
                    '1. Văn bản pháp lý; 2. Hồ sơ dự án, khảo sát, thiết kế; 3. Báo cáo thẩm tra nếu có.',
                    *[
                        d['name'] + ' — phiên bản ' + str(d['version']) + ' (đã nhận tệp, chưa xác nhận hợp lệ)'
                        for d in latest_documents(case)
                    ],
                ],
            },
            {
                'heading': 'III. NỘI DUNG HỒ SƠ TRÌNH THẨM ĐỊNH',
                'text': [
                    '[Tóm tắt nội dung đã xác nhận; với nhà: diện tích xây dựng/sàn, mật độ, hệ số sử dụng đất, tầng, chiều cao, chỉ giới, cốt xây dựng, công năng].'
                ],
            },
            {
                'heading': 'IV. PHẠM VI VÀ NGUYÊN TẮC THẨM ĐỊNH',
                'text': [
                    'Đối chiếu Điều 27 Luật 135/2025, Điều 38 và khoản 5 Điều 7 NĐ 217/2026.',
                    '[Xác định phạm vi công trình, nội dung thuộc thẩm quyền; trường hợp khắc phục xử phạt nếu có].',
                ],
            },
            {
                'heading': 'V. KẾT QUẢ THẨM ĐỊNH',
                'text': ['Các mục dưới đây là đề xuất rà soát, chưa phải kết luận được cơ quan thẩm định chấp thuận.'],
            },
        ]
        groups = [
            (
                '1. Lập dự án, thiết kế và điều kiện năng lực',
                ['Pháp lý và năng lực', 'Nhất quán', 'Thành phần theo pháp luật', 'Hồ sơ đầu vào'],
            ),
            ('2. Sự phù hợp với quy hoạch', ['Quy hoạch', 'Thiết kế']),
            ('3. Kết nối hạ tầng kỹ thuật', ['Hạ tầng']),
            (
                '4. Quy chuẩn, tiêu chuẩn; an toàn; giải pháp PCCC',
                ['Quy chuẩn', 'Khảo sát và kết cấu', 'PCCC và môi trường'],
            ),
            ('5. Quản lý chi phí đối với dự án đầu tư công, PPP', ['Chi phí']),
        ]
        for heading, categories in groups:
            selected = [f for f in findings if f['category'] in categories and f['result'] != 'consistent']
            blocks.append(
                {
                    'heading': heading,
                    'text': [line for f in selected for line in description(f)]
                    or ['[Chưa có đánh giá chuyên môn được xác nhận].'],
                }
            )
        blocks.append(
            {
                'heading': 'VI. KẾT LUẬN VÀ KIẾN NGHỊ',
                'text': [
                    '1. Kết luận: [Chưa lựa chọn. Người có thẩm quyền xác định: đủ điều kiện / chưa đủ điều kiện / chỉ đủ điều kiện sau khi hoàn thiện để tổng hợp, trình phê duyệt].',
                    '2. Kiến nghị: [Hoàn thiện các vấn đề đã được chuyên viên xác nhận; không dùng toàn bộ cảnh báo máy làm yêu cầu hành chính].',
                ],
            }
        )
    elif kind == 'decision':
        blocks += [
            {
                'text': [
                    *legal,
                    'NĐ 206/2026/NĐ-CP và căn cứ quản lý chi phí áp dụng.',
                    '[Số, ngày thông báo kết quả thẩm định của CQ chuyên môn và đơn vị được người quyết định đầu tư giao thẩm định].',
                    '[Tờ trình đề nghị phê duyệt; chức danh, căn cứ thẩm quyền người ký].',
                ]
            },
            {
                'heading': 'Điều 1. Nội dung dự án đề nghị phê duyệt',
                'text': [
                    f'{i + 1}. {name}: '
                    + (
                        str(case.get('projectName') or case['name'])
                        if i == 0
                        else '[Chưa xác nhận; bổ sung từ hồ sơ và kết quả thẩm định]'
                    )
                    for i, name in enumerate(DECISION_FIELDS)
                ],
            },
            {
                'heading': 'Điều 2. Tổ chức thực hiện',
                'text': ['[Nhiệm vụ và trách nhiệm của chủ đầu tư, đơn vị liên quan; điều kiện cần hoàn thành].'],
            },
            {
                'heading': 'Điều 3. Trách nhiệm thi hành',
                'text': ['[Tổ chức, cá nhân chịu trách nhiệm; nội dung hiệu lực do người có thẩm quyền xác định].'],
            },
        ]
    else:
        procedural = (
            'khoản 3 Điều 36 (bổ sung thành phần hồ sơ)'
            if kind == 'supplement'
            else 'khoản 4 Điều 36 (lỗi/sai sót cản trở kết luận trong quá trình thẩm định)'
        )
        selected = (
            [
                f
                for f in findings
                if f['code'].startswith(('INPUT.', 'LAW.INPUT.')) and f['result'] == 'insufficient_evidence'
            ]
            if kind == 'supplement'
            else [f for f in findings if f['result'] == 'inconsistent']
        )
        blocks += [
            {
                'text': [
                    'Kính gửi: [Cơ quan chuẩn bị dự án].',
                    'Tờ trình số [chưa xác nhận], ngày [chưa xác nhận].',
                    'Đối chiếu '
                    + procedural
                    + '. Người thụ lý phải xác định đúng giai đoạn và nội dung trước khi phát hành.',
                    'Danh sách bên dưới là ứng viên cần rà soát; mục chưa biết điều kiện áp dụng chưa được coi là tài liệu bắt buộc còn thiếu.',
                ]
            },
            {
                'heading': 'Nội dung đề xuất cần xác minh',
                'text': [line for f in selected for line in description(f)]
                or ['Chưa phát hiện nội dung phù hợp loại phiếu này. Không có căn cứ tự phát hành phiếu.'],
            },
            {
                'heading': 'Thời hạn và xử lý tiếp theo',
                'text': [
                    'Khoản 5 Điều 36: thời hạn khắc phục là 20 ngày làm việc từ ngày nhận yêu cầu, không kể thời gian bất khả kháng; hết hạn không bổ sung thì xử lý dừng thẩm định theo quy định.',
                    'Bổ sung thành phần trong 05 ngày làm việc từ tiếp nhận, tối đa một lần; tạm dừng theo khoản 4 tối đa một lần. Chưa ghi ngày nhận, ngày hết hạn hoặc tình trạng ban hành trong bản dự thảo này.',
                    'Hồ sơ trình lại sau khi đã dừng được tính lại thời hạn theo quy định. Cần lịch nghỉ và dữ liệu tiếp nhận thực tế để tính hạn.',
                ],
            },
        ]
    blocks.append(
        {
            'heading': 'Nơi nhận và ký ban hành',
            'text': [
                '[Nơi nhận theo mẫu và thẩm quyền; lưu hồ sơ].',
                '[Chức danh, họ tên người ký — để trống chữ ký và con dấu].',
                'Nguồn cấu trúc biểu mẫu: ' + ANNEX217,
            ],
        }
    )
    return titles[kind], blocks
