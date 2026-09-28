import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4
from fastapi import HTTPException
from app import legal_assistant


class LegalAssistantGuards(unittest.TestCase):
    def setUp(self):
        self.store=SimpleNamespace(actor={'id':str(uuid4())})
        self.source={'id':'source:1','text':'Nội dung dẫn chứng có trong tài liệu thử nghiệm.'}

    def ask(self, response):
        with patch.object(legal_assistant,'retrieve',return_value=([self.source],[])), \
             patch.object(legal_assistant,'MODE','demo'), \
             patch.object(legal_assistant.vertex,'configuration',return_value={'model':'fixture'}), \
             patch.object(legal_assistant.vertex,'generate',return_value=response):
            return legal_assistant.ask(self.store,'Câu hỏi thử nghiệm có dẫn chứng',True)

    def test_fabricated_missing_and_inexact_quotes_are_discarded(self):
        for citation in [{'id':'invented','quote':self.source['text']},
                         {'id':'source:1','quote':'Dẫn chứng tự tạo không có trong tài liệu'},
                         {'id':'source:1','quote':'Nội dung'}]:
            result=self.ask(json.dumps({'paragraphs':[{'text':'Kết luận không có căn cứ','citations':[citation]}]}))
            self.assertEqual(result['paragraphs'],[])
            self.assertEqual(result['status'],'insufficient_sources')

    def test_malformed_model_output_never_becomes_an_answer(self):
        for raw in ['not JSON','[]','{"paragraphs":null}']:
            result=self.ask(raw)
            self.assertEqual(result['status'],'model_unavailable'); self.assertFalse(result['paragraphs'])

    def test_empty_corpus_skips_provider(self):
        with patch.object(legal_assistant,'retrieve',return_value=([],[])), patch.object(legal_assistant.vertex,'generate') as provider:
            self.assertEqual(legal_assistant.ask(self.store,'Không có nguồn',True)['status'],'insufficient_sources')
            provider.assert_not_called()

    def test_accepted_quote_remains_unverified_and_rate_limited(self):
        raw=json.dumps({'paragraphs':[{'text':'Diễn giải cần rà soát','citations':[{'id':'source:1','quote':self.source['text']}]}]})
        for _ in range(5): self.assertEqual(self.ask(raw)['status'],'unverified_ai')
        with self.assertRaises(HTTPException) as error: self.ask(raw)
        self.assertEqual(error.exception.status_code,429)
