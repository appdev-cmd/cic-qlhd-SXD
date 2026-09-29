"""Procedural limits (NĐ 217/2026 Điều 36, 37, 54) and competent authority (Điều 32, 53; NĐ 207/2026 Điều 26)."""

import unittest
from datetime import date, timedelta

from fastapi import HTTPException

from app import authority
from app.domain import new_case
from app.store import DEMO_ACTOR
from app.workflow import apply, options, state

HEAD = {**DEMO_ACTOR, 'id': 'head', 'name': 'Trưởng phòng', 'role': 'head_of_department'}
NOTE = 'Nội dung xử lý kiểm thử đủ độ dài.'


def actions(case, actor=HEAD):
    return {o['id'] for o in options(case, actor)}


def dossier(procedure='bcnckt'):
    case = new_case('Hồ sơ', 'Điện Biên', DEMO_ACTOR, '2026-09-01', 'project', procedure=procedure)
    case['documents'] = [{'role': 'submission'}]
    return case


class FeasibilityWorkflowTests(unittest.TestCase):
    def test_one_supplement_request_only_during_intake(self):
        case = dossier()
        self.assertIn('request_supplement', actions(case))
        self.assertIn('reject_intake', actions(case))
        apply(case, HEAD, 'request_supplement', NOTE)
        self.assertEqual((state(case), case['workflow']['counters']['request_supplement']), ('awaiting_supplement', 1))
        self.assertIn('Điều 36', case['workflow']['history'][-1]['basis'])
        apply(case, HEAD, 'resume', NOTE)
        self.assertEqual(case['workflow']['validAt'], date.today().isoformat())
        # Supplement already used; later problems go through a single suspension (Mẫu 16).
        self.assertNotIn('request_supplement', actions(case))
        self.assertIn('suspend', actions(case))
        apply(case, HEAD, 'suspend', NOTE)
        apply(case, HEAD, 'resume', NOTE)
        self.assertNotIn('suspend', actions(case))
        with self.assertRaises(HTTPException):
            apply(case, HEAD, 'suspend', NOTE)

    def test_extension_once_and_leaders_only(self):
        case = dossier()
        apply(case, HEAD, 'start', NOTE)
        self.assertEqual(case['workflow']['validAt'], date.today().isoformat())
        self.assertNotIn('extend', actions(case, DEMO_ACTOR))
        apply(case, HEAD, 'extend', NOTE)
        self.assertTrue(case['workflow']['extended'])
        self.assertEqual(state(case), 'processing')
        self.assertNotIn('extend', actions(case))

    def test_stop_only_after_the_supplement_window(self):
        case = dossier()
        apply(case, HEAD, 'request_supplement', NOTE)
        case['sla'] = {'waitingDueDate': (date.today() + timedelta(days=3)).isoformat()}
        self.assertNotIn('stop', actions(case))
        case['sla'] = {'waitingDueDate': (date.today() - timedelta(days=1)).isoformat()}
        apply(case, HEAD, 'stop', NOTE)
        self.assertEqual(state(case), 'stopped')
        self.assertEqual(actions(case), set())

    def test_rejected_intake_is_terminal(self):
        case = dossier()
        apply(case, HEAD, 'reject_intake', NOTE)
        self.assertEqual(state(case), 'rejected')
        self.assertEqual(actions(case), set())
        self.assertNotIn('reject_intake', actions(dossier(), DEMO_ACTOR))


class LineageLimitTests(unittest.TestCase):
    def test_supplement_round_inherits_counters(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from uuid import uuid4
        from app.store import Store
        from app.routes.cases import create_supplement
        from app.schemas import Supplement

        with (
            tempfile.TemporaryDirectory() as directory,
            patch('app.store.DATA_DIR', Path(directory)),
            patch.object(Store, 'project', return_value={'id': 'project'}),
        ):
            store = Store(actor=HEAD)
            prior = dossier()
            apply(prior, HEAD, 'request_supplement', NOTE)
            from app.domain import audit

            audit(prior, HEAD, 'Tạo', 'Kiểm thử')
            store.save(prior)
            body = Supplement(
                requestId=uuid4(),
                name='Hồ sơ bổ sung',
                legalDate='2026-09-05',
                reason='Bổ sung theo Mẫu 15',
                revision=1,
            )
            child = create_supplement(prior['id'], body, store)
            self.assertEqual(child['workflow']['counters'], {'request_supplement': 1})
            self.assertNotIn('request_supplement', actions(child))


class PermitWorkflowTests(unittest.TestCase):
    def test_single_notice_then_refusal(self):
        case = dossier('gpxd')
        self.assertNotIn('suspend', actions(case))
        self.assertNotIn('stop', actions(case))
        apply(case, HEAD, 'start', NOTE)
        self.assertIn('request_supplement', actions(case))
        apply(case, HEAD, 'request_supplement', NOTE)
        options_labels = {o['id']: o['label'] for o in options(case, HEAD)}
        self.assertEqual(options_labels['stop'], 'Thông báo không cấp giấy phép')
        apply(case, HEAD, 'resume', NOTE)
        self.assertNotIn('request_supplement', actions(case))


class AuthorityTests(unittest.TestCase):
    def project(self, **values):
        base = {
            'field': 'Dân dụng',
            'group_type': 'B',
            'grade': 'II',
            'investment_form': 'dau_tu_cong',
            'location_district': 'Phường Him Lam, TP. Điện Biên Phủ',
        }
        return {**base, **values}

    def test_feasibility(self):
        self.assertEqual(authority.resolve('bcnckt', self.project())['authority'], 'so_xay_dung')
        self.assertEqual(authority.resolve('bcnckt', self.project(field='Giao thông'))['authority'], 'so_xay_dung')
        self.assertEqual(authority.resolve('bcnckt', self.project(decided_by_commune=True))['authority'], 'ubnd_xa')
        self.assertEqual(authority.resolve('bcnckt', self.project(grade='Đặc biệt'))['authority'], 'bo_chuyen_nganh')
        self.assertEqual(authority.resolve('bcnckt', self.project(field='Thủy lợi'))['authority'], 'so_nnmt')
        self.assertEqual(authority.resolve('bcnckt', self.project(field='Công nghiệp'))['authority'], 'so_cong_thuong')
        zone = authority.resolve('bcnckt', self.project(location_district='Khu công nghiệp Na Hai'))
        self.assertEqual(zone['authority'], 'bql_kcn')
        business_small = authority.resolve('bcnckt', self.project(investment_form='kinh_doanh', grade='III'))
        self.assertEqual(
            (business_small['authority'], business_small['suggestion']), ('khong_thuoc_dien', 'reject_intake')
        )
        unknown = authority.resolve('bcnckt', {'field': 'Dân dụng'})
        self.assertIn('nhóm dự án', unknown['missing'])
        self.assertTrue(unknown['requiresConfirmation'])

    def test_permit(self):
        self.assertEqual(authority.resolve('gpxd', self.project())['authority'], 'mien_phep')
        # Kinh doanh + Phụ lục IV: appraisal route, then permit exemption; existing permits stay with the Sở.
        business = self.project(investment_form='kinh_doanh')
        self.assertEqual(authority.resolve('gpxd', business)['authority'], 'khong_thuoc_dien')
        self.assertEqual(authority.resolve('gpxd', business, subtype='amendment')['authority'], 'so_xay_dung')
        self.assertEqual(
            authority.resolve('gpxd', {**business, 'grade': 'III'}, subtype='extension')['authority'], 'ubnd_xa'
        )
        church = self.project(investment_form='khac', field='Tôn giáo')
        self.assertEqual(authority.resolve('gpxd', church)['authority'], 'so_xay_dung')
        self.assertFalse(authority.resolve('gpxd', church)['appendixIv']['listed'])
        appraised = authority.resolve('gpxd', self.project(investment_form='khac', field='Kho lạnh'), appraised=True)
        self.assertEqual((appraised['authority'], appraised['suggestion']), ('mien_phep', 'redirect_start_notice'))

    def test_inspection_and_appendix_iv(self):
        self.assertEqual(authority.resolve('nghiem_thu', self.project())['authority'], 'so_xay_dung')
        small = authority.resolve('nghiem_thu', self.project(investment_form='kinh_doanh', grade='IV'))
        self.assertEqual(small['authority'], 'khong_thuoc_dien')
        self.assertTrue(
            authority.resolve('nghiem_thu', self.project(field='Đê điều', grade='IV'))['appendixIv']['listed']
        )
        self.assertIsNone(authority.appendix_iv(authority.facts(self.project(field='Thủy lợi', grade='III')))[0])


if __name__ == '__main__':
    unittest.main()
