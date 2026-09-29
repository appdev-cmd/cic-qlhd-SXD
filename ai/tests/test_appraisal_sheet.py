"""BCNCKT appraisal sheet (Điều 38 NĐ 217/2026, Mẫu số 03) and stamping loop (khoản 8, 9 Điều 36)."""

import unittest
from datetime import date

from fastapi import HTTPException

from app import appraisal_sheet as sheet
from app import stamping
from app.domain import new_case
from app.draft_templates import draft_blocks
from app.sla import Calendar
from app.store import DEMO_ACTOR

HEAD = {**DEMO_ACTOR, 'id': 'head', 'name': 'Trưởng phòng', 'role': 'head_of_department'}
CALENDAR = Calendar([], 'test')


def finding(category, result, decision=None, note='Ghi nhận của chuyên viên.'):
    return {
        'id': category + result + str(decision),
        'code': 'X',
        'category': category,
        'title': 'Nội dung ' + category,
        'result': result,
        'explanation': 'Giải thích máy.',
        'review': {'decision': decision, 'note': note} if decision else None,
    }


def dossier(findings=()):
    case = new_case('Hồ sơ', 'Điện Biên', DEMO_ACTOR, '2026-09-01', 'project')
    case['runs'] = [{'stale': False, 'findings': list(findings)}]
    case['legalContext'].update(confirmedBy='Chuyên viên')
    return case


def body(conclusion, statuses, planning='detailed', requirements=None):
    return sheet.SheetInput(
        revision=1,
        planningBasis=planning,
        conclusion=conclusion,
        sections=[
            sheet.SectionInput(
                id=key,
                status=status,
                assessment='Nhận xét của chuyên viên về nội dung.',
                requirements=(requirements or {}).get(
                    key, ['Hoàn thiện nội dung.'] if status in ('revise', 'fails') else []
                ),
            )
            for key, status in statuses.items()
        ],
    )


ALL_MEET = {key: 'meets' for key in sheet.SECTION_IDS}


class SheetTests(unittest.TestCase):
    def test_suggestions_follow_reviewed_findings(self):
        spec = next(s for s in sheet.SECTIONS if s['id'] == 'planning')
        self.assertIsNone(sheet.suggest(spec, [])['status'])
        pending = sheet.suggest(spec, [finding('Quy hoạch', 'inconsistent')])
        self.assertIsNone(pending['status'])
        self.assertIn('chưa đánh giá', pending['reason'])
        revise = sheet.suggest(spec, [finding('Quy hoạch', 'inconsistent', 'accept', 'Làm rõ mật độ xây dựng.')])
        self.assertEqual(revise['status'], 'revise')
        self.assertIn('Làm rõ mật độ xây dựng.', revise['requirements'][0])
        rejected = sheet.suggest(
            spec, [finding('Quy hoạch', 'inconsistent', 'reject'), finding('Thiết kế', 'consistent')]
        )
        self.assertEqual(rejected['status'], 'meets')
        # Acknowledging a specialist-only item is not a correction request.
        specialist = sheet.suggest(spec, [finding('Quy hoạch', 'requires_specialist', 'accept')])
        self.assertEqual((specialist['status'], specialist['requirements']), ('meets', []))

    def test_conclusion_levels(self):
        self.assertEqual(sheet.suggested_conclusion(['meets', 'not_applicable']), 'eligible')
        self.assertEqual(sheet.suggested_conclusion(['meets', 'revise']), 'eligible_after_revision')
        self.assertEqual(sheet.suggested_conclusion(['revise', 'fails']), 'ineligible')
        self.assertIsNone(sheet.suggested_conclusion(['meets', 'pending']))

    def test_problems_block_incomplete_or_inconsistent_sheets(self):
        applicable = sheet.applicability('dau_tu_cong')
        self.assertTrue(sheet.problems(None, applicable))
        case = dossier()
        sheet.apply(case, HEAD, body('eligible', ALL_MEET), 'dau_tu_cong')
        self.assertEqual(sheet.problems(case['appraisalSheet'], applicable), [])
        sheet.apply(case, HEAD, body('eligible', {**ALL_MEET, 'standards': 'revise'}), 'dau_tu_cong')
        self.assertTrue(any('không khớp' in p for p in sheet.problems(case['appraisalSheet'], applicable)))
        sheet.apply(
            case,
            HEAD,
            body('eligible_after_revision', {**ALL_MEET, 'standards': 'revise'}, requirements={'standards': []}),
            'dau_tu_cong',
        )
        self.assertTrue(any('yêu cầu chỉnh sửa' in p for p in sheet.problems(case['appraisalSheet'], applicable)))
        sheet.apply(case, HEAD, body('eligible', ALL_MEET, planning=''), 'dau_tu_cong')
        self.assertTrue(any('quy hoạch' in p for p in sheet.problems(case['appraisalSheet'], applicable)))

    def test_cost_group_only_for_public_investment_and_ppp(self):
        case = dossier()
        view = sheet.view(case, 'kinh_doanh')
        cost = next(s for s in view['sections'] if s['id'] == 'cost')
        self.assertEqual((cost['applicable'], cost['status']), (False, 'not_applicable'))
        statuses = {k: v for k, v in ALL_MEET.items() if k != 'cost'}
        sheet.apply(case, HEAD, body('eligible', {**statuses, 'cost': 'fails'}), 'kinh_doanh')
        stored = {s['id']: s['status'] for s in case['appraisalSheet']['sections']}
        self.assertEqual(stored['cost'], 'not_applicable')
        self.assertTrue(sheet.view(case, 'kinh_doanh')['complete'])
        self.assertTrue(sheet.applicability('ppp')['cost'])

    def test_locked_after_final_review_and_bcnckt_only(self):
        case = dossier()
        case['finalReview'] = {'decision': 'reviewed'}
        with self.assertRaises(HTTPException):
            sheet.apply(case, HEAD, body('eligible', ALL_MEET), 'dau_tu_cong')
        permit = dossier()
        permit['procedure'] = 'gpxd'
        with self.assertRaises(HTTPException):
            sheet.apply(permit, HEAD, body('eligible', ALL_MEET), 'dau_tu_cong')

    def test_notice_draft_uses_the_confirmed_sheet(self):
        case = dossier()
        case['legalDate'] = '2026-09-01'
        case['legalContext'].update(submissionDate='2026-08-20', scope='construction')
        statuses = {**ALL_MEET, 'standards': 'revise'}
        sheet.apply(
            case,
            HEAD,
            body('eligible_after_revision', statuses, requirements={'standards': ['Bổ sung thuyết minh PCCC.']}),
            'dau_tu_cong',
        )
        title, blocks = draft_blocks(case, 'notice')
        text = '\n'.join(line for b in blocks for line in b.get('text', []))
        self.assertIn('chỉ đủ điều kiện sau khi hoàn thiện', text)
        self.assertIn('Yêu cầu: Bổ sung thuyết minh PCCC.', text)
        self.assertIn('cơ quan quản lý nhà nước về xây dựng tại địa phương', text)


def reviewed(conclusion):
    case = dossier()
    case['appraisalSheet'] = {'conclusion': conclusion, 'sections': []}
    case['finalReview'] = {'decision': 'reviewed'}
    return case


def command(action, **extra):
    return stamping.StampingCommand(revision=1, action=action, date=date.today(), **extra)


DRAWINGS = [{'code': 'KT-01', 'name': 'Mặt bằng tổng thể', 'sheets': 2}]


class StampingTests(unittest.TestCase):
    def test_initial_step_follows_conclusion(self):
        self.assertEqual(stamping.status(dossier()), 'not_started')
        self.assertEqual(stamping.status(reviewed('eligible')), 'to_stamp')
        self.assertEqual(stamping.status(reviewed('eligible_after_revision')), 'awaiting_request')
        unstamped = reviewed('ineligible')
        self.assertEqual(stamping.status(unstamped), 'unstamped')
        self.assertEqual(stamping.view(unstamped)['actions'], [])

    def test_eligible_stamp_then_pdf_copy(self):
        case = reviewed('eligible')
        with self.assertRaises(HTTPException):
            stamping.apply(case, HEAD, command('stamp', noticeReference='12/TB-SXD'), CALENDAR)
        with self.assertRaises(HTTPException):
            stamping.apply(case, DEMO_ACTOR, command('stamp', noticeReference='12/TB-SXD', drawings=DRAWINGS), CALENDAR)
        stamping.apply(case, HEAD, command('stamp', noticeReference='12/TB-SXD', drawings=DRAWINGS), CALENDAR)
        view = stamping.view(case, CALENDAR)
        self.assertEqual(view['status'], 'stamped')
        self.assertEqual(view['pdfDueDate'], CALENDAR.add(date.today(), 5).isoformat())
        stamping.apply(case, HEAD, command('pdf_received'), CALENDAR)
        view = stamping.view(case, CALENDAR)
        self.assertEqual(view['status'], 'archived')
        self.assertEqual(next(a for a in view['archive'] if 'PDF' in a['name'])['state'], 'done')

    def test_revision_loop_request_refuse_request_stamp(self):
        case = reviewed('eligible_after_revision')
        with self.assertRaises(HTTPException):
            stamping.apply(case, HEAD, command('stamp', noticeReference='1', drawings=DRAWINGS), CALENDAR)
        with self.assertRaises(HTTPException):
            stamping.apply(case, HEAD, command('request'), CALENDAR)
        stamping.apply(case, HEAD, command('request', reference='05/CV-BQLDA'), CALENDAR)
        with self.assertRaises(HTTPException):
            stamping.apply(case, HEAD, command('refuse'), CALENDAR)
        stamping.apply(case, HEAD, command('refuse', note='Chưa hoàn thiện thuyết minh PCCC.'), CALENDAR)
        self.assertEqual(stamping.status(case), 'awaiting_request')
        stamping.apply(case, HEAD, command('request', reference='07/CV-BQLDA'), CALENDAR)
        stamping.apply(case, HEAD, command('stamp', noticeReference='12/TB-SXD', drawings=DRAWINGS), CALENDAR)
        self.assertEqual([h['action'] for h in case['stamping']['history']], ['request', 'refuse', 'request', 'stamp'])

    def test_stamp_record_export(self):
        case = reviewed('eligible')
        case['legalContext'].update(submissionDate='2026-08-20', scope='construction')
        stamping.apply(case, HEAD, command('stamp', noticeReference='12/TB-SXD', drawings=DRAWINGS), CALENDAR)
        title, blocks = draft_blocks(case, 'stamp')
        self.assertIn('MẪU SỐ 14', title)
        table = next(b for b in blocks if 'rows' in b)
        self.assertEqual(table['rows'][1][2], 'Mặt bằng tổng thể')


if __name__ == '__main__':
    unittest.main()
