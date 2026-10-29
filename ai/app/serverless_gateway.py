"""Same-origin Vercel gateway for the existing JWT/RLS-scoped worker API."""

import json


class ServerlessGateway:
    def __init__(self, app, secret, origins):
        self.app = app
        self.secret = secret.encode()
        self.origins = {origin.rstrip('/') for origin in origins if origin}

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        origin = headers.get(b'origin', b'').decode('latin-1')
        path = scope.get('path', '')
        prefix = '/api/appraisal'
        status, message = None, ''
        if not path.startswith(prefix + '/'):
            status, message = 404, 'Không tìm thấy API.'
        elif path[len(prefix) :].startswith(('/test-login', '/docs', '/openapi.json', '/samples')):
            status, message = 404, 'Endpoint không được công bố trong môi trường triển khai.'
        elif origin and origin.rstrip('/') not in self.origins:
            status, message = 403, 'Nguồn yêu cầu không được phép.'
        elif scope['method'] not in ('GET', 'HEAD', 'POST', 'PATCH', 'DELETE'):
            status, message = 405, 'Phương thức không được hỗ trợ.'
        if status:
            body = json.dumps({'detail': message}, ensure_ascii=False).encode()
            await send(
                {
                    'type': 'http.response.start',
                    'status': status,
                    'headers': [(b'content-type', b'application/json; charset=utf-8'), (b'cache-control', b'no-store')],
                }
            )
            return await send({'type': 'http.response.body', 'body': body})
        forwarded = dict(scope)
        forwarded['path'] = '/v1' + path[len(prefix) :]
        forwarded['raw_path'] = forwarded['path'].encode()
        # A caller cannot assert the loopback-only headers or choose a different internal identity.
        forwarded['headers'] = [
            (key, value)
            for key, value in scope.get('headers', [])
            if key.lower() not in (b'x-internal-token', b'x-local-test-login')
        ]
        forwarded['headers'].append((b'x-internal-token', self.secret))

        async def no_store(message):
            if message['type'] == 'http.response.start':
                message = {
                    **message,
                    'headers': [
                        (key, value) for key, value in message.get('headers', []) if key.lower() != b'cache-control'
                    ]
                    + [(b'cache-control', b'no-store'), (b'x-content-type-options', b'nosniff')],
                }
            await send(message)

        await self.app(forwarded, receive, no_store)
