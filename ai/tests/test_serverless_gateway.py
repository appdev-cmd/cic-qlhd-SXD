"""Verify public routing cannot assert the worker's loopback-only privileges."""

import unittest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from app.serverless_gateway import ServerlessGateway


class ServerlessGatewayTests(unittest.TestCase):
    def setUp(self):
        worker = FastAPI()

        @worker.api_route('/v1/{path:path}', methods=['GET', 'POST', 'PATCH', 'DELETE'])
        async def echo(path: str, request: Request):
            return {
                'path': path,
                'query': str(request.url.query),
                'authorization': request.headers.get('authorization'),
                'internal': request.headers.get('x-internal-token'),
                'local': request.headers.get('x-local-test-login'),
                'body': (await request.body()).decode(),
            }

        worker.add_middleware(ServerlessGateway, secret='server-only-token', origins=['https://example.vercel.app'])
        self.client = TestClient(worker)

    def test_forward_preserves_identity_body_and_query_but_replaces_internal_headers(self):
        response = self.client.post(
            '/api/appraisal/bim/assistant?scope=mine',
            json={'question': 'mô hình'},
            headers={
                'Authorization': 'Bearer caller-session',
                'Origin': 'https://example.vercel.app',
                'x-internal-token': 'attacker',
                'x-local-test-login': 'true',
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['path'], 'bim/assistant')
        self.assertEqual(body['query'], 'scope=mine')
        self.assertEqual(body['authorization'], 'Bearer caller-session')
        self.assertEqual(body['internal'], 'server-only-token')
        self.assertIsNone(body['local'])
        self.assertIn('question', body['body'])
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_rejects_foreign_origin_and_unsupported_methods(self):
        self.assertEqual(
            self.client.post('/api/appraisal/projects', headers={'Origin': 'https://foreign.example'}).status_code, 403
        )
        self.assertEqual(self.client.put('/api/appraisal/projects').status_code, 405)

    def test_test_login_raw_worker_and_docs_are_not_public(self):
        for path in [
            '/api/appraisal/test-login',
            '/api/appraisal/test-login/accounts',
            '/api/appraisal/docs',
            '/api/appraisal/openapi.json',
            '/v1/health',
            '/api/index.py',
        ]:
            with self.subTest(path=path):
                response = self.client.get(
                    path, headers={'x-local-test-login': 'true', 'x-internal-token': 'server-only-token'}
                )
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_missing_authorization_is_never_replaced_with_a_privileged_identity(self):
        response = self.client.get('/api/appraisal/runtime')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['authorization'])


if __name__ == '__main__':
    unittest.main()
