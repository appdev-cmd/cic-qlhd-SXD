import unittest
from fastapi import HTTPException
from app.domain import new_case
from app.store import DEMO_ACTOR
from app.workflow import apply,options,state
from app.legal_assistant import retrieve

class DemoWorkflowTests(unittest.TestCase):
    def test_permit_review_requires_leadership_and_evidence(self):
        c=new_case('Giấy phép thử nghiệm','Điện Biên',DEMO_ACTOR,'2026-09-27',sample=True,procedure='gpxd')
        apply(c,DEMO_ACTOR,'start','Bắt đầu kiểm tra hồ sơ')
        with self.assertRaises(HTTPException):apply(c,DEMO_ACTOR,'submit_review','Trình lãnh đạo rà soát')
        c['documents']=[{'role':'submission'}]
        from app.procedure_rules import VERSION
        c['procedureReview']={'ruleVersion':VERSION,'conclusion':'supplement','authority':'Cơ quan kiểm tra mẫu','scope':'Phạm vi mẫu',
            'checks':[{'status':'missing'}],'defects':[]}
        apply(c,DEMO_ACTOR,'submit_review','Trình lãnh đạo rà soát')
        with self.assertRaises(HTTPException):apply(c,DEMO_ACTOR,'approve','Không được tự duyệt')
        with self.assertRaises(HTTPException):apply(c,{**DEMO_ACTOR,'role':'admin'},'approve','Quản trị không duyệt')
        apply(c,{**DEMO_ACTOR,'role':'head_of_department'},'approve','Đã rà soát nội bộ mẫu')
        self.assertEqual(state(c),'reviewed');self.assertTrue(c['finalReview']['simulation'])
        self.assertEqual(options(c,DEMO_ACTOR),[])

    def test_inspection_correction_chain_and_assignment(self):
        c=new_case('Nghiệm thu thử nghiệm','Điện Biên',DEMO_ACTOR,'2026-09-27',procedure='nghiem_thu')
        apply(c,DEMO_ACTOR,'start','Bắt đầu kiểm tra hồ sơ')
        with self.assertRaises(HTTPException):apply(c,DEMO_ACTOR,'schedule_visit','Kiểm tra công trình')
        apply(c,DEMO_ACTOR,'schedule_visit','Lịch kiểm tra công trình','2026-10-01')
        apply(c,DEMO_ACTOR,'require_correction','Yêu cầu bổ sung thí nghiệm')
        self.assertEqual(state(c),'correction')
        c['workflow']['assigneeId']='another'
        with self.assertRaises(HTTPException):apply(c,DEMO_ACTOR,'confirm_correction','Đã có tài liệu khắc phục')

    def test_legal_search_has_source_fingerprints_and_real_quotes(self):
        sources,manifest=retrieve('Hồ sơ thẩm định báo cáo nghiên cứu khả thi Nghị định 217')
        self.assertEqual(len(manifest),7);self.assertTrue(sources)
        self.assertTrue(any('217' in s['document'] for s in sources))
        self.assertTrue(all(len(s['sha256'])==64 and s['line']>0 for s in sources))
        detailed,_=retrieve('Hồ sơ trình thẩm định báo cáo nghiên cứu khả thi gồm những tài liệu nào theo Nghị định 217/2026/NĐ-CP?')
        self.assertIn('Điều 35.',detailed[0]['heading'])
