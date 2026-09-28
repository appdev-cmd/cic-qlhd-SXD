import copy
import unittest
from app.legal import resolve_profile,legal_checklist,appraisal_duration
from app.domain import new_case
from app.draft_templates import draft_blocks
from test_appraisal import client

class LegalTests(unittest.TestCase):
    def case(self):
        return new_case('Dự án thử pháp lý','Điện Biên',{'tenantId':'test','department':'QLXD','name':'Người thử'},'2026-09-27')

    def test_post_july_default(self):
        c=self.case();p=resolve_profile(c)
        self.assertEqual(p['code'],'nd217');self.assertFalse(p['confirmed'])
        self.assertEqual(p['templates']['notice'],'03')
        self.assertEqual(p['templates']['decision'],'09')

    def test_transition_requires_status(self):
        c=self.case();c['legalContext']['submissionDate']='2026-06-20'
        self.assertEqual(resolve_profile(c)['code'],'pending')
        for status,expected in [('eligible_pending','nd175'),('ineligible','nd217'),('result_ineligible','nd217'),('result_eligible','completed_legacy')]:
            c['legalContext']['priorStatus']=status
            self.assertEqual(resolve_profile(c)['code'],expected)
        c['legalContext']['stage']='amendment'
        self.assertEqual(resolve_profile(c)['code'],'nd217')

    def test_conditional_not_automatically_missing(self):
        c=self.case();rows={r['id']:r for r in legal_checklist(c)}
        self.assertEqual(rows['nd217.rail_standards']['state'],'unknown')
        self.assertEqual(rows['nd217.submission']['state'],'missing')
        c['legalRequirements']['nd217.rail_standards']={'applicability':'not_applicable','note':'Trường học, không phải đường sắt'}
        self.assertEqual(next(r for r in legal_checklist(c) if r['id']=='nd217.rail_standards')['state'],'not_applicable')

    def test_reference_does_not_satisfy_legal_evidence(self):
        c=self.case();c['documents']=[{'id':'ref','requirementId':'TTR','role':'reference'}]
        self.assertEqual(legal_checklist(c)[0]['state'],'missing')

    def test_durations_preserve_working_day_unit(self):
        self.assertEqual(appraisal_duration('B','III'),{'duration':16,'unit':'working_days'})
        self.assertEqual(appraisal_duration('national','special'),{'duration':60,'unit':'calendar_days'})
        self.assertEqual(appraisal_duration('A','I')['duration'],25)
        self.assertIsNone(appraisal_duration('B','unknown'))

    def test_scope_templates_not_interchanged(self):
        c=self.case();c['legalContext']['scope']='decision_maker'
        self.assertEqual(resolve_profile(c)['templates']['notice'],'07')
        self.assertEqual(legal_checklist(c),[])
        self.assertIsNone(draft_blocks(c,'notice'))

    def test_draft_sections_and_unsigned_conclusion(self):
        c=self.case();title,blocks=draft_blocks(c,'notice')
        headings=[b.get('heading','') for b in blocks]
        for prefix in ['I.','II.','III.','IV.','V.','VI.']:
            self.assertTrue(any(h.startswith(prefix) for h in headings))
        decision=draft_blocks(c,'decision')[1]
        self.assertEqual(len(next(b for b in decision if b.get('heading','').startswith('Điều 1'))['text']),19)
        self.assertIn('Chưa lựa chọn',' '.join(t for b in blocks for t in b.get('text',[])))

    def test_review_validates_scope_and_invalidates_result(self):
        c=client.post('/v1/samples/initial').json()
        context={'revision':c['revision'],'submissionDate':'2026-09-27','scope':'construction','stage':'original','priorStatus':'unknown','note':'Tình huống thử trình mới sau ngày 01/07/2026.'}
        response=client.post(f"/v1/cases/{c['id']}/legal/context",json=context)
        self.assertEqual(response.status_code,200)
        updated=response.json();self.assertTrue(updated['runs'][-1]['stale'])
        self.assertTrue(resolve_profile(updated)['confirmed'])
        req={'revision':updated['revision'],'applicability':'not_applicable','requirementIds':[],'note':'Kiểm tra không được bỏ tờ trình bắt buộc.'}
        self.assertEqual(client.post(f"/v1/cases/{c['id']}/legal/requirements/nd217.submission",json=req).status_code,422)
        req['requirementIds']=['foreign-document-group']
        self.assertEqual(client.post(f"/v1/cases/{c['id']}/legal/requirements/nd217.rail_standards",json=req).status_code,422)
