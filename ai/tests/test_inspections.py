"""Hậu kiểm: start notices and in-construction inspections (NĐ 207/2026 Điều 12, 25–27; Luật 135 Điều 48)."""

import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app.domain import audit, case_subtype, invalidate, new_case
from app.procedure_review import Review, apply, export_blocks, inspection_limit, specification
from app.sla import Calendar, compute
from app.store import DEMO_ACTOR, Store

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

    def test_subtype_survives_new_uploads_and_ocr(self):
        case = inspection('during')
        apply(case, DEMO_ACTOR, body(case, 'during', visitDate=date(2026, 9, 15)))
        self.assertEqual(case['subtype'], 'during')
        invalidate(case)  # what a new upload or a finished OCR does
        self.assertIsNone(case['procedureReview'])
        self.assertEqual(case_subtype(case), 'during')
        self.assertEqual(specification(case)['subtype'], 'during')
        sla = compute(case, CALENDAR, {'group': 'B', 'grade': 'II'})
        self.assertEqual(sla['periodDays'], 10)
        self.assertEqual(sla['legalDueDate'], CALENDAR.add(date(2026, 9, 15), 10).isoformat())

    def test_subtype_of_payloads_saved_before_the_case_key(self):
        case = inspection('start_notice')
        case['procedureReviewHistory'] = [{'subtype': 'during'}, {'subtype': 'start_notice'}]
        self.assertEqual(case_subtype(case), 'start_notice')
        case['procedureReview'] = {'subtype': 'during'}
        self.assertEqual(case_subtype(case), 'during')
        case['subtype'] = 'complete'
        self.assertEqual(case_subtype(case), 'complete')
        self.assertIsNone(case_subtype(inspection('during')))


class InspectionCountTests(unittest.TestCase):
    def test_counts_inspections_carried_out_once_per_dossier(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch('app.store.DATA_DIR', Path(directory)),
            patch.object(Store, 'project', return_value={'id': 'p1', 'projectGroup': 'B', 'buildingGrade': 'II'}),
        ):
            store = Store(actor=DEMO_ACTOR)

            def saved(state, subtype='during', project='p1', legacy=False, prior=None):
                case = new_case('Kiểm tra', 'Điện Biên', DEMO_ACTOR, '2026-09-01', project, procedure='nghiem_thu')
                if legacy:  # retired review sheet only, as stored before the subtype key existed
                    case['procedureReviewHistory'] = [{'subtype': subtype}]
                else:
                    case['subtype'] = subtype
                if state:
                    case['workflow'] = {'state': state}
                if prior:
                    case.update(previousSubmissionId=prior['id'], previousRevision=prior['revision'])
                audit(case, DEMO_ACTOR, 'Tạo', 'Kiểm thử')
                return store.save(case)

            current = saved('processing')
            saved('processing')  # counted
            saved('reviewed', legacy=True)  # counted through the review history
            first_round = saved('awaiting_supplement')
            saved('site_visit', prior=first_round)  # same dossier as its first round: counted once
            saved(None)  # received, inspection not carried out
            saved('assigned')
            saved('rejected')
            saved('stopped')
            saved('processing', subtype='complete')
            saved('processing', project='p2')
            self.assertEqual(store.inspection_count('p1', current['id'], current['dossierId']), 3)
            self.assertEqual(store.inspection_count('p1', first_round['id'], first_round['dossierId']), 3)
            self.assertEqual(store.inspection_count(None, current['id']), 0)


if __name__ == '__main__':
    unittest.main()
