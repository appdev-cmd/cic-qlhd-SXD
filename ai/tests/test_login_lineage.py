import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from fastapi import HTTPException
from app import test_login
from app.domain import new_case,audit
from app.store import Store,DEMO_ACTOR
from app.main import Supplement,create_supplement,test_login_guard,SECRET


class LoginAndLineageTests(unittest.TestCase):
    def test_quick_login_requires_staging_and_flag_and_matching_project(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'accounts.json'
            file.write_text(json.dumps({'projectRef':'fixture','accounts':[{'role':'officer','password':'fixture-secret','email':'fixture@example.invalid'}]}))
            with patch.dict(os.environ,{'APPRAISAL_TEST_ACCOUNTS_FILE':str(file),'APPRAISAL_MODE':'cloud',
                'APPRAISAL_ENVIRONMENT':'staging','APPRAISAL_ENABLE_TEST_LOGIN':'true','SUPABASE_URL':'https://fixture.supabase.co'}):
                self.assertEqual(len(test_login.options()),1)
                self.assertNotIn('password',json.dumps(test_login.options()))
                self.assertNotIn('email',json.dumps(test_login.options()))
                for change in [{'APPRAISAL_ENVIRONMENT':'production'},{'APPRAISAL_ENABLE_TEST_LOGIN':'false'},
                               {'SUPABASE_URL':'https://another.supabase.co'},{'APPRAISAL_MODE':'demo'}]:
                    with patch.dict(os.environ,change):self.assertEqual(test_login.options(),[])

    def test_quick_login_worker_guard(self):
        for token,local in [('', 'true'),(SECRET,''),(SECRET,'false')]:
            with self.assertRaises(HTTPException):test_login_guard(token,local)
        test_login_guard(SECRET,'true')

    def test_supplement_preserves_source_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory,patch('app.store.DATA_DIR',Path(directory)),patch.object(Store,'project',return_value={'id':'project'}):
            store=Store(actor=DEMO_ACTOR)
            prior=new_case('Hồ sơ gốc','Điện Biên',DEMO_ACTOR,'2026-09-27','project',sample=True)
            prior['documents']=[{'id':'original-document'}]
            prior['finalReview']={'decision':'request_supplement'}
            prior['procedureReview']={'conclusion':'supplement','reviewedBy':'Người rà soát lần trước'}
            audit(prior,DEMO_ACTOR,'Tạo hồ sơ','Bộ kiểm tra')
            store.save(prior);snapshot=store.get(prior['id'])
            body=Supplement(requestId=uuid4(),name='Hồ sơ bổ sung',legalDate='2026-09-27',reason='Bổ sung tài liệu khảo sát',revision=1)
            child=create_supplement(prior['id'],body,store)
            self.assertEqual(child['submissionRound'],2);self.assertEqual(child['dossierId'],prior['id'])
            self.assertEqual(child['documents'],[]);self.assertEqual(child['runs'],[]);self.assertIsNone(child['finalReview'])
            self.assertIsNone(child.get('procedureReview'))
            self.assertEqual(store.get(prior['id']),snapshot)
            self.assertEqual(create_supplement(prior['id'],body,store),child)
            history=store.lineage(child['id']);self.assertEqual(history['total'],2);self.assertEqual(history['latestId'],child['id'])
            for changed in [body.model_copy(update={'reason':'Nội dung khác hoàn toàn'}),body.model_copy(update={'requestId':uuid4()})]:
                with self.assertRaises(HTTPException) as error:create_supplement(prior['id'],changed,store)
                self.assertEqual(error.exception.status_code,409)
            prior['revision']=2
            with self.assertRaises(HTTPException):store.save(prior,1)

    def test_supplement_rejects_stale_revision_and_earlier_date(self):
        with tempfile.TemporaryDirectory() as directory,patch('app.store.DATA_DIR',Path(directory)),patch.object(Store,'project',return_value={'id':'project'}):
            store=Store(actor=DEMO_ACTOR);prior=new_case('Hồ sơ gốc','Điện Biên',DEMO_ACTOR,'2026-09-27','project')
            store.save(prior)
            for revision,day,status in [(2,'2026-09-27',409),(1,'2026-09-26',422)]:
                body=Supplement(requestId=uuid4(),name='Hồ sơ bổ sung',legalDate=day,reason='Bổ sung tài liệu khảo sát',revision=revision)
                with self.assertRaises(HTTPException) as error:create_supplement(prior['id'],body,store)
                self.assertEqual(error.exception.status_code,status)
