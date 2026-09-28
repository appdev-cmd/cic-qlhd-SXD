"""Bounded live Vertex smoke evaluation; citation checks are not legal sign-off."""
import json
from pathlib import Path
import httpx


def main():
    base='http://127.0.0.1:3001/api/appraisal'
    client=httpx.Client(timeout=115)
    assert client.get(base+'/runtime').json()['environment']=='staging'
    login=client.post(base+'/test-login',json={'role':'head_of_department'}); login.raise_for_status()
    headers={'Authorization':'Bearer '+login.json()['access_token']}
    cases=[
        ('GPXD sửa chữa','Hồ sơ đề nghị cấp giấy phép sửa chữa, cải tạo gồm những gì theo Điều 61 Nghị định 217/2026/NĐ-CP?', 'Điều 61.'),
        ('Nghiệm thu','Nội dung, trình tự kiểm tra công tác nghiệm thu theo Điều 27 Nghị định 207/2026/NĐ-CP thực hiện thế nào?', 'Điều 27.'),
        ('Thiếu dữ liệu hồ sơ','Tôi chưa nộp hồ sơ công trình. Chỉ dựa vào Nghị định 217/2026/NĐ-CP, bạn có thể xác nhận dự án của tôi đủ điều kiện cấp giấy phép xây dựng không?', None),
    ]
    results=[]
    for label,question,heading in cases:
        response=client.post(base+'/legal-assistant',headers=headers,json={'question':question,'useModel':True})
        assert response.status_code==200, f'AI request failed: {response.status_code}'
        answer=response.json(); sources={s['id']:s for s in answer['sources']}
        valid=all(p['citations'] and all(c['id'] in sources and c['quote'] in sources[c['id']]['text'] for c in p['citations']) for p in answer['paragraphs'])
        assert valid and answer['status'] in ('unverified_ai','insufficient_sources')
        if heading: assert answer['paragraphs'] and any(heading in s['heading'] for s in sources.values())
        results.append({'case':label,'question':question,'sourceQuoteCheck':valid,'answer':answer})
        print(json.dumps({'case':label,'status':answer['status'],'paragraphs':len(answer['paragraphs']),
            'model':answer['model'],'milliseconds':answer['elapsedMs'],'sourceQuoteCheck':valid},ensure_ascii=False),flush=True)
    output=Path(__file__).resolve().parents[1]/'output/appraisal/live-legal-ai-evaluation.json'
    output.write_text(json.dumps({'notice':'Kiểm tra kết nối, cấu trúc, truy hồi và trích dẫn nguyên văn; nội dung diễn giải cần chuyên viên duyệt.', 'items':results},ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__': main()
