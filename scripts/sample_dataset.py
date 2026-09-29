"""Sample dataset v3 — law-consistent demo submissions for the three procedures of the Sở Xây dựng.

    python scripts/sample_dataset.py [--data-dir .appraisal-data] [--fresh]

Every submission is driven through the real workflow, rules and professional review code with a
back-dated clock, so histories, counters, SLA facts and documents match what the application itself
produces. Scenarios follow Luật Xây dựng 135/2025, NĐ 217/2026 and NĐ 207/2026:

* BCNCKT: one supplement request (Mẫu 15) during the intake check, at most one suspension (Mẫu 16),
  one extension, stop after the 20-working-day window, rejection when the Sở lacks authority.
* GPXD: only works the Sở must license (not exempt, not Phụ lục IV business projects), plus rejected
  intakes for exempt public-investment works; one supplement notice then refusal.
* Kiểm tra nghiệm thu: Phụ lục IV works inspected by the Sở (complete, conditional, partial).

``--fresh`` backs up the existing demo database outside the repository before rebuilding it.
Cloud staging is updated from this database by ``scripts/publish_sample_dataset.py``.
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
from contextlib import ExitStack, contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ai/.deps'), str(ROOT / 'ai')]
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(ROOT)
os.environ['APPRAISAL_MODE'] = 'demo'
os.environ.setdefault('APPRAISAL_INTERNAL_TOKEN', 'sample-dataset')

SEED = 'sample-v3'
LABELS = {'bcnckt': 'Thẩm định BCNCKT', 'gpxd': 'Cấp giấy phép xây dựng', 'nghiem_thu': 'Kiểm tra công tác nghiệm thu'}
PERMIT_NAMES = {
    'new': 'Cấp GPXD mới',
    'amendment': 'Điều chỉnh GPXD',
    'extension': 'Gia hạn GPXD',
    'repair': 'GPXD sửa chữa, cải tạo',
}
INSPECTION_NAMES = {'complete': 'Hoàn thành', 'conditional': 'Có điều kiện', 'partial': 'Một phần'}


def sid(key):
    return str(uuid5(NAMESPACE_URL, 'buildappraisal/' + SEED + '/' + key))


def money(value):
    return f'{value:,}'.replace(',', '.')


# ─── Scenarios ────────────────────────────────────────────────────────────────────────────────────
# Each round: received date and steps (working-day offset from the round's receipt, action, note).
# Pseudo actions: analyze, legal (confirm legal context, facts and findings), review:<conclusion> (GPXD, nghiệm thu),
# sheet:<conclusion> (phiếu thẩm định Điều 38), stamp:<action> (đóng dấu, lưu trữ — khoản 8, 9 Điều 36).
M15 = 'Hồ sơ thiếu thành phần theo khoản 2 Điều 35 NĐ 217/2026; gửi một lần Phiếu Mẫu 15.'
M16 = 'Số liệu tổng mức đầu tư và bản vẽ thiết kế cơ sở chưa thống nhất; tạm dừng thẩm định (Mẫu 16).'
VALID = 'Hồ sơ đủ thành phần, đúng quy cách; xác nhận hợp lệ và bắt đầu thẩm định.'
SUBMIT = 'Đã đánh giá 4 nhóm nội dung thẩm định; trình lãnh đạo rà soát dự thảo thông báo kết quả.'
APPROVE = 'Thống nhất kết quả rà soát nội bộ; chuyển bộ phận văn thư dự thảo thông báo kết quả.'
RESUME = 'Đã nhận văn bản giải trình, hồ sơ bổ sung đáp ứng; thời hạn thẩm định tính lại từ đầu.'
SHEET_TEXT = {
    'legal': 'Hồ sơ đủ thành phần theo khoản 2 Điều 35 NĐ 217/2026; chủ nhiệm, chủ trì có chứng chỉ hành nghề phù hợp.',
    'planning': 'Thiết kế phù hợp chức năng sử dụng đất, chỉ tiêu mật độ, hệ số sử dụng đất và tầng cao của quy hoạch được duyệt.',
    'infrastructure': 'Có văn bản thỏa thuận đấu nối cấp điện, cấp nước, thoát nước và giao thông với hạ tầng khu vực.',
    'standards': 'Danh mục QCVN, TCVN phù hợp; giải pháp thiết kế đáp ứng quy chuẩn bắt buộc, có hồ sơ thiết kế PCCC.',
    'cost': 'Tổng mức đầu tư xác định theo NĐ 206/2026/NĐ-CP; cơ cấu và các khoản mục chi phí phù hợp.',
}
DRAWINGS = [
    {'code': 'KT-01', 'name': 'Tổng mặt bằng và định vị công trình', 'sheets': 2},
    {'code': 'KT-02', 'name': 'Mặt bằng, mặt đứng, mặt cắt các hạng mục chính', 'sheets': 14},
    {'code': 'KC-01', 'name': 'Giải pháp kết cấu móng và khung chịu lực', 'sheets': 8},
    {'code': 'PC-01', 'name': 'Giải pháp phòng cháy chữa cháy, thoát nạn', 'sheets': 6},
    {'code': 'HT-01', 'name': 'Đấu nối hạ tầng kỹ thuật ngoài nhà', 'sheets': 3},
]

BCNCKT = {
    'DA-2026-DB-0182': [
        ('2026-07-06', [(3, 'request_supplement', M15)]),
        (
            '2026-07-20',
            [
                (1, 'start', VALID),
                (1, 'analyze'),
                (8, 'legal'),
                (10, 'sheet:eligible'),
                (12, 'submit_review', SUBMIT),
                (14, 'approve', APPROVE),
                (16, 'stamp:stamp'),
                (19, 'stamp:pdf_received'),
            ],
        ),
    ],
    'DA-2026-DB-0189': [
        ('2026-07-13', [(2, 'request_supplement', M15)]),
        (
            '2026-07-27',
            [
                (1, 'start', VALID),
                (1, 'analyze'),
                (8, 'suspend', M16),
                (14, 'resume', RESUME),
                (15, 'analyze'),
                (22, 'legal'),
                (23, 'sheet:eligible_after_revision'),
                (25, 'submit_review', SUBMIT),
                (27, 'approve', APPROVE),
                (31, 'stamp:request', '112/BQLDA-KT ngày đề nghị đóng dấu hồ sơ thiết kế đã hoàn thiện'),
                (33, 'stamp:refuse'),
                (37, 'stamp:request', '128/BQLDA-KT ngày đề nghị đóng dấu (lần 2) kèm hồ sơ PCCC hoàn thiện'),
                (39, 'stamp:stamp'),
            ],
        ),
    ],
    'DA-2026-DB-0205': [
        ('2026-08-03', [(4, 'request_supplement', M15)]),
        (
            '2026-08-17',
            [
                (1, 'start', VALID),
                (1, 'analyze'),
                (9, 'legal'),
                (9, 'sheet:eligible'),
                (10, 'submit_review', SUBMIT),
                (11, 'return', 'Đề nghị làm rõ thêm nhận xét về khả năng kết nối hạ tầng giao thông khu vực.'),
                (13, 'submit_review', 'Đã bổ sung đánh giá kết nối hạ tầng theo ý kiến lãnh đạo; trình lại.'),
                (14, 'approve', APPROVE),
                (25, 'stamp:stamp'),
            ],
        ),
    ],
    'DA-2026-DB-0201': [
        ('2026-07-01', [(3, 'request_supplement', M15)]),
        (
            '2026-07-16',
            [
                (1, 'start', VALID),
                (1, 'analyze'),
                (9, 'legal'),
                (9, 'sheet:ineligible'),
                (10, 'submit_review', SUBMIT),
                (12, 'approve', APPROVE),
            ],
        ),
    ],
    'DA-2026-DB-0183': [
        ('2026-08-24', [(3, 'request_supplement', M15)]),
        ('2026-09-08', [(1, 'start', VALID), (1, 'analyze')]),
    ],
    'DA-2026-DB-0196': [('2026-09-01', [(2, 'start', VALID), (2, 'analyze')])],
    'DA-2026-DB-0206': [
        ('2026-08-26', [(4, 'request_supplement', M15)]),
        ('2026-09-09', [(1, 'start', VALID), (1, 'analyze')]),
    ],
    'DA-2026-DB-0194': [('2026-09-09', [(3, 'start', VALID), (3, 'analyze')])],
    'DA-2026-DB-0187': [
        ('2026-08-10', [(3, 'request_supplement', M15)]),
        ('2026-08-24', [(1, 'start', VALID), (1, 'analyze'), (6, 'suspend', M16)]),
    ],
    'DA-2026-DB-0191': [
        ('2026-07-01', [(2, 'request_supplement', M15)]),
        (
            '2026-07-15',
            [
                (1, 'start', VALID),
                (1, 'analyze'),
                (5, 'suspend', M16),
                (
                    27,
                    'stop',
                    'Quá 20 ngày làm việc kể từ Phiếu tạm dừng, cơ quan chuẩn bị dự án không bổ sung; dừng thẩm định, trả hồ sơ (khoản 5 Điều 36 NĐ 217/2026).',
                ),
            ],
        ),
    ],
    'DA-2026-DB-0185': [
        ('2026-08-17', [(2, 'request_supplement', M15)]),
        (
            '2026-08-31',
            [
                (1, 'start', VALID),
                (1, 'analyze'),
                (
                    9,
                    'extend',
                    'Dự án có nội dung phòng cháy chữa cháy phức tạp; gia hạn một lần (khoản 2 Điều 37 NĐ 217/2026).',
                ),
            ],
        ),
    ],
    'DA-2026-DB-0188': [
        (
            '2026-08-31',
            [
                (2, 'start', VALID),
                (2, 'analyze'),
                (9, 'legal'),
                (11, 'sheet:eligible_after_revision'),
                (12, 'submit_review', SUBMIT),
            ],
        )
    ],
    'DA-2026-DB-0198': [('2026-09-21', [(3, 'request_supplement', M15)])],
    'DA-2026-DB-0202': [('2026-09-15', [(4, 'request_supplement', M15)])],
    'DA-2026-DB-0193': [('2026-09-24', [])],
    'DA-2026-DB-0207': [('2026-09-18', [])],
    'DA-2026-DB-0199': [
        (
            '2026-09-08',
            [
                (
                    2,
                    'reject_intake',
                    'Dự án do UBND cấp xã quyết định đầu tư; thuộc thẩm quyền thẩm định của cơ quan chuyên môn cấp xã (khoản 4 Điều 32 NĐ 217/2026). Từ chối tiếp nhận, hướng dẫn nộp đúng cơ quan.',
                )
            ],
        )
    ],
}
# Earlier appraisals of projects now at the permit or inspection stage (NĐ 175/2024 era, reviewed).
HISTORY = {
    'DA-2026-DB-0186': '2026-01-12',
    'DA-2026-DB-0192': '2026-02-09',
    'DA-2026-DB-0197': '2026-03-09',
    'DA-2026-DB-0203': '2026-04-06',
    'DA-2026-DB-0190': '2026-05-11',
    'DA-2026-DB-0195': '2026-06-08',
}
PERMITS = {
    'DA-2026-DB-0208': (
        'new',
        [
            (
                '2026-09-17',
                [
                    (1, 'start', 'Hồ sơ trực tuyến đầy đủ; thẩm định hồ sơ, lấy ý kiến cơ quan quản lý tôn giáo.'),
                    (2, 'review:pending'),
                ],
            )
        ],
    ),
    'DA-2026-DB-0209': ('new', [('2026-09-25', [])]),
    'DA-2026-DB-0184': (
        'amendment',
        [
            (
                '2026-08-10',
                [
                    (1, 'start', 'Tiếp nhận hồ sơ điều chỉnh GPXD số 12/GPXD-SXD cấp năm 2025.'),
                    (
                        3,
                        'request_supplement',
                        'Thông báo bổ sung một lần: thiếu bản vẽ điều chỉnh mặt đứng và văn bản thẩm định PCCC phần điều chỉnh.',
                    ),
                    (5, 'resume', 'Đã nhận hồ sơ bổ sung trong thời hạn 02 ngày làm việc.'),
                    (6, 'review:eligible'),
                    (6, 'submit_review', 'Trình lãnh đạo ký giấy phép điều chỉnh.'),
                    (7, 'approve', 'Đồng ý điều chỉnh giấy phép; ghi nội dung điều chỉnh vào giấy phép gốc.'),
                ],
            )
        ],
    ),
    'DA-2026-DB-0204': (
        'extension',
        [
            (
                '2026-09-14',
                [
                    (1, 'start', 'Tiếp nhận hồ sơ gia hạn GPXD số 27/GPXD-SXD cấp năm 2025 (chưa khởi công).'),
                    (2, 'review:eligible'),
                    (2, 'submit_review', 'Trình gia hạn giấy phép lần 1.'),
                    (3, 'approve', 'Đồng ý gia hạn 12 tháng.'),
                ],
            )
        ],
    ),
    'DA-2026-DB-0200': (
        'new',
        [
            (
                '2026-08-24',
                [
                    (
                        2,
                        'reject_intake',
                        'Dự án đầu tư kinh doanh có công trình công nghiệp nhẹ cấp II thuộc Phụ lục IV NĐ 217/2026: trình cơ quan chuyên môn thẩm định BCNCKT; sau thẩm định công trình được miễn giấy phép (điểm e khoản 2 Điều 43 Luật Xây dựng 135/2025).',
                    )
                ],
            )
        ],
    ),
    'DA-2026-DB-0190': (
        'new',
        [
            (
                '2026-07-20',
                [
                    (
                        2,
                        'reject_intake',
                        'Công trình thuộc dự án đầu tư công do Chủ tịch UBND tỉnh quyết định đầu tư, thuộc diện miễn giấy phép (điểm b khoản 2 Điều 43 Luật Xây dựng 135/2025); hướng dẫn chủ đầu tư gửi thông báo khởi công.',
                    )
                ],
            )
        ],
    ),
    'DA-2026-DB-0195': (
        'new',
        [
            (
                '2026-08-05',
                [
                    (
                        2,
                        'reject_intake',
                        'Công trình thuộc dự án đầu tư công, đã được thẩm định BCNCKT; miễn giấy phép xây dựng (điểm b, e khoản 2 Điều 43 Luật Xây dựng 135/2025).',
                    )
                ],
            )
        ],
    ),
}
INSPECTIONS = {
    'DA-2026-DB-0186': (
        'complete',
        [
            (
                '2026-08-17',
                [
                    (1, 'start', 'Tiếp nhận báo cáo hoàn thành (Phụ lục VI NĐ 207/2026) và danh mục hồ sơ.'),
                    (3, 'schedule_visit', 'Lập kế hoạch kiểm tra hiện trường và thông báo chủ đầu tư.'),
                    (6, 'review:eligible'),
                    (7, 'submit_review', 'Dự thảo thông báo chấp thuận kết quả nghiệm thu (Phụ lục VIII).'),
                    (9, 'approve', 'Chấp thuận kết quả nghiệm thu hoàn thành của chủ đầu tư.'),
                ],
            )
        ],
    ),
    'DA-2026-DB-0192': (
        'conditional',
        [
            (
                '2026-08-31',
                [
                    (1, 'start', 'Tiếp nhận báo cáo hoàn thành có đề xuất nghiệm thu có điều kiện.'),
                    (3, 'schedule_visit', 'Kiểm tra hiện trường tuyến đường và hệ thống thoát nước.'),
                    (
                        5,
                        'require_correction',
                        'Yêu cầu khắc phục tồn tại về biển báo, sơn kẻ đường; không ảnh hưởng chịu lực.',
                    ),
                ],
            )
        ],
    ),
    'DA-2026-DB-0197': (
        'partial',
        [
            (
                '2026-09-14',
                [
                    (1, 'start', 'Tiếp nhận đề nghị kiểm tra nghiệm thu một phần (đoạn tuyến đã hoàn thành).'),
                    (4, 'schedule_visit', 'Kiểm tra hiện trường phần công trình đề nghị nghiệm thu.'),
                ],
            )
        ],
    ),
    'DA-2026-DB-0203': (
        'complete',
        [
            (
                '2026-09-10',
                [
                    (
                        3,
                        'request_supplement',
                        'Đề nghị bổ sung kết quả thí nghiệm vật liệu và bản vẽ hoàn công hạng mục cây xanh (Phụ lục VII NĐ 207/2026).',
                    )
                ],
            )
        ],
    ),
}


# ─── Clock ─────────────────────────────────────────────────────────────────────────────────────────
@contextmanager
def clock(day, hour=2):
    """Back-date every timestamp and today() used by the application code (09:00 local = 02:00 UTC)."""
    stamp = datetime(day.year, day.month, day.day, hour, tzinfo=timezone.utc).isoformat()

    class Today(date):
        @classmethod
        def today(cls):
            return day

    import app.appraisal_sheet, app.deps, app.domain, app.procedure_review, app.rules, app.stamping, app.workflow  # noqa: E401

    modules = (app.domain, app.deps, app.workflow, app.rules, app.procedure_review, app.appraisal_sheet, app.stamping)
    with ExitStack() as stack:
        for module in modules:
            if hasattr(module, 'now'):
                stack.enter_context(patch.object(module, 'now', lambda: stamp))
        stack.enter_context(patch.object(app.workflow, 'date', Today))
        stack.enter_context(patch.object(app.stamping, 'date', Today))
        yield stamp


# ─── Documents ─────────────────────────────────────────────────────────────────────────────────────
def documents(project, procedure, round_no, subtype, complete):
    total = project.get('totalInvestment') or 0
    common = [
        f"Tên dự án: {project['name']}",
        f"Mã dự án: {project['code']}",
        f"Địa điểm: {project['location']}",
        f"Chủ đầu tư: {project['investorName']}",
        f"Nhóm dự án: {project['projectGroup']}; cấp công trình: {project['buildingGrade']}",
        f'Hình thức đầu tư: {project.get("investmentForm") or "chưa xác định"}',
    ]
    if procedure == 'bcnckt':
        values = [total * p // 100 for p in (5, 65, 10, 2, 5, 3)]
        values.append(total - sum(values))
        from app.domain import COSTS

        costs = [f'{label}: {money(v)} đồng' for (_, label), v in zip(COSTS, values)]
        docs = {
            'TTR': (
                'Tờ trình thẩm định BCNCKT (Mẫu số 01 Phụ lục I NĐ 217/2026)',
                [
                    f'Tổng mức đầu tư: {money(total)} đồng',
                    'Kính đề nghị Sở Xây dựng thẩm định Báo cáo nghiên cứu khả thi dự án nêu trên.',
                    'Danh mục hồ sơ kèm theo theo khoản 2 Điều 35 NĐ 217/2026.',
                ],
            ),
            'KT01': (
                'Báo cáo kết quả khảo sát địa hình đã phê duyệt',
                ['Phạm vi khảo sát, hệ tọa độ VN-2000, mốc khống chế và bình đồ tỷ lệ 1/500.'],
            ),
            'KT02': (
                'Báo cáo kết quả khảo sát địa chất đã phê duyệt',
                ['Vị trí lỗ khoan, trụ địa chất, chỉ tiêu cơ lý và kiến nghị giải pháp móng.'],
            ),
            'KT03': (
                'Thuyết minh Báo cáo nghiên cứu khả thi',
                [
                    f'Tổng mức đầu tư: {money(total)} đồng',
                    'Sự cần thiết, mục tiêu, địa điểm, quy mô, giải pháp thiết kế cơ sở, PCCC, môi trường, tổ chức thực hiện.',
                ],
            ),
            'KT04': (
                'Hồ sơ thiết kế cơ sở',
                ['Tổng mặt bằng, kiến trúc, kết cấu, điện, cấp thoát nước, PCCC; danh mục QCVN, TCVN áp dụng.'],
            ),
            'KT05': ('Tổng mức đầu tư và các bảng tính', [f'Tổng mức đầu tư: {money(total)} đồng', *costs]),
        }
        if complete:
            docs['NL01'] = (
                'Danh sách năng lực tổ chức, cá nhân tham gia lập dự án',
                [
                    'Chủ nhiệm lập dự án, chủ trì thiết kế các bộ môn, chủ nhiệm khảo sát; số chứng chỉ hành nghề tra cứu trên CSDL quốc gia.'
                ],
            )
        return common, docs
    if procedure == 'gpxd':
        label = PERMIT_NAMES.get(subtype, 'GPXD')
        docs = {
            'APPLICATION': (
                f'Đơn đề nghị {label.lower()} (Phụ lục II NĐ 217/2026)',
                [
                    'Đơn theo Mẫu số '
                    + ('02' if subtype in ('amendment', 'extension') else '01')
                    + ' Phụ lục II, ký số của chủ đầu tư.'
                ],
            ),
            'ATTACHMENTS': (
                'Giấy tờ về đất đai, văn bản pháp lý kèm theo',
                ['Giấy chứng nhận quyền sử dụng đất; văn bản chấp thuận của cơ quan quản lý chuyên ngành (nếu có).'],
            ),
            'DRAWINGS': (
                'Bản vẽ thiết kế xây dựng đề nghị cấp phép',
                [
                    'Tổng mặt bằng, mặt bằng định vị, mặt bằng các tầng, mặt đứng, mặt cắt, móng, đấu nối hạ tầng (Điều 57 NĐ 217/2026).'
                ],
            ),
        }
        if complete:
            docs['RESULTS'] = (
                'Báo cáo kết quả thẩm tra thiết kế và văn bản PCCC',
                ['Báo cáo thẩm tra; kết quả thẩm duyệt thiết kế PCCC (nếu thuộc diện).'],
            )
        return common, docs
    docs = {
        'APPLICATION': (
            'Báo cáo hoàn thành thi công xây dựng (Phụ lục VI NĐ 207/2026)',
            [
                'Đề nghị cơ quan chuyên môn kiểm tra công tác nghiệm thu '
                + INSPECTION_NAMES.get(subtype, '').lower()
                + '.'
            ],
        ),
        'ATTACHMENTS': (
            'Danh mục hồ sơ hoàn thành công trình (Phụ lục VII NĐ 207/2026)',
            ['Nhật ký thi công, biên bản nghiệm thu công việc, giai đoạn; kết quả thí nghiệm, quan trắc, kiểm định.'],
        ),
        'DRAWINGS': (
            'Bản vẽ hoàn công',
            ['Bản vẽ hoàn công hạng mục, công trình; bảng tổng hợp thay đổi so với thiết kế.'],
        ),
    }
    if complete:
        docs['RESULTS'] = (
            'Biên bản nghiệm thu hoàn thành của chủ đầu tư (Điều 24 NĐ 207/2026)',
            ['Thành phần ký: chủ đầu tư, giám sát trưởng, chỉ huy trưởng, chủ nhiệm thiết kế.'],
        )
    return common, docs


# ─── Builder ───────────────────────────────────────────────────────────────────────────────────────
class Builder:
    def __init__(self, projects):
        from app.sla import demo_calendar
        from app.store import DEMO_ACTOR, Store

        self.projects = projects
        self.calendar = demo_calendar()
        self.store = Store(actor=DEMO_ACTOR)
        self.leader = {
            **DEMO_ACTOR,
            'id': 'leader-qlxd',
            'name': 'Trưởng phòng Quản lý Xây dựng (mô phỏng)',
            'role': 'head_of_department',
        }
        self.files = 0
        self.cases = 0

    def day(self, start, offset):
        return self.calendar.add(start, offset) if offset > 0 else start

    def officer(self, project):
        from app.store import DEMO_ACTOR

        return {**DEMO_ACTOR, 'name': project.get('assignee') or DEMO_ACTOR['name']}

    def create(
        self, project, procedure, received, round_no, prior=None, subtype=None, complete=True, key=None, title=None
    ):
        from app.domain import audit, new_case
        from app.ingestion import extract_facts, read_document

        officer = self.officer(project)
        key = key or f"{project['code']}/{procedure}/{round_no}"
        label = LABELS[procedure] + (
            ' — ' + PERMIT_NAMES.get(subtype, INSPECTION_NAMES.get(subtype, '')) if subtype else ''
        )
        label += (' — ' + title) if title else ''
        with clock(received) as stamp:
            case = new_case(
                f"{project['code']} · {label} · Lần {round_no:02d}",
                project['location'],
                officer,
                received.isoformat(),
                project['id'],
                sample=True,
                procedure=procedure,
                project_name=project['name'],
                project_code=project['code'],
            )
            case.update(
                id=sid(key),
                createdAt=stamp,
                updatedAt=stamp,
                assignee=officer['name'],
                seedVersion=SEED,
                submissionCode=f"HS-{procedure.upper()}-{project['code']}-{round_no:02d}",
                submissionRound=round_no,
            )
            case['legalContext'].update(submissionDate=received.isoformat())
            if subtype:
                case['procedureReview'] = None
                case['sampleSubtype'] = subtype
            if prior:
                case.update(
                    previousSubmissionId=prior['id'],
                    previousRevision=prior['revision'],
                    previousSubmissionName=prior['name'],
                    dossierId=prior.get('dossierId', prior['id']),
                    submissionReason='Nộp hồ sơ bổ sung theo yêu cầu.',
                )
                case['workflow'] = {
                    'state': 'received',
                    'counters': dict((prior.get('workflow') or {}).get('counters') or {}),
                }
                case['requirements'] = [
                    {**r, 'status': 'missing', 'note': '', 'verifiedBy': None} for r in prior['requirements']
                ]
            audit(case, officer, 'Tiếp nhận hồ sơ', 'Tiếp nhận qua Bộ phận Một cửa / Cổng Dịch vụ công.')
            common, docs = documents(project, procedure, round_no, subtype, complete)
            files = []
            for code, (title, lines) in docs.items():
                requirement = next((r for r in case['requirements'] if r['id'] == code), None)
                if not requirement:
                    continue
                data = (
                    '\n'.join(
                        [
                            title.upper(),
                            *common,
                            f'Lần nộp: {round_no:02d}; ngày nộp: {received.strftime("%d/%m/%Y")}',
                            '',
                            *lines,
                        ]
                    )
                    + '\n'
                ).encode()
                segments, warnings, signature = read_document('sample.txt', data)
                document = {
                    'id': sid(key + '/' + code),
                    'requirementId': code,
                    'name': f"{project['code']}_{procedure}_L{round_no:02d}_{code}.txt",
                    'role': 'submission',
                    'version': 1,
                    'hash': hashlib.sha256(data).hexdigest(),
                    'size': len(data),
                    'uploadedAt': stamp,
                    'segments': segments,
                    'warnings': warnings,
                    'signature': signature,
                }
                case['documents'].append(document)
                case['facts'].extend(extract_facts(document))
                requirement['status'] = 'submitted'
                files.append((document['id'], data))
            saved = self.store.save(case)
        for doc_id, data in files:
            self.store.put_file(case['id'], doc_id, data)
        self.files += len(files)
        self.cases += 1
        return saved

    def persist(self, case, action, detail):
        from app.deps import save

        return save(self.store, case, case['revision'], action, detail)

    def step(self, case, project, day, action, note=None):
        from app.workflow import apply

        officer = self.officer(project)
        leader_actions = ('extend', 'reject_intake', 'stop', 'return', 'approve')
        actor = self.leader if action in leader_actions else officer
        with clock(day):
            if action == 'analyze':
                from app.rules import analyze

                case['runs'].append(analyze(case))
                return self.persist(case, 'Hoàn tất kiểm tra', 'Chạy bộ quy tắc trên tài liệu của lần nộp.')
            if action == 'legal':
                return self.confirm_legal(case, officer)
            if action.startswith('review:'):
                return self.procedure_review(case, project, officer, action.split(':', 1)[1], day)
            if action.startswith('sheet:'):
                return self.appraisal_sheet(case, project, officer, action.split(':', 1)[1])
            if action.startswith('stamp:'):
                return self.stamp(case, project, action.split(':', 1)[1], day, note)
            if action == 'approve' and case.get('procedure') == 'bcnckt':
                from app.deps import validate_final_review

                validate_final_review(case, project.get('investmentForm'))
            visit = day.isoformat() if action == 'schedule_visit' else None
            label = apply(case, actor, action, note, visit)
            return self.persist(case, label, note)

    def confirm_legal(self, case, officer):
        from app.legal import legal_checklist

        case['legalContext'].update(
            scope='construction',
            priorStatus='unknown',
            confirmedBy=officer['name'],
            note='Xác nhận phạm vi thẩm định của cơ quan chuyên môn về xây dựng.',
        )
        for item in legal_checklist(case):
            if item['conditional'] and item['applicability'] == 'unknown':
                case['legalRequirements'][item['id']] = {
                    'applicability': 'not_applicable',
                    'requirementIds': item['requirementIds'],
                    'note': 'Không thuộc trường hợp áp dụng theo hồ sơ dự án (mô phỏng).',
                    'reviewedBy': officer['name'],
                }
            elif not item['conditional'] and item['state'] == 'missing':
                # Core component filed inside the submission letter's attachments (e.g. planning decision).
                case['legalRequirements'][item['id']] = {
                    'applicability': 'applicable',
                    'requirementIds': ['TTR', 'KT03'],
                    'note': 'Văn bản, bản vẽ gửi kèm Tờ trình và thuyết minh BCNCKT (mô phỏng).',
                    'reviewedBy': officer['name'],
                }
        for fact in case['facts']:
            if fact.get('reviewStatus') == 'pending':
                fact.update(
                    reviewStatus='confirmed', reviewedBy=officer['name'], reviewNote='Đã đối chiếu với tài liệu gốc.'
                )
        if case['runs']:
            # Legal context and data changed: the application requires a fresh run before findings are assessed.
            from app.rules import analyze

            for run in case['runs']:
                run['stale'] = True
            case['runs'].append(analyze(case))
            for finding in case['runs'][-1]['findings']:
                finding['review'] = {
                    'decision': 'accept',
                    'note': 'Đồng ý nhận xét; đưa vào dự thảo thông báo.',
                    'actor': officer['name'],
                    'at': case['updatedAt'],
                }
        return self.persist(
            case, 'Xác nhận căn cứ pháp lý và dữ liệu', 'Xác nhận phạm vi, thành phần pháp lý và dữ liệu trích xuất.'
        )

    def appraisal_sheet(self, case, project, officer, conclusion):
        """Phiếu thẩm định theo Điều 38 NĐ 217/2026 with the scenario's conclusion (mục V–VI Mẫu số 03)."""
        from app.appraisal_sheet import CONCLUSIONS, SheetInput, apply as apply_sheet

        text = dict(SHEET_TEXT)
        statuses = {key: 'meets' for key in text}
        requirements = {}
        if conclusion == 'eligible_after_revision':
            statuses['standards'] = 'revise'
            text['standards'] = (
                'Danh mục QCVN, TCVN phù hợp. Thiết kế phòng cháy chữa cháy chưa thể hiện đủ lối thoát nạn và '
                'khoảng cách an toàn giữa các khối công trình theo QCVN 06:2022/BXD.'
            )
            requirements['standards'] = [
                'Bổ sung tính toán số lượng, chiều rộng lối thoát nạn các tầng theo QCVN 06:2022/BXD.',
                'Hoàn thiện thuyết minh hệ thống cấp nước chữa cháy ngoài nhà và bể nước dự trữ.',
            ]
        if conclusion == 'ineligible':
            statuses['planning'] = 'fails'
            text['planning'] = (
                'Một số hạng mục phụ trợ bố trí trong khu vực bảo vệ I của di tích, không phù hợp quy hoạch '
                'bảo quản, tu bổ, phục hồi di tích được cấp có thẩm quyền phê duyệt.'
            )
            requirements['planning'] = [
                'Điều chỉnh vị trí các hạng mục phụ trợ ra ngoài khu vực bảo vệ I theo quy hoạch được duyệt.',
                'Bổ sung ý kiến của cơ quan quản lý di tích về phương án tổng mặt bằng điều chỉnh.',
            ]
        field = (project.get('field') or '').lower()
        body = SheetInput(
            revision=case['revision'],
            planningBasis='sector' if 'giao thông' in field else 'detailed',
            conclusion=conclusion,
            recommendations=(
                'Cơ quan chuẩn bị dự án hoàn thiện hồ sơ theo các yêu cầu nêu trên trước khi trình phê duyệt; '
                'nộp đề nghị đóng dấu kèm hồ sơ thiết kế đã chỉnh sửa (điểm d khoản 8 Điều 36 NĐ 217/2026).'
                if conclusion == 'eligible_after_revision'
                else 'Cơ quan chuẩn bị dự án nghiên cứu điều chỉnh phương án, trình thẩm định lại theo quy định.'
                if conclusion == 'ineligible'
                else 'Cơ quan chuẩn bị dự án tổng hợp, trình người quyết định đầu tư phê duyệt dự án theo quy định.'
            ),
            sections=[
                {
                    'id': key,
                    'status': statuses[key],
                    'assessment': text[key],
                    'requirements': requirements.get(key, []),
                }
                for key in text
            ],
        )
        apply_sheet(case, officer, body, project.get('investmentForm'))
        return self.persist(case, 'Cập nhật phiếu thẩm định (Điều 38)', 'Kết luận: ' + CONCLUSIONS[conclusion])

    def stamp(self, case, project, action, day, note=None):
        """Đóng dấu, trả kết quả, lưu trữ — khoản 8, 9 Điều 36 NĐ 217/2026."""
        from app.stamping import StampingCommand, apply as apply_stamping

        actor = self.leader if action == 'stamp' else self.officer(project)
        number = int(project['code'][-4:])
        body = {'revision': case['revision'], 'action': action, 'date': day}
        if action == 'request':
            body.update(reference=note or 'Văn bản đề nghị đóng dấu', note='Kèm hồ sơ thiết kế đã chỉnh sửa.')
        if action == 'refuse':
            body['note'] = (
                'Hồ sơ chỉnh sửa chưa bổ sung tính toán lối thoát nạn theo yêu cầu tại thông báo kết quả thẩm định; '
                'đề nghị hoàn thiện và nộp lại.'
            )
        if action == 'stamp':
            body.update(
                noticeReference=f"{number}/TB-SXD ngày {day.strftime('%d/%m/%Y')} (mô phỏng)",
                drawings=DRAWINGS,
                note='Đóng dấu 01 bộ hồ sơ bản vẽ thiết kế xây dựng; giao lại cơ quan chuẩn bị dự án.',
            )
        if action == 'pdf_received':
            body['note'] = 'Nhận bản chụp định dạng PDF các bản vẽ đã đóng dấu thẩm định.'
        label = apply_stamping(case, actor, StampingCommand(**body), self.calendar, demo=True)
        return self.persist(case, label, body.get('reference') or body.get('note') or label)

    def procedure_review(self, case, project, officer, conclusion, day):
        from app.procedure_review import Review, apply as apply_review, specification

        subtype = case.get('sampleSubtype')
        spec = specification(case, subtype)
        doc_ids = [d['id'] for d in case['documents'] if d['role'] == 'submission']
        final = conclusion != 'pending'
        checks = [
            {
                'id': c['id'],
                'status': 'satisfied' if final else 'pending',
                'documentIds': doc_ids if final else [],
                'note': 'Đã đối chiếu tài liệu trong hồ sơ; đáp ứng yêu cầu.' if final else '',
            }
            for c in spec['checks']
        ]
        body = {
            'revision': case['revision'],
            'subtype': subtype,
            'checks': checks,
            'defects': [],
            'authority': 'Sở Xây dựng tỉnh Điện Biên',
            'investor': project['investorName'],
            'location': project['location'],
            'scope': project['name'],
            'parameters': f"Cấp công trình {project['buildingGrade']}; nhóm {project['projectGroup']}.",
            'designBasis': 'Thiết kế trong hồ sơ đề nghị (mô phỏng).',
            'conclusion': conclusion,
            'conditions': 'Tuân thủ nội dung giấy phép/thông báo; kết quả mô phỏng, chưa ký ban hành.',
            'details': {
                'authorityBasis': 'Khoản 3 Điều 53 NĐ 217/2026'
                if case['procedure'] == 'gpxd'
                else 'Điểm c khoản 1 Điều 26 NĐ 207/2026',
                'buildingClass': f"Cấp {project['buildingGrade']}",
            },
        }
        if subtype in ('amendment', 'extension'):
            body.update(originalForm='03', priorPermit='GPXD do Sở Xây dựng cấp năm 2025 (mô phỏng)')
        if subtype == 'extension':
            body['extensionCount'] = 1
        if subtype == 'conditional':
            body['defects'] = [
                {
                    'description': 'Biển báo, sơn kẻ đường chưa hoàn thiện đoạn Km3–Km5.',
                    'responsible': 'Nhà thầu thi công',
                    'dueDate': (day + timedelta(days=30)).isoformat(),
                    'status': 'open',
                    'documentIds': doc_ids[:1],
                    'resolution': 'Cam kết hoàn thiện trong 30 ngày; không ảnh hưởng khả năng chịu lực.',
                    'nonSafetyConfirmed': True,
                }
            ]
        if subtype == 'partial':
            body['details']['remainingSafety'] = (
                'Phân luồng, rào chắn bảo đảm an toàn khi tiếp tục thi công phần còn lại.'
            )
        if case['procedure'] == 'nghiem_thu':
            body.update(
                visitDate=day.isoformat(),
                participants='Sở Xây dựng, chủ đầu tư, tư vấn giám sát, nhà thầu thi công',
                observations='Hiện trạng phù hợp hồ sơ hoàn công; ghi nhận tồn tại (nếu có) trong phiếu.',
            )
        apply_review(case, officer, Review(**body))
        return self.persist(case, 'Lập phiếu rà soát chuyên môn', 'Kết luận: ' + conclusion)

    def run(self, project, procedure, rounds, subtype=None, key_prefix=None, title=None):
        prior = None
        for number, (received, steps) in enumerate(rounds, start=1):
            received = date.fromisoformat(received)
            complete = number > 1 or not any(a == 'request_supplement' for _, a, *_ in steps)
            if prior:
                prior = self.store.get(prior['id'])
            case = self.create(
                project,
                procedure,
                received,
                number,
                prior,
                subtype,
                complete,
                key=(key_prefix or f"{project['code']}/{procedure}") + f'/{number}',
                title=title,
            )
            for offset, action, *note in steps:
                case = self.step(case, project, self.day(received, offset), action, note[0] if note else None)
            prior = case
        return prior


def backup_demo(data_dir):
    database = data_dir / 'appraisal.sqlite'
    if not database.exists():
        return None
    target = (
        Path.home()
        / '.config/buildappraisal/backups'
        / (datetime.now().strftime('%Y%m%d-%H%M%S') + '-demo-before-' + SEED)
    )
    target.mkdir(parents=True)
    for name in ('appraisal.sqlite', 'appraisal.sqlite-wal', 'appraisal.sqlite-shm'):
        if (data_dir / name).exists():
            shutil.move(str(data_dir / name), target / name)
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', default=os.getenv('APPRAISAL_DATA_DIR', '.appraisal-data'))
    parser.add_argument('--fresh', action='store_true')
    args = parser.parse_args()
    data_dir = Path(args.data_dir).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ['APPRAISAL_DATA_DIR'] = str(data_dir)
    projects = {p['code']: p for p in json.loads((data_dir / 'projects.json').read_text(encoding='utf-8'))}
    backup = backup_demo(data_dir) if args.fresh else None
    builder = Builder(projects)
    for code, first in HISTORY.items():
        builder.run(
            projects[code],
            'bcnckt',
            [
                (
                    first,
                    [
                        (1, 'start', VALID),
                        (1, 'analyze'),
                        (6, 'legal'),
                        (8, 'submit_review', SUBMIT),
                        (10, 'approve', APPROVE),
                    ],
                )
            ],
            key_prefix=f'{code}/bcnckt-history',
        )
    for code, rounds in BCNCKT.items():
        builder.run(projects[code], 'bcnckt', rounds)
    for code, (subtype, rounds) in PERMITS.items():
        builder.run(projects[code], 'gpxd', rounds, subtype)
    # Second permit dossier of the religious project: supplement notice once, not met → refusal.
    builder.run(
        projects['DA-2026-DB-0208'],
        'gpxd',
        [
            (
                '2026-08-03',
                [
                    (1, 'start', 'Tiếp nhận hồ sơ cấp GPXD nhà sinh hoạt cộng đồng.'),
                    (
                        3,
                        'request_supplement',
                        'Thông báo bổ sung một lần: thiếu văn bản chấp thuận sự cần thiết xây dựng của cơ quan quản lý tín ngưỡng, tôn giáo cấp tỉnh (khoản 2 Điều 57 NĐ 217/2026).',
                    ),
                    (
                        6,
                        'stop',
                        'Hết thời hạn 02 ngày làm việc, hồ sơ bổ sung không đáp ứng; thông báo không cấp giấy phép và nêu rõ lý do (điểm b khoản 2 Điều 54 NĐ 217/2026).',
                    ),
                ],
            )
        ],
        'new',
        key_prefix='DA-2026-DB-0208/gpxd-community',
        title='Nhà sinh hoạt cộng đồng',
    )
    for code, (subtype, rounds) in INSPECTIONS.items():
        builder.run(projects[code], 'nghiem_thu', rounds, subtype)
    summary = {
        'seed': SEED,
        'cases': builder.cases,
        'files': builder.files,
        'dataDir': str(data_dir),
        'backup': str(backup) if backup else None,
    }
    (ROOT / 'output/appraisal').mkdir(parents=True, exist_ok=True)
    (ROOT / 'output/appraisal/sample-dataset-v3.json').write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
