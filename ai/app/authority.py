"""Competent-authority suggestion for the three procedures handled by a provincial Department of Construction.

Rules follow Luật Xây dựng 135/2025 (Điều 27, 43), NĐ 217/2026 (Điều 32, 33, 53, 73; Phụ lục III, IV) and
NĐ 207/2026 (Điều 25, 26; Phụ lục IX). The result is a *suggestion* with its legal basis and the facts
still missing: an officer confirms it; the system never rejects a submission on its own.
"""

from .sla import normalize_grade, normalize_group

SO_XD = 'so_xay_dung'
LABELS = {
    SO_XD: 'Sở Xây dựng (cơ quan chuyên môn về xây dựng thuộc UBND tỉnh)',
    'ubnd_xa': 'Cơ quan chuyên môn về xây dựng thuộc UBND cấp xã',
    'bql_kcn': 'Ban Quản lý khu công nghiệp, khu kinh tế',
    'bo_chuyen_nganh': 'Cơ quan chuyên môn về xây dựng thuộc bộ quản lý công trình chuyên ngành',
    'so_nnmt': 'Sở Nông nghiệp và Môi trường',
    'so_cong_thuong': 'Sở Công Thương',
    'hoi_dong': 'Hội đồng kiểm tra nhà nước về công tác nghiệm thu',
    'khong_thuoc_dien': 'Không thuộc đối tượng phải thực hiện tại cơ quan chuyên môn về xây dựng',
    'mien_phep': 'Miễn giấy phép xây dựng — chủ đầu tư gửi thông báo khởi công',
    'chua_xac_dinh': 'Chưa đủ thông tin để xác định',
}
GRADE_RANK = {'DB': 4, 'I': 3, 'II': 2, 'III': 1, 'IV': 0}
# Chuyên ngành of Sở Xây dựng per khoản 5 Điều 73 NĐ 217/2026 (công trình giao thông included).
SO_XD_FIELDS = (
    'dân dụng',
    'tôn giáo',
    'tín ngưỡng',
    'giao thông',
    'hạ tầng kỹ thuật',
    'khu đô thị',
    'nhà ở',
    'vật liệu xây dựng',
    'công nghiệp nhẹ',
)
AGRICULTURE_FIELDS = ('nông nghiệp', 'thủy lợi', 'đê điều', 'môi trường')
INDUSTRY_FIELDS = ('công nghiệp',)
ZONE_WORDS = ('khu công nghiệp', 'khu kinh tế', 'khu chế xuất', 'khu công nghệ cao', 'kcn')


def _text(value):
    return str(value or '').strip().lower()


def _get(project, *keys):
    for key in keys:
        if project.get(key) not in (None, ''):
            return project.get(key)
    return None


def facts(project):
    """Normalized project facts used by every rule (demo JSON and cloud rows use different keys)."""
    investment = _text(_get(project, 'investment_form', 'investmentForm'))
    tt39 = project.get('tt39_data') or {}
    if not investment:
        source = _text(tt39.get('projectType')) + ' ' + _text(tt39.get('fundingSource'))
        investment = 'dau_tu_cong' if 'đầu tư công' in source or 'ngân sách' in source else ''
    location = _text(_get(project, 'location_district', 'location'))
    return {
        'field': _text(_get(project, 'field', 'projectField')),
        'group': normalize_group(_get(project, 'group_type', 'projectGroup')),
        'grade': normalize_grade(_get(project, 'grade', 'buildingGrade')),
        'investment': investment or None,
        'commune': bool(_get(project, 'decided_by_commune', 'decidedByCommune')),
        'appendixIv': _get(project, 'is_appendix_iv', 'isAppendixIv'),
        'zone': any(word in location for word in ZONE_WORDS),
        'location': location,
    }


def appendix_iv(f):
    """(True|False|None, item) — công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng (Phụ lục IV NĐ 217)."""
    if f['appendixIv'] is True:
        return True, 'Đã xác nhận thuộc Phụ lục IV'
    grade = GRADE_RANK.get(f['grade'])
    if grade is None:
        return None, 'Chưa có cấp công trình'
    field = f['field']
    if any(word in field for word in ('tôn giáo', 'tín ngưỡng')):
        return False, 'Công trình tôn giáo, tín ngưỡng không thuộc danh mục Phụ lục IV'
    if any(word in field for word in ('kho', 'bãi')):
        return False, 'Kho, bãi không thuộc danh mục Phụ lục IV'
    if any(word in field for word in ('đê điều',)):
        return True, 'V.2 Công trình đê điều (mọi cấp)'
    if any(word in field for word in ('thủy lợi', 'hồ chứa', 'đập')):
        if grade >= GRADE_RANK['II']:
            return True, 'V.1 Công trình thủy lợi (cấp II trở lên)'
        if grade == GRADE_RANK['III']:
            return None, 'V.1 Hồ chứa, đập ngăn nước cấp III thuộc Phụ lục IV — cần xác định loại công trình'
        return False, 'V.1 Công trình thủy lợi cấp IV'
    if grade >= GRADE_RANK['II']:
        item = (
            'I Công trình dân dụng'
            if 'dân dụng' in field or 'nhà ở' in field
            else 'IV Công trình giao thông'
            if 'giao thông' in field
            else 'III Công trình hạ tầng kỹ thuật'
            if 'hạ tầng' in field
            else 'II Công trình công nghiệp'
            if 'công nghiệp' in field
            else 'Công trình cấp II trở lên'
        )
        # Most Phụ lục IV items start at cấp II; the exact item still needs confirmation from the design.
        return True, item + ' (cấp II trở lên — xác nhận hạng mục trong Phụ lục IV)'
    if 'giao thông' in field:
        return None, 'IV Cao tốc, đường sắt, hầm Metro áp dụng mọi cấp — cần xác định loại công trình'
    return False, 'Công trình cấp III, IV ngoài các loại áp dụng mọi cấp'


def _speciality(f):
    field = f['field']
    if any(word in field for word in AGRICULTURE_FIELDS):
        return 'so_nnmt', 'Điểm b khoản 5 Điều 73 NĐ 217/2026'
    if any(word in field for word in SO_XD_FIELDS):
        return SO_XD, 'Điểm a khoản 5 Điều 73 NĐ 217/2026'
    if any(word in field for word in INDUSTRY_FIELDS):
        return 'so_cong_thuong', 'Điểm c khoản 5 Điều 73 NĐ 217/2026 (trừ công nghiệp nhẹ, vật liệu xây dựng)'
    return None, 'Chưa có lĩnh vực/chuyên ngành của dự án'


def _result(authority, basis, reasons, missing, suggestion):
    return {
        'authority': authority,
        'label': LABELS[authority],
        'inScope': authority == SO_XD if authority != 'chua_xac_dinh' else None,
        'basis': basis,
        'reasons': reasons,
        'missing': missing,
        'suggestion': suggestion,
        'requiresConfirmation': True,
    }


def feasibility(f):
    """Thẩm định BCNCKT — Điều 27 Luật 135/2025; Điều 32, 33, 73 NĐ 217/2026."""
    missing = [
        m
        for m, ok in [
            ('nguồn vốn/hình thức đầu tư', f['investment']),
            ('nhóm dự án', f['group']),
            ('cấp công trình', f['grade']),
            ('lĩnh vực', f['field']),
        ]
        if not ok
    ]
    if f['commune']:
        return _result(
            'ubnd_xa',
            ['Khoản 4 Điều 32 NĐ 217/2026'],
            ['Dự án do UBND cấp xã quyết định đầu tư.'],
            missing,
            'reject_intake',
        )
    if f['group'] == 'QG' or f['grade'] == 'DB':
        return _result(
            'bo_chuyen_nganh',
            ['Khoản 2 Điều 32 NĐ 217/2026'],
            ['Dự án quan trọng quốc gia hoặc có công trình cấp đặc biệt.'],
            missing,
            'reject_intake',
        )
    if f['zone']:
        return _result(
            'bql_kcn',
            ['Khoản 3 Điều 32; điểm d khoản 5 Điều 73 NĐ 217/2026'],
            ['Địa điểm thuộc khu công nghiệp/khu kinh tế.'],
            missing,
            'confirm',
        )
    if f['investment'] == 'kinh_doanh':
        listed, item = appendix_iv(f)
        if listed is False:
            return _result(
                'khong_thuoc_dien',
                ['Điểm c khoản 1 Điều 27 Luật Xây dựng 135/2025', 'Điều 32 khoản 1 NĐ 217/2026'],
                ['Dự án kinh doanh không thuộc quy mô lớn và không có công trình Phụ lục IV.'],
                missing,
                'reject_intake',
            )
        if listed is None:
            missing.append('xác nhận công trình thuộc Phụ lục IV')
    authority, basis = _speciality(f)
    if not authority:
        return _result('chua_xac_dinh', ['Khoản 5 Điều 73 NĐ 217/2026'], [basis], missing, 'confirm')
    if authority != SO_XD:
        return _result(authority, [basis], ['Chuyên ngành không thuộc Sở Xây dựng.'], missing, 'reject_intake')
    return _result(
        SO_XD,
        ['Khoản 5 Điều 32 NĐ 217/2026', basis],
        ['Dự án trên địa bàn tỉnh thuộc chuyên ngành Sở Xây dựng.'],
        missing,
        'accept' if not missing else 'confirm',
    )


def permit(f, appraised=False, subtype=None):
    """Cấp giấy phép xây dựng — Điều 43 Luật 135/2025; Điều 53 NĐ 217/2026.

    Permits already issued (adjust, extend, reissue) stay with the issuing authority (điểm a khoản 4 Điều 53).
    """
    missing = [
        m for m, ok in [('cấp công trình', f['grade']), ('nguồn vốn/hình thức đầu tư', f['investment'])] if not ok
    ]
    existing_permit = subtype in ('amendment', 'extension', 'reissue')
    if not existing_permit:
        if appraised:
            return _result(
                'mien_phep',
                ['Điểm e khoản 2 Điều 43 Luật Xây dựng 135/2025'],
                ['Dự án đã được cơ quan chuyên môn về xây dựng thẩm định BCNCKT.'],
                missing,
                'redirect_start_notice',
            )
        if f['investment'] == 'dau_tu_cong':
            return _result(
                'mien_phep',
                ['Điểm b khoản 2 Điều 43 Luật Xây dựng 135/2025'],
                [
                    'Công trình thuộc dự án đầu tư công do Chủ tịch UBND các cấp quyết định đầu tư '
                    '(cần xác nhận người quyết định đầu tư).'
                ],
                missing,
                'redirect_start_notice',
            )
        listed, item = appendix_iv(f)
        if f['investment'] == 'kinh_doanh' and listed:
            return _result(
                'khong_thuoc_dien',
                ['Điểm c khoản 1 Điều 27, điểm e khoản 2 Điều 43 Luật Xây dựng 135/2025'],
                [
                    'Dự án có công trình thuộc Phụ lục IV phải trình cơ quan chuyên môn thẩm định BCNCKT; '
                    'sau khi thẩm định, công trình được miễn giấy phép (' + item + ').'
                ],
                missing,
                'reject_intake',
            )
    if f['zone']:
        return _result(
            'bql_kcn',
            ['Khoản 2 Điều 53 NĐ 217/2026'],
            ['Công trình trong khu công nghiệp/khu kinh tế.'],
            missing,
            'reject_intake',
        )
    if f['grade'] in ('III', 'IV'):
        return _result(
            'ubnd_xa',
            ['Khoản 1 Điều 53 NĐ 217/2026'],
            ['Công trình cấp III, IV hoặc nhà ở riêng lẻ.'],
            missing,
            'reject_intake',
        )
    if not f['grade']:
        return _result('chua_xac_dinh', ['Điều 53 NĐ 217/2026'], ['Chưa có cấp công trình.'], missing, 'confirm')
    basis = ['Khoản 3 Điều 53 NĐ 217/2026'] + (['Điểm a khoản 4 Điều 53 NĐ 217/2026'] if existing_permit else [])
    reason = (
        'Giấy phép do Sở cấp trước đây: Sở điều chỉnh, gia hạn, cấp lại.'
        if existing_permit
        else 'Công trình cấp II trở lên trên địa bàn tỉnh.'
    )
    return _result(SO_XD, basis, [reason], missing, 'accept' if not missing else 'confirm')


def inspection(f):
    """Kiểm tra công tác nghiệm thu — Điều 25, 26 NĐ 207/2026."""
    missing = [m for m, ok in [('cấp công trình', f['grade']), ('lĩnh vực', f['field'])] if not ok]
    listed, item = appendix_iv(f)
    if f['grade'] == 'DB':
        return _result(
            'bo_chuyen_nganh',
            ['Điểm b khoản 1 Điều 26 NĐ 207/2026'],
            ['Công trình cấp đặc biệt.'],
            missing,
            'reject_intake',
        )
    if listed is False and f['investment'] != 'dau_tu_cong':
        return _result(
            'khong_thuoc_dien',
            ['Khoản 1 Điều 25 NĐ 207/2026'],
            ['Không thuộc công trình ảnh hưởng lớn đến an toàn, lợi ích cộng đồng; chủ đầu tư tự tổ chức nghiệm thu.'],
            missing,
            'reject_intake',
        )
    if listed is None:
        missing.append('xác nhận công trình thuộc Phụ lục IV NĐ 217/2026 (' + item + ')')
    reasons = ['Công trình thuộc diện kiểm tra: ' + item + '.'] if listed else []
    if f['investment'] == 'dau_tu_cong':
        reasons.append('Dự án do UBND tỉnh là cơ quan chủ quản (điểm e khoản 2 Điều 26) nếu được xác nhận.')
    return _result(
        SO_XD,
        ['Điểm c khoản 1 Điều 26 NĐ 207/2026', 'Khoản 1 Điều 25 NĐ 207/2026'],
        reasons,
        missing,
        'accept' if not missing else 'confirm',
    )


def resolve(procedure, project, appraised=False, subtype=None):
    f = facts(project or {})
    result = {'bcnckt': feasibility, 'gpxd': lambda x: permit(x, appraised, subtype), 'nghiem_thu': inspection}[
        procedure
    ](f)
    listed, item = appendix_iv(f)
    result['appendixIv'] = {'listed': listed, 'item': item}
    result['facts'] = {k: f[k] for k in ('field', 'group', 'grade', 'investment', 'commune', 'zone')}
    return result
