"""Versioned legal assistance. Applicability is reviewed, never inferred from a filename."""

from .domain import latest_documents

CUTOFF = '2026-07-01'
ND217 = 'https://vanban.chinhphu.vn/?classid=1&docid=218509&pageid=27160&typegroupid=4'
ND206 = 'https://vanban.chinhphu.vn/?docid=218454&orggroupid=2&pageid=27160'
LAW135 = 'https://vanban.chinhphu.vn/?classid=1&docid=216514&orggroupid=1&pageid=27160'
ANNEX217 = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/pl217.pdf'
SCOPES = {
    'construction': 'Cơ quan chuyên môn về xây dựng',
    'decision_maker': 'Đơn vị được người quyết định đầu tư giao thẩm định',
    'concurrent': 'Đơn vị thực hiện đồng thời hai phạm vi',
    'unknown': 'Chưa xác định phạm vi thẩm định',
}


def ref(label, url=ND217):
    return {'label': label, 'url': url}


def resolve_profile(case):
    context = case.get('legalContext', {})
    assessed = case['legalDate']
    submitted = context.get('submissionDate')
    prior = context.get('priorStatus', 'unknown')
    stage = context.get('stage', 'original')
    code, reason = 'pending', 'Cần ngày trình và tình trạng hồ sơ tại mốc 01/07/2026 để xét chuyển tiếp.'
    if assessed < '2024-12-30':
        reason = 'Thời điểm trước gói NĐ 175/2024; cần bổ sung bộ quy tắc lịch sử tương ứng.'
    elif assessed < CUTOFF:
        code, reason = (
            'nd175',
            'Thời điểm đánh giá trước 01/07/2026; đối chiếu NĐ 175/2024 và các sửa đổi có hiệu lực khi đó.',
        )
    elif stage in ['amendment', 'remaining_phase'] and prior == 'result_eligible':
        code, reason = (
            'nd217',
            'Điều chỉnh/giai đoạn còn lại sau kết quả trước 01/07/2026: khoản 1 Điều 76; thẩm quyền còn phải xét khoản 7–9.',
        )
    elif prior == 'result_eligible' and stage == 'original':
        code, reason = (
            'completed_legacy',
            'Đã có kết quả trước 01/07/2026: không thẩm định lại chỉ vì đổi nghị định (khoản 1 Điều 76).',
        )
    elif submitted and submitted >= CUTOFF:
        code, reason = 'nd217', 'Hồ sơ trình từ 01/07/2026; xét NĐ 217/2026 và các điều kiện phạm vi, thẩm quyền.'
    elif submitted and submitted < CUTOFF:
        if prior == 'eligible_pending':
            code, reason = (
                'nd175',
                'Đã trình, đủ điều kiện thẩm định nhưng chưa có kết quả trước 01/07/2026: tiếp tục theo NĐ 175 (khoản 2 Điều 76).',
            )
        elif prior in ['ineligible', 'result_ineligible']:
            code, reason = (
                'nd217',
                'Hồ sơ không đủ điều kiện thẩm định hoặc kết quả chưa đủ điều kiện tổng hợp trình phê duyệt: áp dụng NĐ 217 (khoản 2 Điều 76).',
            )
    scope = context.get('scope', 'unknown')
    confirmed = bool(context.get('confirmedBy')) and code != 'pending' and scope != 'unknown'
    return {
        'code': code,
        'reason': reason,
        'scope': scope,
        'scopeLabel': SCOPES[scope],
        'confirmed': confirmed,
        'context': context,
        'label': {
            'nd175': 'NĐ 175/2024 và văn bản sửa đổi theo thời điểm',
            'nd217': 'NĐ 217/2026',
            'pending': 'Chưa đủ căn cứ chọn chế độ pháp lý',
            'completed_legacy': 'Hồ sơ lịch sử đã có kết quả',
        }[code],
        'refs': [ref('Điều 75; khoản 1, 2, 7–9 Điều 76 NĐ 217/2026')],
        'templates': (
            {
                'submission': '01',
                'notice': {'construction': '03', 'decision_maker': '07', 'concurrent': '08'}.get(scope),
                'decision': '09',
                'supplement': '15',
                'suspension': '16',
            }
            if code == 'nd217'
            else {'submission': '01', 'notice': '03' if scope == 'construction' else None, 'decision': '06'}
            if code == 'nd175'
            else {}
        ),
    }


# id, title, condition (empty = core), default evidence groups, clause
NEW_ITEMS = [
    ('submission', 'Tờ trình theo Mẫu số 01', '', ['TTR'], 'khoản 2'),
    (
        'policy',
        'Chủ trương / thông tin dự án / đề án du lịch rừng',
        'Xác định loại văn bản phù hợp trường hợp dự án',
        [],
        'điểm a khoản 2',
    ),
    (
        'investment_transition',
        'Giấy tờ đầu tư chuyển tiếp',
        'Dự án chuyển tiếp không phải chấp thuận chủ trương',
        [],
        'điểm b khoản 2',
    ),
    (
        'architecture',
        'Phương án kiến trúc và bản vẽ được lựa chọn',
        'Thuộc diện thi tuyển kiến trúc',
        [],
        'điểm c khoản 2',
    ),
    ('planning', 'Văn bản và bản vẽ quy hoạch làm căn cứ lập dự án', '', [], 'điểm d khoản 2'),
    ('connections', 'Thỏa thuận đấu nối hạ tầng', 'Có yêu cầu đấu nối và văn bản tương ứng', [], 'điểm đ khoản 2'),
    (
        'height',
        'Chấp thuận độ cao công trình',
        'Thuộc trường hợp phải chấp thuận độ cao, xét ngoại lệ đã có ý kiến khi duyệt quy hoạch',
        [],
        'điểm đ khoản 2',
    ),
    (
        'other_legal',
        'Tài liệu pháp lý khác liên quan',
        'Có yêu cầu theo quy định chuyên ngành hoặc trường hợp dự án',
        [],
        'điểm e khoản 2',
    ),
    ('survey', 'Hồ sơ khảo sát xây dựng được phê duyệt', '', ['KT01', 'KT02'], 'điểm g khoản 2'),
    ('feasibility', 'Thuyết minh BCNCKT và hồ sơ thiết kế được lựa chọn', '', ['KT03', 'KT04'], 'điểm h khoản 2'),
    (
        'design_review',
        'Báo cáo thẩm tra thiết kế theo Mẫu số 02',
        'Xét khoản 5 Điều 26 Luật 135/2025 và trường hợp yêu cầu thẩm tra',
        [],
        'điểm h khoản 2',
    ),
    (
        'capacity',
        'Danh sách mã chứng chỉ hành nghề các chức danh chủ nhiệm, chủ trì',
        '',
        ['NL01'],
        'Mẫu 01, mục II.3 Phụ lục I',
    ),
    (
        'rail_standards',
        'Chấp thuận danh mục tiêu chuẩn đường sắt',
        'Dự án đường sắt có yêu cầu chấp thuận',
        [],
        'điểm i khoản 2',
    ),
    (
        'cost',
        'TMĐT và dữ liệu giá, định mức, báo giá, thẩm định giá nếu có',
        'Dự án tại điểm a, b, c khoản 1 Điều 17 Luật 135/2025',
        ['KT05'],
        'điểm k khoản 2',
    ),
    (
        'violation',
        'Báo cáo hiện trạng, xử phạt và kiểm định chịu lực',
        'Khắc phục vi phạm hành chính có yêu cầu thẩm định',
        [],
        'điểm l khoản 2',
    ),
    (
        'renovation',
        'Khảo sát hiện trạng và kiểm định khi sửa chữa',
        'Sửa chữa/cải tạo; kiểm định khi liên quan chịu lực',
        [],
        'điểm m khoản 2',
    ),
]
OLD_ITEMS = [
    ('submission', 'Tờ trình theo Mẫu số 01', '', ['TTR'], 'khoản 2'),
    (
        'policy',
        'Chủ trương đầu tư hoặc đề án du lịch rừng',
        'Dự án thuộc diện phải có văn bản tương ứng',
        [],
        'điểm a khoản 2',
    ),
    (
        'investment_transition',
        'Giấy tờ đầu tư chuyển tiếp',
        'Chuyển tiếp không phải chấp thuận chủ trương',
        [],
        'điểm b khoản 2',
    ),
    ('architecture', 'Kết quả thi tuyển kiến trúc và bản vẽ', 'Có yêu cầu thi tuyển', [], 'điểm c khoản 2'),
    ('planning', 'Quy hoạch làm căn cứ lập dự án và phụ lục', '', [], 'điểm d khoản 2'),
    (
        'parent_planning',
        'Quy hoạch làm căn cứ lập quy hoạch dự án',
        'Xác định văn bản, bản vẽ hoặc trích lục có liên quan',
        [],
        'điểm đ khoản 2',
    ),
    (
        'environment',
        'Kết quả thẩm định ĐTM hoặc giấy phép môi trường',
        'Nếu thuộc diện yêu cầu; được thực hiện đồng thời, gửi kết quả trước hạn thông báo 05 ngày',
        [],
        'điểm e khoản 2',
    ),
    (
        'connections',
        'Đấu nối hạ tầng và chấp thuận độ cao',
        'Nếu có yêu cầu; xét ngoại lệ tại giai đoạn quy hoạch',
        [],
        'điểm g khoản 2',
    ),
    ('other_legal', 'Tài liệu pháp lý khác', 'Nếu có yêu cầu', [], 'điểm h khoản 2'),
    ('survey', 'Hồ sơ khảo sát được phê duyệt', '', ['KT01', 'KT02'], 'điểm i khoản 2'),
    ('feasibility', 'BCNCKT, thiết kế và danh mục tiêu chuẩn', '', ['KT03', 'KT04'], 'điểm i khoản 2'),
    ('design_review', 'Báo cáo thẩm tra thiết kế', 'Nếu có yêu cầu', [], 'điểm i khoản 2'),
    ('capacity', 'Danh sách nhà thầu, mã chứng chỉ năng lực/hành nghề', '', ['NL01'], 'điểm k khoản 2'),
    (
        'cost',
        'TMĐT và căn cứ xác định chi phí',
        'Vốn đầu tư công, vốn nhà nước ngoài đầu tư công',
        ['KT05'],
        'điểm l khoản 2',
    ),
    (
        'violation',
        'Báo cáo thực tế, xử phạt và kiểm định chịu lực',
        'Khắc phục vi phạm có yêu cầu thẩm định',
        [],
        'điểm m khoản 2',
    ),
    (
        'renovation',
        'Khảo sát hiện trạng và kiểm định chịu lực',
        'Sửa chữa/cải tạo; kiểm định khi liên quan chịu lực',
        [],
        'điểm n khoản 2',
    ),
]


def legal_checklist(case, profile=None):
    p = profile or resolve_profile(case)
    if p['code'] not in ['nd217', 'nd175'] or p['scope'] not in ['construction', 'concurrent']:
        return []
    modern = p['code'] == 'nd217'
    reviews = case.get('legalRequirements', {})
    docs = latest_documents(case)
    result = []
    for key, title, condition, defaults, clause in NEW_ITEMS if modern else OLD_ITEMS:
        review = reviews.get(p['code'] + '.' + key, {})
        groups = review.get('requirementIds', defaults)
        attached = [d for d in docs if d['requirementId'] in groups]
        applicability = review.get('applicability', 'unknown') if condition else 'required'
        state = (
            'not_applicable'
            if applicability == 'not_applicable'
            else 'unknown'
            if applicability == 'unknown'
            else 'attached'
            if attached
            else 'missing'
        )
        result.append(
            {
                'id': p['code'] + '.' + key,
                'name': title,
                'condition': condition or 'Thành phần cơ bản theo điều khoản',
                'conditional': bool(condition),
                'applicability': applicability,
                'state': state,
                'requirementIds': groups,
                'documentIds': [d['id'] for d in attached],
                'note': review.get('note', ''),
                'reviewedBy': review.get('reviewedBy'),
                'legalRef': ref(
                    (clause + ' NĐ 217/2026')
                    if modern and key == 'capacity'
                    else f'{clause} Điều {35 if modern else 17} NĐ {217 if modern else 175}/{2026 if modern else 2024}',
                    ND217
                    if modern
                    else 'https://xaydungchinhsach.chinhphu.vn/nghi-dinh-so-175-2024-nd-cp-ve-quan-ly-hoat-dong-xay-dung-119241231085735892.htm',
                ),
            }
        )
    return result


def legal_overview(case):
    profile = resolve_profile(case)
    return {
        'profile': profile,
        'checklist': legal_checklist(case, profile),
        'warnings': [
            'Khoản 1 Điều 35 NĐ 217: kiểm tra ngôn ngữ, quy cách, tính pháp lý và xác nhận của cơ quan trình; không tự coi tài liệu OCR là bản ký hợp lệ.',
            'Nộp tệp chưa chứng minh tính hợp lệ, phê duyệt khảo sát, chữ ký số hoặc đủ bản vẽ.',
            'Thẩm quyền phải kiểm tra Điều 32–33 và chuyển tiếp Điều 76; địa phương công trình không tự quyết định cơ quan thẩm định.',
            'QCVN 10:2025/BCA trong thư mục bị đặt tên nhầm: nội dung về trang bị PCCC, không phải tiếp cận sử dụng. Kiểm tra QCVN 10:2024/BXD và chuyển tiếp.',
            'Bản dự thảo và bản chuyển đổi chưa đối chiếu nguyên bản không được dùng làm căn cứ kết luận.',
        ],
        'scopeNotes': [
            'CQ chuyên môn: Điều 27 Luật 135/2025, Điều 38 NĐ 217; quy hoạch, đấu nối, quy chuẩn/tiêu chuẩn, an toàn/PCCC, chi phí trong phạm vi quy định.',
            'Đơn vị của người quyết định đầu tư: Điều 26 Luật 135/2025; tổng hợp chủ trương, khả thi/hiệu quả, môi trường, quản lý và các nội dung thuộc nhiệm vụ được giao.',
            'Chi phí: tách khoản 2–3 và khoản 5 Điều 7 NĐ 206. Cộng số học hoặc chênh lệch tổng không phải kết luận chấp thuận/cắt giảm chi phí.',
        ],
    }


def appraisal_duration(group, grade):
    """Article 37 reference duration; deliberately does not invent a due date."""
    if group == 'national':
        return {'duration': 60, 'unit': 'calendar_days'}
    if group not in ['A', 'B', 'C'] or grade not in ['special', 'I', 'II', 'III', 'IV']:
        return None
    return {
        'duration': {'A': (25, 20), 'B': (20, 16), 'C': (15, 12)}[group][0 if grade in ['special', 'I'] else 1],
        'unit': 'working_days',
    }
