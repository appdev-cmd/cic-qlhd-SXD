import unittest
from app.evidence_selection import select


class EvidenceSelectionTests(unittest.TestCase):
    def test_final_section_is_included_under_budget(self):
        document={'id':'a','name':'Tài liệu dài','hash':'fixture','segments':[{'id':str(i),'text':'x'*1000,'locator':'Trang '+str(i+1)} for i in range(100)]}
        selected,coverage=select({'documents':[document]},{'documentIds':['a']},5000)
        self.assertIn('99',{s['id'] for s in selected})
        self.assertLessEqual(sum(len(s['text']) for s in selected),5000)
        self.assertEqual(coverage['totalSegments'],100)
        self.assertFalse(coverage['documents'][0]['complete'])

    def test_context_is_shared_between_documents(self):
        documents=[{'id':name,'name':name,'hash':'fixture','segments':[{'id':name+str(i),'text':'x'*1000,'locator':str(i)} for i in range(4)]} for name in ['a','b','c']]
        selected,coverage=select({'documents':documents},{'documentIds':['a','b','c']},6000)
        self.assertEqual({s['documentId'] for s in selected},{'a','b','c'})
        self.assertTrue(all(d['selectedSegments']==2 for d in coverage['documents']))

    def test_foreign_and_oversize_evidence_is_not_sent(self):
        documents=[{'id':name,'name':name,'segments':[{'id':name,'text':'x'*100,'locator':'Trang 1'}]} for name in ['a','b']]
        selected,coverage=select({'documents':documents},{'documentIds':['a']},50)
        self.assertEqual(selected,[]);self.assertEqual(coverage['totalSegments'],1)


if __name__=='__main__':unittest.main()
