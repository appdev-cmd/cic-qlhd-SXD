import copy
import unittest
from fastapi import HTTPException
from pydantic import ValidationError
from app.procedure_review import Review, apply, validate, specification, export_blocks
from app.procedure_rules import VERSION, permit_checks, inspection_checks, template_info
from app.domain import new_case
from app.store import DEMO_ACTOR


class ProcedureLegalTests(unittest.TestCase):
    def fixture(self, procedure='nghiem_thu', subtype='conditional'):
        case=new_case('Lần nộp thử nghiệm','Điện Biên',DEMO_ACTOR,'2026-09-27',procedure=procedure)
        case['projectName']='Dự án kiểm thử biểu mẫu'
        case['documents']=[dict(id='doc',name='Tài liệu thử nghiệm',role='submission',hash='a'*64)]
        body=dict(revision=case['revision'],subtype=subtype,ruleVersion=VERSION,authority='Cơ quan kiểm thử',
            investor='Chủ đầu tư thử nghiệm',location='Địa điểm thử nghiệm',scope='Phạm vi thử nghiệm',
            conclusion='eligible',details={'authorityBasis':'Căn cứ phạm vi trong kịch bản kiểm thử'},
            conditions='Giới hạn sử dụng theo biên bản được đối chiếu.',
            checks=[dict(id=c['id'],status='satisfied',note='Đã đối chiếu chứng cứ thử nghiệm.',documentIds=['doc'])
                    for c in specification(case,subtype)['checks']])
        return case,body

    def test_conditional_open_defect_needs_all_safeguards(self):
        case,body=self.fixture()
        defect=dict(description='Công việc hoàn thiện còn lại',responsible='Nhà thầu thử nghiệm',dueDate='2026-10-10',
                    documentIds=['doc'],resolution='Đã đối chiếu không ảnh hưởng chịu lực, tuổi thọ và công năng.',
                    nonSafetyConfirmed=True,status='open')
        body['defects']=[defect]
        for key in ('dueDate','documentIds','resolution','nonSafetyConfirmed'):
            invalid=copy.deepcopy(body);invalid['defects'][0].pop(key)
            with self.subTest(key=key),self.assertRaises(HTTPException):apply(case,DEMO_ACTOR,Review(**invalid))
        apply(case,DEMO_ACTOR,Review(**body));validate(case['procedureReview'])
        invalid=copy.deepcopy(body);invalid['conditions']=''
        with self.assertRaises(HTTPException):apply(case,DEMO_ACTOR,Review(**invalid))

    def test_complete_does_not_allow_conditional_defects(self):
        case,body=self.fixture(subtype='complete')
        body['defects']=[dict(description='Chưa hoàn thiện',responsible='Nhà thầu',status='open',
            dueDate='2026-10-10',documentIds=['doc'],resolution='Tài liệu khắc phục được đối chiếu',nonSafetyConfirmed=True)]
        with self.assertRaises(HTTPException):apply(case,DEMO_ACTOR,Review(**body))

    def test_old_rules_block_approval_and_export_and_preserve_history(self):
        case,body=self.fixture();apply(case,DEMO_ACTOR,Review(**body))
        case['procedureReview'].pop('ruleVersion')
        self.assertTrue(specification(case)['reviewOutdated'])
        with self.assertRaises(HTTPException):validate(case['procedureReview'])
        with self.assertRaises(HTTPException):export_blocks(case,'draft')
        apply(case,DEMO_ACTOR,Review(**body))
        self.assertEqual(len(case['procedureReviewHistory']),1)
        body['ruleVersion']='old'
        with self.assertRaises(HTTPException):apply(case,DEMO_ACTOR,Review(**body))

    def test_amendment_and_extension_are_distinct_from_new(self):
        amendment={c['id']:c for c in permit_checks('amendment')}
        self.assertTrue(amendment['land']['conditional']);self.assertFalse(amendment['approval']['conditional'])
        extension={c['id']:c for c in permit_checks('extension')}
        self.assertNotIn('land',extension);self.assertNotIn('design',extension)
        self.assertIn('02',extension['application']['label'])
        self.assertTrue(next(c for c in permit_checks('reissue') if c['id']=='prior')['conditional'])

    def test_extension_requires_original_form_and_legal_count(self):
        case,body=self.fixture('gpxd','extension')
        with self.assertRaises(HTTPException):apply(case,DEMO_ACTOR,Review(**body))
        body.update(originalForm='04',priorPermit='GPXD 01 thử nghiệm',extensionCount=2)
        apply(case,DEMO_ACTOR,Review(**body))
        title,blocks=export_blocks(case,'draft');text=str(blocks)
        self.assertIn('GIA HẠN',title);self.assertIn('04 Phụ lục II',text);self.assertIn('12 tháng',text)
        self.assertIn('phụ lục bổ sung',text)
        body['extensionCount']=3
        with self.assertRaises(ValidationError):Review(**body)

    def test_every_check_has_source_and_templates_have_correct_scope(self):
        from app.procedure_review import PERMITS
        for subtype in PERMITS:
            rows=permit_checks(subtype)
            self.assertEqual(len(rows),len({c['id'] for c in rows}))
            self.assertTrue(all(c['citation'] and c['url'].startswith('https://') for c in rows))
            self.assertTrue(template_info('gpxd',subtype)['output'])
        rows={c['id']:c for c in inspection_checks('partial')}
        self.assertIn('Phụ lục X',rows['handover']['citation'])
        self.assertIn('Phụ lục VII',rows['archive']['citation'])
        self.assertIn('partial_safety',rows)

    def test_input_and_output_use_national_ids_and_project_name(self):
        case,body=self.fixture();apply(case,DEMO_ACTOR,Review(**body))
        for kind in ('application','draft'):
            title,blocks=export_blocks(case,kind);text=str(blocks)
            self.assertIn('Dự án kiểm thử biểu mẫu',text)
            self.assertNotIn('Lần nộp thử nghiệm',text)
            self.assertIn('Mã định danh dự án',text)
            self.assertIn('chưa',text)
        self.assertIn('Phụ lục VI',str(export_blocks(case,'application')))
        self.assertIn('Phụ lục VIII',str(export_blocks(case,'draft')))

    def test_all_thirteen_subtypes_export_both_directions_and_formats(self):
        from app.procedure_review import PERMITS
        from app.reporting import document_bytes
        for procedure,subtypes in [('gpxd',PERMITS),('nghiem_thu',['complete','conditional','partial'])]:
            for subtype in subtypes:
                case,body=self.fixture(procedure,subtype);body['conclusion']='pending'
                apply(case,DEMO_ACTOR,Review(**body))
                for kind in ('application','draft'):
                    title,blocks=export_blocks(case,kind)
                    with self.subTest(subtype=subtype,kind=kind):
                        self.assertTrue(document_bytes(title,blocks,'pdf').startswith(b'%PDF'))
                        self.assertTrue(document_bytes(title,blocks,'docx').startswith(b'PK'))
