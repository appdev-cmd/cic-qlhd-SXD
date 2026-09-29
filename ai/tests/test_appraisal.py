import base64
import io
import json
import os
import tempfile
import time
import unittest
from unittest.mock import patch

temp = tempfile.TemporaryDirectory(prefix='appraisal-tests-')
os.environ['APPRAISAL_MODE'] = 'demo'
os.environ['APPRAISAL_DATA_DIR'] = temp.name
os.environ['APPRAISAL_INTERNAL_TOKEN'] = 'unit-test-only'
from fastapi.testclient import TestClient
from app.main import app
from app.domain import new_case, invalidate
from app.ingestion import number, read_document, checklist_candidates
from app.rules import analyze
from app.reporting import document_bytes
from app.provider import semantic_notes

client = TestClient(app, headers={'x-internal-token': 'unit-test-only'})


class AppraisalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.initial = client.post('/v1/samples/initial').json()
        cls.revised = client.post('/v1/samples/revised').json()

    def test_workflow_endpoint_reports_authority_limits_and_actions(self):
        info = client.get('/v1/cases/' + self.initial['id'] + '/workflow')
        self.assertEqual(info.status_code, 200, info.text)
        body = info.json()
        self.assertIn('authority', body)
        self.assertIn('limits', body['policy'])
        self.assertIn('request_supplement', {a['id'] for a in body['actions']})
        self.assertEqual(body['policy']['limits']['request_supplement']['max'], 1)

    def test_worker_requires_internal_key(self):
        self.assertEqual(TestClient(app).get('/v1/health').status_code, 403)

    def test_initial_findings(self):
        run = self.initial['runs'][-1]
        fs = {f['code']: f for f in run['findings']}
        self.assertEqual(len(self.initial['documents']), 14)
        self.assertIn('411 m²', fs['AREA.SUM']['calculation'])
        self.assertEqual(fs['FIRE.TANK']['result'], 'requires_specialist')
        self.assertIn('CROSS.mep_certificate', fs)
        self.assertIn('CROSS.standard_primary', fs)
        self.assertEqual(fs['COST.SUM']['result'], 'consistent')
        self.assertEqual(fs['PLAN.MATH']['result'], 'consistent')

    def test_revision_arithmetic_and_zero_savings(self):
        run = self.revised['runs'][-1]
        fs = {f['code']: f for f in run['findings']}
        self.assertEqual(run['costComparison']['netSavings'], '0')
        self.assertEqual(sum(int(x['difference']) for x in run['costComparison']['items']), 0)
        self.assertEqual(fs['AREA.SUM']['result'], 'consistent')
        self.assertNotIn('CROSS.mep_certificate', fs)
        self.assertIn('LAW.TIME', fs)

    def test_sources_exist(self):
        c = self.initial
        refs = {(d['id'], s['id']): s['text'] for d in c['documents'] for s in d['segments']}
        for f in c['runs'][-1]['findings']:
            self.assertTrue(f['sources'] or f['result'] in ['requires_specialist', 'insufficient_evidence'])
            for r in f['sources']:
                self.assertEqual(refs[r['documentId'], r['segmentId']], r['quote'])

    def test_reference_does_not_fill_missing_input(self):
        c = json.loads(json.dumps(self.initial))
        for d in c['documents']:
            d['role'] = 'reference'
        result = analyze(c)
        inputs = [f for f in result['findings'] if f['code'].startswith('INPUT.')]
        self.assertTrue(all(f['result'] == 'insufficient_evidence' for f in inputs))
        self.assertEqual(result['documentIds'], [])

    def test_checklist_from_actual_source(self):
        from pathlib import Path

        files = list(Path('docs/THCS Hương Xuân').glob('5.-*.docx'))
        self.assertTrue(files)
        segments, _, _ = read_document(files[0].name, files[0].read_bytes())
        candidates = checklist_candidates({'id': 'source', 'segments': segments})
        self.assertEqual(len({x['requirementId'] for x in candidates if x['requirementId'].startswith('PL')}), 7)

    def test_version_conflict_duplicate_and_original(self):
        c = client.post(
            '/v1/cases', json={'name': 'Hồ sơ kiểm thử', 'province': 'Điện Biên', 'legalDate': '2026-06-08'}
        ).json()
        raw = 'Tổng mức đầu tư: 217.230.000.000 đồng'.encode()
        payload = {
            'revision': c['revision'],
            'requirementId': 'TTR',
            'name': 'ttr.txt',
            'contentBase64': base64.b64encode(raw).decode(),
        }
        r = client.post(f"/v1/cases/{c['id']}/documents", json=payload)
        self.assertEqual(r.status_code, 200)
        c = r.json()
        self.assertEqual(client.post(f"/v1/cases/{c['id']}/documents", json=payload).status_code, 409)
        payload['revision'] = c['revision']
        self.assertEqual(client.post(f"/v1/cases/{c['id']}/documents", json=payload).status_code, 409)
        doc = c['documents'][0]
        self.assertEqual(client.get(f"/v1/cases/{c['id']}/documents/{doc['id']}").content, raw)
        self.assertEqual(client.get(f"/v1/cases/{self.initial['id']}/documents/{doc['id']}").status_code, 404)

    def test_decimal_confirmation_does_not_change_magnitude(self):
        c = client.post(
            '/v1/cases', json={'name': 'Kiểm tra số thập phân', 'province': 'Điện Biên', 'legalDate': '2026-06-08'}
        ).json()
        c = client.post(
            f"/v1/cases/{c['id']}/documents",
            json={
                'revision': 1,
                'requirementId': 'KT03',
                'name': 'data.txt',
                'contentBase64': base64.b64encode('Hệ số sử dụng đất: 0,375'.encode()).decode(),
            },
        ).json()
        f = c['facts'][0]
        r = client.patch(
            f"/v1/cases/{c['id']}/facts/{f['id']}",
            json={'revision': c['revision'], 'decision': 'confirmed', 'value': '0.375', 'note': 'Đối chiếu nguồn'},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['facts'][0]['value'], '0.375')

    def test_change_cancels_job_and_invalidates_report(self):
        c = json.loads(json.dumps(self.initial))
        c['job'] = {'id': 'job', 'status': 'running'}
        invalidate(c)
        self.assertTrue(c['runs'][-1]['stale'])
        self.assertEqual(c['job']['status'], 'cancelled')

    def test_no_unreviewed_finalization(self):
        c = self.initial
        r = client.post(
            f"/v1/cases/{c['id']}/final-review",
            json={'revision': c['revision'], 'decision': 'reviewed', 'note': 'Chưa xử lý'},
        )
        self.assertEqual(r.status_code, 422)

    def test_a4_and_unverified_signature(self):
        from pypdf import PdfReader

        data = document_bytes(
            'Tài liệu kiểm tra', [{'text': ['Nội dung tiếng Việt có dấu để kiểm tra A4.']}], 'pdf', True
        )
        page = PdfReader(io.BytesIO(data)).pages[0]
        self.assertAlmostEqual(float(page.mediabox.width), 210 / 25.4 * 72, places=2)
        self.assertAlmostEqual(float(page.mediabox.height), 297 / 25.4 * 72, places=2)
        _, _, sig = read_document('test.pdf', data)
        self.assertNotEqual(sig, 'verified')

    def test_model_rejects_fabricated_sources(self):
        payload = {
            'status': 'completed',
            'output': [
                {
                    'content': [
                        {
                            'type': 'output_text',
                            'text': json.dumps({'notes': [{'text': 'Bịa nguồn', 'segmentIds': ['not-found']}]}),
                        }
                    ]
                }
            ],
        }
        with (
            patch.dict(os.environ, {'OPENAI_API_KEY': 'test', 'OPENAI_MODEL': 'test-model'}),
            patch('app.provider.httpx.post') as post,
        ):
            post.return_value.json.return_value = payload
            notes, _ = semantic_notes(self.initial, self.initial['runs'][-1])
            self.assertEqual(notes, [])
            self.assertFalse(post.call_args.kwargs['json']['store'])

    def test_number_localization(self):
        self.assertEqual(number('217.230.000.000 đồng'), '217230000000')
        self.assertEqual(number('7,12 m'), '7.12')
        self.assertIsNone(number('chưa có'))

    def test_background_analysis_and_pagination(self):
        c = client.post(
            '/v1/cases', json={'name': 'Công việc nền', 'province': 'Điện Biên', 'legalDate': '2026-06-08'}
        ).json()
        r = client.post(f"/v1/cases/{c['id']}/analysis", json={'revision': 1, 'mode': 'intake', 'useModel': False})
        self.assertEqual(r.status_code, 200)
        for _ in range(30):
            c = client.get(f"/v1/cases/{c['id']}").json()
            if c['job']['status'] != 'running':
                break
            time.sleep(0.03)
        self.assertEqual(c['job']['status'], 'completed')
        self.assertTrue(c['runs'][-1]['findings'])
        self.assertEqual(client.get('/v1/cases?offset=10000').json(), [])

    def test_ocr_is_unverified_evidence(self):
        from pypdf import PdfWriter

        writer = PdfWriter()
        writer.add_blank_page(595.276, 841.89)
        out = io.BytesIO()
        writer.write(out)
        with patch('app.ocr.page_text', return_value='Tổng mức đầu tư: 217.230.000.000 đồng'):
            segments, warnings, _ = read_document('scan.pdf', out.getvalue())
        self.assertIn('OCR', segments[0]['locator'])
        self.assertTrue(any('phải kiểm tra' in w for w in warnings))


if __name__ == '__main__':
    unittest.main()
