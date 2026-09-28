import copy
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import HTTPException
from app.domain import new_case, invalidate
from app.store import DEMO_ACTOR
from app.procedure_review import PERMITS, Review, apply, specification, validate
from app import ocr_jobs


class ProcedureTests(unittest.TestCase):
    def case(self, procedure='gpxd'):
        case = new_case('Hồ sơ kiểm thử', 'Điện Biên', DEMO_ACTOR, '2026-09-27', procedure=procedure)
        case['documents'] = [{'id': 'submitted', 'role': 'submission', 'hash': 'a'*64},
                             {'id': 'reference', 'role': 'reference', 'hash': 'b'*64}]
        return case

    def body(self, case, subtype='new'):
        return dict(revision=case['revision'], subtype=subtype, authority='Cơ quan thử nghiệm',
                    scope='Phạm vi kiểm tra mẫu', investor='Chủ đầu tư mẫu', location='Điện Biên',
                    originalForm='03', priorPermit='GPXD thử nghiệm 01', extensionCount=1,
                    details={'authorityBasis':'Điều 53, phạm vi kiểm thử', 'temporaryTerm':'Hạn theo kịch bản thử nghiệm',
                             'remainingSafety':'Biện pháp cách ly phần đang thi công'},
                    conclusion='eligible', checks=[dict(id=c['id'], status='satisfied',
                    documentIds=['submitted'], note='Đã đối chiếu tài liệu thử nghiệm.')
                    for c in specification(case, subtype)['checks']])

    def test_all_thirteen_subtypes_preserve_evidence(self):
        for procedure, types in [('gpxd', PERMITS), ('nghiem_thu', ['complete', 'conditional', 'partial'])]:
            for subtype in types:
                with self.subTest(subtype=subtype):
                    case = self.case(procedure)
                    apply(case, DEMO_ACTOR, Review(**self.body(case, subtype)))
                    self.assertEqual(case['procedureReview']['evidenceHashes'], {'submitted': 'a'*64})
                    self.assertIsNone(case['finalReview'])

    def test_checklist_rejects_missing_duplicate_and_foreign_evidence(self):
        case = self.case(); original = self.body(case)
        variants = []
        body = copy.deepcopy(original); body['checks'].pop(); variants.append(body)
        body = copy.deepcopy(original); body['checks'][-1] = body['checks'][0]; variants.append(body)
        for ids in [[], ['reference'], ['foreign']]:
            body = copy.deepcopy(original); body['checks'][0]['documentIds'] = ids; variants.append(body)
        body = copy.deepcopy(original); body['checks'][0]['note'] = 'ngắn'; variants.append(body)
        body = copy.deepcopy(original); body['checks'][0]['status'] = 'not_applicable'; variants.append(body)
        for body in variants:
            with self.subTest(body=body), self.assertRaises(HTTPException):
                apply(case, DEMO_ACTOR, Review(**body))

    def test_eligible_blocks_pending_missing_and_open_defects(self):
        case = self.case()
        for status in ['pending', 'missing']:
            body = self.body(case); body['checks'][0]['status'] = status
            with self.assertRaises(HTTPException): apply(case, DEMO_ACTOR, Review(**body))
        for defect in [dict(description='Tồn tại mẫu', responsible='Đơn vị mẫu'),
                       dict(description='Tồn tại mẫu', responsible='Đơn vị mẫu', status='resolved')]:
            body = self.body(case); body['defects'] = [defect]
            with self.assertRaises(HTTPException): apply(case, DEMO_ACTOR, Review(**body))
        body['defects'][0].update(documentIds=['submitted'], resolution='Đã đối chiếu hồ sơ khắc phục.')
        apply(case, DEMO_ACTOR, Review(**body)); validate(case['procedureReview'])

    def test_only_conditional_checks_can_be_not_applicable(self):
        case = self.case(); body = self.body(case)
        next(c for c in body['checks'] if c['id']=='specialized').update(status='not_applicable', documentIds=[])
        apply(case, DEMO_ACTOR, Review(**body))

    def test_invalid_regime_subtype_and_detail_fields(self):
        case = self.case(); case['legalDate'] = '2026-06-30'
        with self.assertRaises(HTTPException): specification(case)
        case['legalDate'] = '2026-09-27'
        with self.assertRaises(HTTPException): specification(case, 'unknown')
        body = self.body(case); body['details'] = {'unrecognized': 'value'}
        with self.assertRaises(HTTPException): apply(case, DEMO_ACTOR, Review(**body))

    def test_evidence_change_archives_review_and_clears_conclusion(self):
        case = self.case(); apply(case, DEMO_ACTOR, Review(**self.body(case)))
        previous = copy.deepcopy(case['procedureReview']); invalidate(case)
        self.assertIsNone(case['procedureReview'])
        self.assertEqual(case['procedureReviewHistory'][-1], previous)


class OcrJobTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'APPRAISAL_OCR_SPOOL': self.folder.name}); self.env.start()
        self.case = new_case('OCR thử nghiệm', 'Điện Biên', DEMO_ACTOR, '2026-09-27')
        self.data = b'%PDF-fixture'
        self.case['documents'] = [dict(id='doc', name='scan.pdf', role='submission', requirementId='TTR',
            hash=hashlib.sha256(self.data).hexdigest(), segments=[], warnings=[])]
        self.store = Mock(); self.store.file.return_value = self.data

    def tearDown(self):
        self.env.stop(); self.folder.cleanup()

    def prepare(self):
        with patch('app.ocr_jobs.available', return_value=True):
            path = ocr_jobs.prepare(self.store, self.case, 'doc')
        self.store.get.side_effect = lambda _: copy.deepcopy(self.case)
        return path

    def test_prepare_rejects_changed_original_and_running_job(self):
        self.store.file.return_value = b'changed'
        with patch('app.ocr_jobs.available', return_value=True), self.assertRaises(HTTPException):
            ocr_jobs.prepare(self.store, self.case, 'doc')
        self.assertEqual(list(Path(self.folder.name).iterdir()), [])
        self.store.file.return_value = self.data; self.prepare()
        with patch('app.ocr_jobs.available', return_value=True), self.assertRaises(HTTPException):
            ocr_jobs.prepare(self.store, self.case, 'doc')

    def test_completed_ocr_requires_fact_confirmation_and_cleans_spool(self):
        path = self.prepare(); saved = Mock()
        segments = [dict(id='segment', page=1, locator='Trang 1 (OCR)', text='Tổng mức đầu tư: 25.000.000.000')]
        with patch('app.ocr_jobs.read_document', return_value=(segments, ['Cần đối chiếu'], 'not_detected')):
            ocr_jobs.run(self.store, self.case['id'], self.case['job']['id'], copy.deepcopy(self.case), saved)
        result = saved.call_args.args[1]
        self.assertEqual(result['job']['status'], 'completed')
        self.assertTrue(result['facts']); self.assertTrue(all(f['reviewStatus']=='pending' for f in result['facts']))
        self.assertEqual(result['documents'][0]['hash'], hashlib.sha256(self.data).hexdigest())
        self.assertFalse(path.exists())

    def test_revision_change_and_cancel_do_not_overwrite_case(self):
        for change in ['revision', 'cancel']:
            with self.subTest(change=change):
                self.case.pop('job', None); path = self.prepare(); snapshot = copy.deepcopy(self.case)
                if change=='revision': self.case['revision'] += 1
                else: self.case['job']['status'] = 'cancelled'
                def parse(*args, **kwargs):
                    kwargs['before_page'](1, 1)
                    self.fail('Cancelled OCR must stop before parsing')
                saved = Mock()
                with patch('app.ocr_jobs.read_document', side_effect=parse):
                    ocr_jobs.run(self.store, self.case['id'], snapshot['job']['id'], snapshot, saved)
                saved.assert_not_called(); self.assertFalse(path.exists())

    def test_parser_failure_preserves_original(self):
        path = self.prepare(); saved = Mock()
        with patch('app.ocr_jobs.read_document', side_effect=ValueError('unreadable')):
            ocr_jobs.run(self.store, self.case['id'], self.case['job']['id'], copy.deepcopy(self.case), saved)
        result = saved.call_args.args[1]
        self.assertEqual(result['job']['status'], 'failed')
        self.assertEqual(result['documents'], self.case['documents']); self.assertFalse(path.exists())

    def test_database_outage_keeps_spool_for_retry(self):
        path = self.prepare(); self.store.get.side_effect = RuntimeError('database unavailable')
        with patch('app.ocr_jobs.read_document', side_effect=ValueError('retry')), self.assertRaises(RuntimeError):
            ocr_jobs.run(self.store, self.case['id'], self.case['job']['id'], copy.deepcopy(self.case), Mock())
        self.assertTrue(path.exists())
