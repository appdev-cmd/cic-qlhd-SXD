"""Hậu kiểm: start notices and in-construction inspections (NĐ 207/2026 Điều 12, 25–27; Luật 135 Điều 48)."""

import unittest
from datetime import date

from fastapi import HTTPException

from app.domain import new_case
from app.procedure_review import Review, apply, export_blocks, inspection_limit, specification
from app.sla import Calendar, compute
from app.store import DEMO_ACTOR

CALENDAR = Calendar([], 'test')


def inspection(subtype):
    case = new_case('Hậu kiểm', 'Điện Biên', DEMO_ACTOR, '2026-09-01', 'p1', procedure='nghiem_thu')
    case['documents'] = [{'id': 'd1', 'role': 'submission', 'name': 'Thông báo khởi công.pdf', 'hash': 'h'}]
    return case


def body(case, subtype, conclusion='eligible', **extra):
    spec = specification(case, subtype)
    checks = [
        {'id': c['id'], 'status': 'satisfied', 'documentIds': ['d1'], 'note': 'Đã đối chiếu tài liệu, đáp ứng.'}
        for c in spec['checks']
    ]
    return Review(
        revision=1,
        subtype=subtype,
        checks=checks,
        authority='Sở Xây dựng tỉnh Điện Biên',
        investor='Ban QLDA tỉnh',
        location='Điện Biên Phủ',
        scope='Toàn bộ công trình',
        conclusion=conclusion,
        details={'authorityBasis': 'Điểm c khoản 1 Điều 26 NĐ 207/2026', **extra.pop('details', {})},
        **extra,
    )


class InspectionTests(unittest.TestCase):
    def test_subtypes_checklists_and_fields(self):
        case = inspection('start_notice')
        spec = specification(case, 'start_notice')
        self.assertIn('start_notice', {t['value'] for t in spec['types']})
        self.assertIn('exempt', {c['id'] for c in spec['checks']})
        self.assertIn('startDate', {f['id'] for f in spec['detailFields']})
        during = specification(case, 'during')
        self.assertIn('result_notice', {c['id'] for c in during['checks']})
        self.assertIn('extraReason', {f['id'] for f in during['detailFields']})
        self.assertNotIn('startDate', {f['id'] for f in specification(case, 'complete')['detailFields']})

    def test_start_notice_needs_start_date_and_exports(self):
        case = inspection('start_notice')
        with self.assertRaises(HTTPException):
            apply(case, DEMO_ACTOR, body(case, 'start_notice'))
        apply(
            case,
            DEMO_ACTOR,
            body(case, 'start_notice', details={'startDate': '2026-09-10', 'permitNumber': '002/2026/GPXD'}),
        )
        title, blocks = export_blocks(case, 'draft')
        self.assertIn('THÔNG BÁO KHỞI CÔNG', title)
        text = '\n'.join(line for b in blocks for line in b.get('text', []))
        self.assertIn('002/2026/GPXD', text)
        sla = compute(case, CALENDAR, {'group': 'B', 'grade': 'II'})
        self.assertEqual(sla['periodDays'], 5)

    def test_inspection_limit_by_grade(self):
        self.assertEqual(inspection_limit('I', 2), {**inspection_limit('I', 2), 'max': 3, 'exceeded': False})
        self.assertTrue(inspection_limit('II', 2)['exceeded'])
        case = inspection('during')
        limit = inspection_limit('II', 2)
        with self.assertRaises(HTTPException):
            apply(case, DEMO_ACTOR, body(case, 'during', visitDate=date(2026, 9, 15)), limit)
        apply(
            case,
            DEMO_ACTOR,
            body(
                case,
                'during',
                visitDate=date(2026, 9, 15),
                details={'extraReason': 'Sự cố nứt dầm sàn tầng 3; kiểm tra bổ sung theo điểm a khoản 3 Điều 27.'},
            ),
            limit,
        )

    def test_during_result_due_ten_working_days_after_the_inspection(self):
        case = inspection('during')
        apply(case, DEMO_ACTOR, body(case, 'during', visitDate=date(2026, 9, 15)))
        case['workflow'] = {'state': 'processing', 'validAt': '2026-09-02'}
        sla = compute(case, CALENDAR, {'group': 'B', 'grade': 'II'})
        self.assertEqual(sla['legalDueDate'], CALENDAR.add(date(2026, 9, 15), 10).isoformat())
        with self.assertRaises(HTTPException):
            apply(case, DEMO_ACTOR, body(case, 'during'))
        title, _ = export_blocks(case, 'draft')
        self.assertIn('TRONG QUÁ TRÌNH THI CÔNG', title)


if __name__ == '__main__':
    unittest.main()
