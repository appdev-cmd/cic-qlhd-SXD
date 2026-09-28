import base64
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from PIL import Image
from app.store import Store, DEMO_ACTOR, db
from app.domain import new_case
from app import catalog, gallery
from app.main import AddProjectImage


class SupportingFeatures(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        self.directory=Path(temporary.name)
        scoped=patch('app.store.DATA_DIR',self.directory);scoped.start();self.addCleanup(scoped.stop)
        (self.directory/'projects.json').write_text(json.dumps([{'id':'demo-project','name':'Dự án mẫu','images':[]}]),encoding='utf-8')
        self.store=Store(actor=DEMO_ACTOR)

    def test_catalog_paging_search_and_sensitive_fields(self):
        first=catalog.page(self.store,'personnel',limit=2)
        second=catalog.page(self.store,'personnel',offset=2,limit=2)
        self.assertGreater(first['total'],2)
        self.assertFalse({r['id'] for r in first['items']}&{r['id'] for r in second['items']})
        self.assertTrue(all('id_card' not in r for r in first['items']))
        self.assertFalse(first['canEdit'])
        matching=catalog.page(self.store,'organizations',search='dien bien')
        self.assertGreater(matching['total'],0)
        self.assertEqual(catalog.page(self.store,'organizations',search='%')['total'],0)

    def test_dashboard_counts_dossiers_separately_from_submissions(self):
        for index in range(2):
            case=new_case('Dự án thử nghiệm','Điện Biên',DEMO_ACTOR,'2026-09-28',sample=True)
            case['id']=str(index);case['dossierId']='root';case['projectId']='demo-project'
            with db() as con:con.execute('insert into cases values(?,?,?)',(case['id'],1,json.dumps(case)))
        summary=catalog.dashboard(self.store,'sample')
        self.assertEqual(summary['cases']['total'],2)
        self.assertEqual(summary['cases']['dossiers'],1)
        self.assertEqual(summary['projects']['total'],1)
        self.assertEqual(catalog.dashboard(self.store,'real')['cases']['total'],0)

    def test_dashboard_charts_reconcile_and_respect_sample_filter(self):
        # Mixed months, procedures and supplement rounds must reconcile to the same scoped total.
        fixtures=[
            ('a','root-a','demo-project','bcnckt','intake','2026-07-02',True),
            ('b','root-a','demo-project','bcnckt','request_supplement','2026-09-02',True),
            ('c','root-c','demo-project','gpxd','analyzed','2026-09-03',True),
            ('d','root-d','other-project','nghiem_thu','reviewed','2026-09-04',True),
            ('e','root-e',None,'gpxd','intake','2026-09-04',True),
            ('f','root-f','other-project','nghiem_thu','reviewed','2026-08-04',False),
        ]
        for id,root,project,procedure,status,created,sample in fixtures:
            case=new_case('Hồ sơ thử nghiệm','Điện Biên',DEMO_ACTOR,'2026-09-28',sample=sample)
            case.update(id=id,dossierId=root,projectId=project,projectName='Dự án khác',procedure=procedure,status=status,createdAt=created+'T09:00:00Z')
            with db() as con:con.execute('insert into cases values(?,?,?)',(id,1,json.dumps(case)))
        summary=catalog.dashboard(self.store,'sample')
        self.assertEqual(summary['cases']['total'],5)
        self.assertEqual(sum(row['total'] for row in summary['statuses']),5)
        self.assertEqual(sum(row['total'] for row in summary['months']),5)
        self.assertEqual(sum(row['total'] for row in summary['procedures']),5)
        self.assertEqual([row['id'] for row in summary['months']],['2026-07','2026-09'])
        self.assertEqual(summary['months'][1]['procedures'],{'bcnckt':1,'gpxd':2,'nghiem_thu':1})
        self.assertEqual(summary['top_projects'][0],{'id':'demo-project','name':'Dự án mẫu','total':3,'dossiers':2})
        self.assertEqual(len(summary['top_projects']),2)
        real=catalog.dashboard(self.store,'real')
        self.assertEqual(real['statuses'],[{'id':'reviewed','total':1}])
        self.assertEqual(real['months'],[{'id':'2026-08','total':1,'procedures':{'nghiem_thu':1}}])
        self.assertEqual(catalog.dashboard(self.store,'all')['cases']['total'],6)

    def test_gallery_original_persistence_revision_and_audit(self):
        image=BytesIO();Image.new('RGB',(10,10),'blue').save(image,format='PNG')
        original=image.getvalue()
        body=AddProjectImage(revision=1,title='Ảnh khảo sát',category='hien_trang',contentBase64=base64.b64encode(original).decode())
        saved=gallery.add(self.store,'demo-project',body)
        self.assertEqual(saved['revision'],2)
        reloaded=gallery.read(Store(actor=DEMO_ACTOR),'demo-project')
        self.assertEqual(saved,reloaded)
        self.assertEqual(gallery.content(self.store,'demo-project',saved['images'][0]['id']),original)
        events=self.store.project_audit('demo-project')
        self.assertEqual(events['total'],1)
        self.assertEqual(events['items'][0]['actor'],DEMO_ACTOR['name'])
        with self.assertRaises(HTTPException) as error:gallery.add(self.store,'demo-project',body)
        self.assertEqual(error.exception.status_code,409)

    def test_gallery_rejects_fake_images_urls_and_forbidden_role(self):
        for values in [{'contentBase64':base64.b64encode(b'\x89PNG\r\n\x1a\nfake').decode()},{'url':'javascript:alert(1)'},{'url':'http://example.com/image.jpg'}]:
            with self.assertRaises(HTTPException) as error:gallery.add(self.store,'demo-project',AddProjectImage(revision=1,title='Ảnh',category='hien_trang',**values))
            self.assertEqual(error.exception.status_code,422)
        with self.assertRaises(HTTPException) as error:
            gallery.add(Store(actor={**DEMO_ACTOR,'role':'director'}),'demo-project',AddProjectImage(revision=1,title='Ảnh',category='hien_trang',url='https://example.com/photo.png'))
        self.assertEqual(error.exception.status_code,403)


if __name__=='__main__':unittest.main()
