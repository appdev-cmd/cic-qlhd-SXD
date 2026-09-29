"""Procedural limits and step deadlines of the three procedures (versioned, cited).

NĐ 217/2026 (Điều 36 thẩm định BCNCKT, Điều 54 cấp GPXD) and NĐ 207/2026 (Điều 27 kiểm tra nghiệm thu).
Values are working days unless stated. Hồ sơ trình trước 01/7/2026 đủ điều kiện thẩm định vẫn theo NĐ 175/2024
(khoản 2 Điều 76 NĐ 217/2026); the transition flag is handled by legal.py.
"""

VERSION = 'nd217-nd207-2026.07'

POLICY = {
    'bcnckt': {
        # Kiểm tra hồ sơ, gửi một lần yêu cầu bổ sung (Mẫu 15) trong 05 ngày làm việc — khoản 3 Điều 36.
        'intakeDays': 5,
        'intakeBasis': 'Khoản 3 Điều 36 NĐ 217/2026/NĐ-CP',
        'supplement': {
            'max': 1,
            'form': 'Mẫu số 15 Phụ lục I NĐ 217/2026',
            'waitDays': 20,
            'phase': 'intake',
            'basis': 'Điểm a khoản 3, khoản 5 Điều 36 NĐ 217/2026/NĐ-CP',
        },
        # Tạm dừng thẩm định không quá 01 lần (Mẫu 16) — khoản 4 Điều 36; quá 20 ngày làm việc thì dừng.
        'suspend': {
            'max': 1,
            'form': 'Mẫu số 16 Phụ lục I NĐ 217/2026',
            'waitDays': 20,
            'basis': 'Khoản 4, khoản 5 Điều 36 NĐ 217/2026/NĐ-CP',
        },
        # Gia hạn 01 lần, không quá thời hạn thẩm định tương ứng — khoản 2 Điều 37.
        'extend': {'max': 1, 'basis': 'Khoản 2 Điều 37 NĐ 217/2026/NĐ-CP'},
        'restartBasis': 'Khoản 5 Điều 36 NĐ 217/2026/NĐ-CP (thời hạn thẩm định được tính lại từ đầu)',
        'resultForm': 'Mẫu số 03 Phụ lục I NĐ 217/2026',
        'stampForm': 'Mẫu số 14 Phụ lục I NĐ 217/2026',
    },
    'gpxd': {
        # Thẩm định hồ sơ, kiểm tra thực địa: 05 ngày làm việc (03 với nhà ở riêng lẻ) — điểm a khoản 2 Điều 54.
        'intakeDays': 5,
        'intakeDaysHouse': 3,
        'intakeBasis': 'Điểm a khoản 2 Điều 54 NĐ 217/2026/NĐ-CP',
        # Thông báo một lần; người đề nghị bổ sung trong 02 ngày làm việc (01 với gia hạn/cấp lại);
        # không đáp ứng → 01 ngày làm việc thông báo lý do không cấp — điểm b khoản 2, 3 Điều 54.
        'supplement': {
            'max': 1,
            'form': 'Thông báo bổ sung một lần (thư điện tử/tin nhắn)',
            'waitDays': 2,
            'waitDaysRenewal': 1,
            'refuseDays': 1,
            'phase': 'review',
            'basis': 'Điểm b khoản 2, điểm b khoản 3 Điều 54 NĐ 217/2026/NĐ-CP',
        },
        'suspend': None,
        'extend': None,
        # Cơ quan được hỏi ý kiến trả lời trong 02 ngày làm việc, quá hạn coi như đồng ý — điểm c khoản 2 Điều 54.
        'consultDays': 2,
        'consultBasis': 'Điểm c khoản 2 Điều 54 NĐ 217/2026/NĐ-CP',
        'resultForm': 'Mẫu số 03/04/05 Phụ lục II NĐ 217/2026',
    },
    'nghiem_thu': {
        'intakeDays': None,
        'supplement': {
            'max': None,
            'form': 'Văn bản yêu cầu bổ sung, giải trình',
            'waitDays': None,
            'phase': 'review',
            'basis': 'Điểm a khoản 4 Điều 25 NĐ 207/2026/NĐ-CP',
        },
        'suspend': None,
        'extend': None,
        # Thông báo kết quả kiểm tra trong quá trình thi công: ≤10 ngày làm việc kể từ ngày kiểm tra — điểm b khoản 3 Điều 27.
        'duringResultDays': 10,
        # Số lần kiểm tra trong thi công: ≤03 lần cấp đặc biệt/cấp I, ≤02 lần công trình khác — điểm a khoản 3 Điều 27.
        'duringChecks': {'high': 3, 'other': 2},
        'duringBasis': 'Khoản 3 Điều 27 NĐ 207/2026/NĐ-CP',
        'resultForm': 'Phụ lục VIII NĐ 207/2026',
    },
}


def policy(procedure):
    return POLICY.get(procedure or 'bcnckt', POLICY['bcnckt'])


def intake_days(procedure, subtype=None):
    p = policy(procedure)
    if procedure == 'gpxd' and subtype == 'house':
        return p['intakeDaysHouse']
    return p.get('intakeDays')


def wait_days(procedure, kind, subtype=None):
    """Days the applicant has to supplement after a supplement request (kind='supplement') or suspension."""
    rule = policy(procedure).get(kind) or {}
    if procedure == 'gpxd' and subtype in ('extension', 'reissue'):
        return rule.get('waitDaysRenewal')
    return rule.get('waitDays')
