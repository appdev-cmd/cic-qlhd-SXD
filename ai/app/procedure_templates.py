"""Unsigned, editable draft sections mapped to the official annex and procedure."""

from .procedure_rules import PL217, ND207
from datetime import date

FIELD_LABELS = {
    'projectNationalId': 'Mã định danh dự án',
    'buildingId': 'Mã định danh công trình',
    'buildingClass': 'Loại, cấp công trình',
    'designer': 'Tổ chức/cá nhân thiết kế và mã chứng chỉ',
    'designLead': 'Chủ nhiệm, chủ trì thiết kế và mã chứng chỉ',
    'verifier': 'Tổ chức và chủ trì thẩm tra, mã chứng chỉ',
    'land': 'Lô/thửa đất, diện tích đất và giấy tờ về đất',
    'elevation': 'Cốt xây dựng (m)',
    'setback': 'Khoảng lùi (m)',
    'density': 'Mật độ xây dựng (%)',
    'landRatio': 'Hệ số sử dụng đất',
    'boundaries': 'Chỉ giới đường đỏ, chỉ giới xây dựng',
    'area': 'Diện tích xây dựng (m²)',
    'floorArea': 'Tổng diện tích sàn, phân theo tầng (m²)',
    'height': 'Chiều cao, phân theo tầng (m)',
    'depth': 'Chiều sâu (m)',
    'floors': 'Số tầng, tầng hầm, kỹ thuật, lửng, tum',
    'color': 'Màu sắc',
    'route': 'Tuyến, điểm đầu/cuối, chiều dài, rộng, tĩnh không và độ sâu theo đoạn',
    'stages': 'Phạm vi, thông số từng giai đoạn / từng công trình',
    'groupCount': 'Số công trình, công trình đã khởi công',
    'existing': 'Hiện trạng trước sửa chữa, di dời',
    'originLocation': 'Vị trí trước di dời',
    'relocationSchedule': 'Thời gian bắt đầu và kết thúc di dời',
    'temporaryTerm': 'Thời hạn tồn tại',
    'authorityBasis': 'Căn cứ xác định thẩm quyền',
    'specializedBasis': 'Văn bản PCCC, môi trường, chuyên ngành',
    'completionReport': 'Báo cáo hoàn thành thi công (số, ngày)',
    'acceptanceRecord': 'Biên bản nghiệm thu của chủ đầu tư (số, ngày)',
    'correctionReport': 'Báo cáo khắc phục (nếu có)',
    'remainingSafety': 'An toàn, vận hành khi tiếp tục thi công',
}


def draft_blocks(case, r, spec, kind='draft'):
    def value(key):
        return r.get('details', {}).get(key) or '[chưa xác nhận]'

    def fields(keys):
        from .procedure_review import DETAILS

        return [(FIELD_LABELS.get(k) or DETAILS[k]) + ': ' + value(k) for k in keys]

    project = str(case.get('projectName') or case['name'])
    is_input = kind == 'application'
    common = [
        {
            'letterhead': True,
            'nationalOnly': is_input and case['procedure'] == 'gpxd',
            'agency': (r['investor'] if is_input else r['authority']) or '[chưa xác nhận]',
        },
        {
            'text': [
                'DỰ THẢO CHƯA KÝ, CHƯA BAN HÀNH. Nội dung chưa xác nhận phải được hoàn thiện từ hồ sơ.',
                spec['citation'],
                'Phiên bản đối chiếu: ' + spec['ruleVersion'],
            ]
        },
    ]
    permit = case.get('permit')
    if permit and not is_input and case['procedure'] == 'gpxd':
        issued = date.fromisoformat(permit['issueDate']).strftime('%d/%m/%Y')
        deadline = date.fromisoformat(permit['startDeadline']).strftime('%d/%m/%Y')
        common[1]['text'].insert(
            0,
            f"Số: {permit['number']} — ngày cấp {issued}; hạn khởi công đến {deadline} (khoản 10 Điều 49 NĐ 217/2026).",
        )
    owner = [
        'Chủ đầu tư: ' + (r['investor'] or '[chưa xác nhận]'),
        'Số định danh / mã số doanh nghiệp: ' + value('ownerIdentity'),
        'Địa chỉ: ' + value('ownerAddress'),
        'Người đại diện, chức vụ, số định danh: ' + value('representative'),
        'Liên hệ: ' + value('contact'),
    ]
    sign = [
        {
            'keepTogether': True,
            'heading': 'Nơi nhận và ký xác nhận' if is_input else 'Nơi nhận và ký ban hành',
            'text': [
                '[Hoàn thiện nơi nhận theo hồ sơ và thẩm quyền].',
                '[Người làm đơn/đại diện chủ đầu tư ký, ghi rõ họ tên; đóng dấu nếu có — chưa ký]'
                if is_input
                else '[Người có thẩm quyền ký, ghi rõ chức vụ, họ tên và đóng dấu — chưa ký]',
            ],
        }
    ]
    submitted = [d['name'] for d in case['documents'] if d['role'] == 'submission']
    attached = {'heading': 'Tài liệu gửi kèm', 'text': submitted or ['[Chưa nộp tài liệu]']}
    if case['procedure'] == 'nghiem_thu' and r['subtype'] == 'start_notice':
        title = (
            'DỰ THẢO THÔNG BÁO KHỞI CÔNG XÂY DỰNG (PHỤ LỤC V)'
            if is_input
            else 'DỰ THẢO PHIẾU TIẾP NHẬN THÔNG BÁO KHỞI CÔNG VÀ KẾ HOẠCH KIỂM TRA'
        )
        blocks = common + [
            {
                'text': [
                    'Đối chiếu Phụ lục V, khoản 2 Điều 12 và Điều 27 NĐ 207/2026/NĐ-CP.',
                    'Kính gửi: ' + r['investor'],
                ]
            },
            {
                'heading': '1. Thông tin khởi công',
                'text': [
                    'Công trình: ' + project + '; phạm vi: ' + r['scope'],
                    'Địa điểm: ' + r['location'],
                    *fields(
                        ['projectNationalId', 'buildingId', 'buildingClass', 'startDate', 'contractors', 'contact']
                    ),
                ],
            },
            {
                'heading': '2. Căn cứ khởi công',
                'text': [
                    *fields(['permitNumber', 'appraisalNotice']),
                    'Công trình miễn phép: kiểm tra điều kiện miễn phép, sự phù hợp quy hoạch và thông số chủ yếu của thiết kế tại BCNCKT đã thẩm định (điểm c khoản 2 Điều 67 NĐ 217/2026).',
                ],
            },
            {
                'heading': '3. Cập nhật cơ sở dữ liệu và kế hoạch kiểm tra',
                'text': [
                    'Cập nhật dữ liệu thông báo khởi công vào cơ sở dữ liệu quốc gia về hoạt động xây dựng.',
                    *fields(['inspectionPlan']),
                    'Số lần kiểm tra trong thi công không quá 03 lần (cấp đặc biệt, cấp I) hoặc 02 lần (công trình khác), trừ trường hợp có sự cố hoặc nghiệm thu từng phần, có điều kiện.',
                    r['conditions'],
                ],
            },
        ]
        return title, blocks + [{'text': ['Nguồn biểu mẫu: ' + ND207]}] + sign
    elif case['procedure'] == 'nghiem_thu' and r['subtype'] == 'during':
        title = 'DỰ THẢO THÔNG BÁO KẾT QUẢ KIỂM TRA CÔNG TÁC NGHIỆM THU TRONG QUÁ TRÌNH THI CÔNG'
        visit = date.fromisoformat(r['visitDate']).strftime('%d/%m/%Y') if r.get('visitDate') else '[chưa xác nhận]'
        blocks = common + [
            {
                'text': [
                    'Điểm a khoản 1, khoản 3 Điều 27 NĐ 207/2026/NĐ-CP; thời hạn ra văn bản không quá 10 ngày làm việc kể từ ngày kiểm tra.',
                    'Kính gửi: ' + r['investor'],
                    *fields(['authorityBasis']),
                ],
            },
            {
                'heading': '1. Công trình được kiểm tra',
                'text': [
                    'Tên: ' + project + '; phạm vi: ' + r['scope'],
                    'Địa điểm: ' + r['location'],
                    *fields(['buildingClass', 'startDate', 'contractors']),
                ],
            },
            {
                'heading': '2. Kiểm tra hiện trường',
                'text': ['Ngày kiểm tra: ' + visit, 'Thành phần: ' + r['participants'], r['observations']],
            },
            {
                'heading': '3. Kết quả kiểm tra việc tuân thủ quản lý chất lượng, an toàn',
                'text': [
                    *fields(['qualityAssessment', 'verificationTests', 'extraReason']),
                    *['- ' + d['description'] + ' (' + d['responsible'] + ')' for d in r.get('defects', [])],
                ],
            },
            {
                'heading': '4. Yêu cầu đối với chủ đầu tư',
                'text': [r['conditions'] or '[Các tồn tại cần khắc phục, thời hạn báo cáo].'],
            },
        ]
        return title, blocks + [{'text': ['Nguồn biểu mẫu: ' + ND207]}] + sign
    elif case['procedure'] == 'nghiem_thu':
        subtype = {'complete': 'hoàn thành', 'conditional': 'có điều kiện', 'partial': 'một phần'}[r['subtype']]
        if is_input:
            title = 'DỰ THẢO BÁO CÁO HOÀN THÀNH THI CÔNG XÂY DỰNG'
            blocks = common + [
                {'text': ['Khung Phụ lục VI NĐ 207/2026/NĐ-CP.', 'Kính gửi: ' + r['authority']]},
                {
                    'heading': 'Thông tin và kết quả thi công',
                    'text': [
                        '1. Tên công trình, phần công trình thuộc dự án: ' + project + '; phạm vi: ' + r['scope'],
                        '2. Mã định danh dự án: '
                        + value('projectNationalId')
                        + '; mã định danh công trình: '
                        + value('buildingId'),
                        '3. Địa điểm: ' + r['location'],
                        '4. Người liên hệ, số điện thoại: ' + value('contact'),
                        '5. Quy mô, thông số kỹ thuật: ' + r['parameters'],
                        '6. Nhà thầu khảo sát, thiết kế, thi công, giám sát: ' + value('contractors'),
                        '7. Ngày khởi công, ngày hoàn thành: ' + value('constructionPeriod'),
                        '8. Khối lượng thực hiện: ' + value('completedQuantities'),
                        '9. Đánh giá chất lượng so với thiết kế: ' + value('qualityAssessment'),
                        '10. Điều kiện đưa vào sử dụng: ' + r['conditions'],
                        '11. Danh mục hồ sơ hoàn thành được gửi kèm dưới đây.',
                    ],
                },
                attached,
                {
                    'heading': 'Cam kết của chủ đầu tư',
                    'text': [
                        '[Chủ đầu tư đối chiếu và xác nhận việc thi công theo thiết kế, đáp ứng điều kiện nghiệm thu và tính chính xác của báo cáo trước khi ký].'
                    ],
                },
            ]
        else:
            title = 'DỰ THẢO THÔNG BÁO KẾT QUẢ KIỂM TRA CÔNG TÁC NGHIỆM THU'
            blocks = common + [
                {
                    'text': [
                        'Khung Phụ lục VIII NĐ 207/2026/NĐ-CP.',
                        'Kính gửi: ' + r['investor'],
                        *fields(['authorityBasis']),
                        'Căn cứ giấy phép (nếu thuộc diện): ' + r['priorPermit'],
                        'Căn cứ thiết kế được duyệt, điều chỉnh: ' + r['designBasis'],
                        *fields(['completionReport', 'correctionReport', 'acceptanceRecord', 'specializedBasis']),
                    ]
                },
                {
                    'heading': 'Kết quả kiểm tra',
                    'text': [
                        '[Cơ quan có thẩm quyền xác định chấp thuận hoặc không chấp thuận kết quả nghiệm thu '
                        + subtype
                        + ' của chủ đầu tư; chưa lựa chọn kết luận].'
                    ],
                },
                {
                    'heading': '1. Công trình, hạng mục và phạm vi',
                    'text': [
                        'Tên: ' + project,
                        *fields(['projectNationalId', 'buildingId']),
                        'Địa điểm: ' + r['location'],
                        *fields(['buildingClass']),
                        'Thông số: ' + r['parameters'],
                        'Phạm vi: ' + r['scope'],
                    ],
                },
                {
                    'heading': '2. Yêu cầu đối với chủ đầu tư',
                    'text': [
                        'Lưu trữ hồ sơ hoàn thành; quản lý, khai thác, vận hành theo công năng và thiết kế được duyệt.',
                        'Điều kiện, giới hạn sử dụng và yêu cầu cụ thể: ' + (r['conditions'] or '[chưa xác nhận]'),
                    ],
                },
            ]
            if r['subtype'] == 'partial':
                blocks.append({'text': fields(['remainingSafety'])})
            if r['defects']:
                blocks.append(
                    {
                        'heading': 'Công việc còn lại và theo dõi khắc phục',
                        'text': [
                            d['description']
                            + ' — Phụ trách: '
                            + d['responsible']
                            + '; hạn: '
                            + (
                                date.fromisoformat(d['dueDate']).strftime('%d/%m/%Y')
                                if d.get('dueDate')
                                else '[chưa xác nhận]'
                            )
                            + '; '
                            + ('đã khắc phục' if d['status'] == 'resolved' else 'chưa khắc phục')
                            + '. '
                            + d['resolution']
                            for d in r['defects']
                        ],
                    }
                )
            if r['subtype'] == 'conditional':
                blocks.append(
                    {
                        'text': [
                            'Chủ đầu tư hoàn thành tồn tại, tổ chức nghiệm thu hoàn thành và báo cáo kèm báo cáo nhà thầu để cơ quan chuyên môn xem xét theo khoản 5 Điều 27.'
                        ]
                    }
                )
        return title, blocks + [{'text': ['Nguồn biểu mẫu: ' + ND207]}] + sign

    subtype = r['subtype']
    names = {
        'new': 'XÂY DỰNG MỚI',
        'stage': 'XÂY DỰNG THEO GIAI ĐOẠN',
        'group': 'XÂY DỰNG NHÓM CÔNG TRÌNH',
        'house': 'XÂY DỰNG NHÀ Ở RIÊNG LẺ',
        'repair': 'SỬA CHỮA, CẢI TẠO',
        'relocation': 'DI DỜI CÔNG TRÌNH',
        'temporary': 'XÂY DỰNG CÓ THỜI HẠN',
        'amendment': 'ĐIỀU CHỈNH',
        'extension': 'GIA HẠN',
        'reissue': 'CẤP LẠI',
    }
    technical = [
        'buildingId',
        'buildingClass',
        'designer',
        'designLead',
        'verifier',
        'elevation',
        'setback',
        'density',
        'landRatio',
        'boundaries',
        'area',
        'floorArea',
        'height',
        'depth',
        'floors',
        'color',
        'route',
    ]
    if subtype in ('stage', 'group'):
        technical += ['stages']
    if subtype == 'group':
        technical += ['groupCount']
    if subtype in ('repair', 'relocation'):
        technical += ['existing']
    if subtype == 'relocation':
        technical += ['originLocation', 'relocationSchedule']
    if subtype == 'temporary':
        technical += ['temporaryTerm']
    change = subtype in ('amendment', 'extension', 'reissue')
    if is_input:
        title = 'DỰ THẢO ĐƠN ĐỀ NGHỊ ' + (
            names[subtype] + ' GIẤY PHÉP XÂY DỰNG' if change else 'CẤP GIẤY PHÉP ' + names[subtype]
        )
        blocks = common + [
            {
                'text': [
                    'Tham chiếu Mẫu ' + ('02' if change else '01') + ' Phụ lục II NĐ 217/2026/NĐ-CP.',
                    'Kính gửi: ' + r['authority'],
                ]
            },
            {'heading': '1. Chủ đầu tư', 'text': owner},
            {'heading': '2. Địa điểm xây dựng', 'text': [r['location'], *fields(['land'])]},
            {
                'heading': '3. Giấy phép đã cấp' if change else '3. Tổ chức, cá nhân thiết kế và thẩm tra',
                'text': [r['priorPermit'], 'Nội dung giấy phép đã cấp: ' + value('existing')]
                if change
                else fields(['designer', 'designLead', 'verifier']),
            },
            {
                'heading': '4. Nội dung đề nghị',
                'text': [value('adjustment'), 'Lý do: ' + r['conditions']]
                if change
                else [
                    'Dự án: ' + project,
                    'Phạm vi: ' + r['scope'],
                    *fields([k for k in technical if k not in ('designer', 'designLead', 'verifier')]),
                ],
            },
            {'heading': '5. Thời gian hoàn thành dự kiến', 'text': [value('schedule') + ' tháng']},
            {
                'heading': '6. Cam kết',
                'text': [
                    '[Người làm đơn xác nhận cam kết thực hiện đúng giấy phép và chịu trách nhiệm theo pháp luật trước khi ký].'
                ],
            },
            attached,
        ]
    elif subtype == 'reissue':
        return 'PHIẾU CHUẨN BỊ BẢN SAO GIẤY PHÉP CẤP LẠI', common + [
            {
                'text': [
                    'Điều 64: giấy phép cấp lại là bản sao giấy phép đã cấp. Phiếu này để chuẩn bị bản sao, không phải giấy phép mới.',
                    'Giấy phép gốc: ' + r['priorPermit'],
                    'Lý do cấp lại: ' + r['conditions'],
                    'Nguồn để lập bản sao: [hồ sơ lưu đã xác minh].',
                ]
            }
        ]
    elif subtype in ('amendment', 'extension'):
        form = r.get('originalForm') or '[chưa xác định mẫu giấy phép gốc]'
        title = 'DỰ THẢO NỘI DUNG ' + names[subtype] + ' GIẤY PHÉP XÂY DỰNG'
        blocks = common + [
            {
                'text': [
                    'Ghi trực tiếp trên bản chính hoặc lập phụ lục bổ sung kèm giấy phép đã cấp theo điểm c khoản 3 Điều 63.',
                    'Mẫu giấy phép gốc: ' + form + ' Phụ lục II.',
                    'Giấy phép đã cấp: ' + r['priorPermit'],
                    'Chủ đầu tư: ' + r['investor'],
                    'Công trình: ' + project,
                    'Địa điểm: ' + r['location'],
                ]
            },
            {
                'heading': 'Nội dung ' + names[subtype].lower(),
                'text': [
                    value('adjustment'),
                    'Căn cứ thiết kế điều chỉnh: ' + r['designBasis']
                    if subtype == 'amendment'
                    else 'Lần gia hạn: '
                    + str(r.get('extensionCount') or '[chưa xác nhận]')
                    + '; thời gian gia hạn: 12 tháng. Tối đa 02 lần.',
                    'Thời điểm có hiệu lực và mốc kết thúc: [cơ quan có thẩm quyền xác định].',
                    r['conditions'],
                ],
            },
        ]
    else:
        number = '04' if subtype in ('repair', 'relocation') else '05' if subtype == 'temporary' else '03'
        title = 'DỰ THẢO GIẤY PHÉP ' + names[subtype]
        blocks = common + [
            {'text': ['Tham chiếu Mẫu ' + number + ' Phụ lục II NĐ 217/2026/NĐ-CP.']},
            {'heading': '1. Cấp cho', 'text': owner},
            {
                'heading': '2. Nội dung cấp phép',
                'text': [
                    'Công trình: ' + project,
                    'Địa điểm: ' + r['location'],
                    'Phạm vi: ' + r['scope'],
                    'Theo thiết kế: ' + r['designBasis'],
                    *fields(technical),
                ],
            },
            {'heading': '3. Giấy tờ về đất và quyền sở hữu', 'text': fields(['land'])},
            {'heading': '4. Tiến độ dự kiến', 'text': [value('schedule') + ' tháng']},
            {
                'heading': '5. Hiệu lực khởi công',
                'text': [
                    'Giấy phép có hiệu lực khởi công 12 tháng kể từ ngày cấp; quá thời hạn phải đề nghị gia hạn theo quy định.'
                ],
            },
            {
                'heading': 'Yêu cầu đối với chủ đầu tư',
                'text': [
                    'Bảo đảm quyền hợp pháp của chủ sở hữu liền kề; thực hiện quy định đất đai, xây dựng và nội dung giấy phép.',
                    'Thông báo khởi công; xuất trình giấy phép và treo biển báo theo quy định. Điều chỉnh thiết kế thuộc Điều 63 phải điều chỉnh giấy phép.',
                    r['conditions'],
                ],
            },
        ]
        if subtype == 'temporary':
            blocks.append(
                {
                    'text': [
                        'Thời hạn tồn tại: ' + value('temporaryTerm'),
                        'Tháo dỡ theo thời hạn, quy hoạch và nghĩa vụ quy định tại Mẫu 05; hoàn thiện nội dung cụ thể từ căn cứ địa phương trước khi ký.',
                    ]
                }
            )
    return title, blocks + [{'text': ['Nguồn biểu mẫu: ' + PL217]}] + sign
