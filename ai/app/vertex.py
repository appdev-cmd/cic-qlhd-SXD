"""Server-side Vertex REST adapter using Google service-account credentials."""

import os
import re
import threading
from pathlib import Path

import httpx

_credentials = None
_credential_path = None
_lock = threading.Lock()


class VertexError(ValueError):
    pass


def configuration():
    return {
        'project': os.getenv('VERTEX_PROJECT_ID', ''),
        'location': os.getenv('VERTEX_LOCATION', 'global'),
        'model': os.getenv('VERTEX_MODEL', 'gemini-3.8-flash'),
        'credentials': os.getenv('VERTEX_SA_KEY_PATH') or os.getenv('GOOGLE_APPLICATION_CREDENTIALS', ''),
    }


def configured():
    config = configuration()
    return bool(
        re.fullmatch(r'[a-z0-9][a-z0-9-]{3,62}', config['project'])
        and re.fullmatch(r'[a-z0-9-]+', config['location'])
        and re.fullmatch(r'[a-zA-Z0-9._-]+', config['model'])
        and config['credentials']
        and Path(config['credentials']).is_file()
    )


def access_token():
    global _credentials, _credential_path
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request

    config = configuration()
    if not configured():
        raise VertexError('Thiếu cấu hình project, khu vực, mô hình hoặc tệp xác thực Vertex AI.')
    with _lock:
        try:
            if _credentials is None or _credential_path != config['credentials']:
                _credentials = service_account.Credentials.from_service_account_file(
                    config['credentials'], scopes=['https://www.googleapis.com/auth/cloud-platform']
                )
                _credential_path = config['credentials']
            if not _credentials.valid:
                _credentials.refresh(Request())
            return _credentials.token
        except Exception:
            raise VertexError(
                'Không xác thực được tài khoản dịch vụ Google Cloud. Kiểm tra khóa và kết nối mạng.'
            ) from None


def generate(prompt, content, schema, max_tokens=8192, thinking_level='MEDIUM'):
    config = configuration()
    token = access_token()
    host = (
        'aiplatform.googleapis.com'
        if config['location'] == 'global'
        else config['location'] + '-aiplatform.googleapis.com'
    )
    url = (
        f"https://{host}/v1/projects/{config['project']}/locations/{config['location']}"
        f"/publishers/google/models/{config['model']}:generateContent"
    )
    generation = {'maxOutputTokens': max_tokens, 'responseMimeType': 'application/json', 'responseSchema': schema}
    if config['model'] == 'gemini-3.8-flash':
        generation['thinkingConfig'] = {'thinkingLevel': thinking_level}
    else:
        generation['temperature'] = 0.1
    if config['model'] == 'gemini-2.5-flash':
        generation['thinkingConfig'] = {'thinkingBudget': 0}
    try:
        response = httpx.post(
            url,
            headers={'Authorization': 'Bearer ' + token},
            json={
                'systemInstruction': {'parts': [{'text': prompt}]},
                'contents': [{'role': 'user', 'parts': [{'text': content}]}],
                'generationConfig': generation,
            },
            timeout=httpx.Timeout(90, connect=15),
        )
    except httpx.TimeoutException:
        raise VertexError('Vertex AI phản hồi quá thời gian. Có thể chạy lại.') from None
    except httpx.RequestError:
        raise VertexError('Không kết nối được máy chủ Vertex AI.') from None
    if not response.is_success:
        errors = {
            400: 'Vertex AI không chấp nhận cấu hình yêu cầu hoặc mô hình.',
            401: 'Xác thực Vertex AI hết hiệu lực hoặc không hợp lệ.',
            403: 'Tài khoản chưa có quyền Vertex AI hoặc project chưa bật API/thanh toán.',
            404: 'Mô hình Vertex AI không khả dụng tại project/khu vực đã chọn.',
            429: 'Vertex AI đang giới hạn hạn mức hoặc tải xử lý.',
            503: 'Vertex AI tạm thời chưa sẵn sàng.',
        }
        raise VertexError(
            errors.get(response.status_code, 'Lỗi dịch vụ Vertex AI.') + f' (HTTP {response.status_code})'
        )
    payload = response.json()
    candidates = payload.get('candidates', [])
    if not candidates or candidates[0].get('finishReason') != 'STOP':
        raise VertexError('Vertex AI chưa trả kết quả hoàn chỉnh hoặc đã chặn nội dung; chưa ghi nhận nhận xét AI.')
    text = ''.join(p.get('text', '') for p in candidates[0].get('content', {}).get('parts', []) if not p.get('thought'))
    return text
