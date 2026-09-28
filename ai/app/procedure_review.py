"""Evidence-backed permit and completion review for the post-July-2026 regime."""
from datetime import date
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field
from fastapi import HTTPException
from .domain import now
from copy import deepcopy
from .procedure_rules import VERSION, permit_checks, inspection_checks, template_info

PERMITS={'new':('Xây dựng mới',57),'stage':('Theo giai đoạn',58),'group':('Nhóm công trình',59),
 'house':('Nhà ở riêng lẻ',60),'repair':('Sửa chữa, cải tạo',61),'relocation':('Di dời',61),
 'temporary':('Có thời hạn',62),'amendment':('Điều chỉnh',63),'extension':('Gia hạn',63),'reissue':('Cấp lại',64)}
DETAILS={'ownerIdentity':'Số định danh / mã số doanh nghiệp','ownerAddress':'Địa chỉ chủ đầu tư',
 'buildingId':'Mã định danh công trình','buildingClass':'Loại và cấp công trình','designer':'Tổ chức tư vấn thiết kế',
 'designLead':'Chủ nhiệm, chủ trì thiết kế','verifier':'Đơn vị và chủ trì thẩm tra',
 'land':'Giấy tờ đất đai, lô đất, thửa đất','elevation':'Cốt xây dựng (m)','setback':'Khoảng lùi (m)',
 'density':'Mật độ xây dựng (%)','landRatio':'Hệ số sử dụng đất','boundaries':'Chỉ giới đường đỏ và chỉ giới xây dựng',
 'area':'Diện tích xây dựng tầng 1 (m²)','floorArea':'Tổng diện tích sàn (m²)','height':'Chiều cao công trình (m)',
 'depth':'Chiều sâu công trình (m)','floors':'Số tầng, tầng hầm, tầng lửng','color':'Màu sắc công trình',
 'schedule':'Thời gian hoàn thành dự kiến (tháng)','route':'Tuyến, hướng tuyến, chiều dài, quy mô theo đoạn',
 'stages':'Nội dung và phạm vi các giai đoạn / công trình trong nhóm','existing':'Hiện trạng trước sửa chữa / di dời',
 'temporaryTerm':'Thời hạn tồn tại được xác định theo quy định địa phương','adjustment':'Nội dung điều chỉnh / gia hạn',
 'completionReport':'Số, ngày báo cáo hoàn thành thi công','acceptanceRecord':'Số, ngày biên bản nghiệm thu của chủ đầu tư',
 'correctionReport':'Báo cáo khắc phục tồn tại (nếu có)',
 'projectNationalId':'Mã định danh dự án trên cơ sở dữ liệu quốc gia',
 'authorityBasis':'Số, ngày và điều khoản văn bản xác định thẩm quyền',
 'specializedBasis':'Số, ngày các văn bản PCCC, môi trường, chuyên ngành áp dụng',
 'originLocation':'Địa điểm công trình trước di dời','relocationSchedule':'Ngày bắt đầu, kết thúc di dời dự kiến',
 'groupCount':'Số công trình trong nhóm; công trình đã khởi công',
 'contractors':'Nhà thầu khảo sát, thiết kế, thi công, giám sát',
 'constructionPeriod':'Ngày khởi công và ngày hoàn thành',
 'completedQuantities':'Khối lượng đã thực hiện theo thiết kế',
 'qualityAssessment':'Đánh giá chất lượng so với thiết kế được phê duyệt',
 'contact':'Người liên hệ và số điện thoại','representative':'Người đại diện, chức vụ, số định danh',
 'remainingSafety':'Biện pháp bảo đảm an toàn khi tiếp tục thi công phần còn lại'}

class Payload(BaseModel):
    model_config=ConfigDict(extra='forbid')
class Check(Payload):
    id:str=Field(max_length=50)
    status:Literal['pending','satisfied','missing','not_applicable']='pending'
    documentIds:list[str]=Field(default_factory=list,max_length=50)
    note:str=Field(default='',max_length=3000)
class Defect(Payload):
    description:str=Field(min_length=3,max_length=1500)
    responsible:str=Field(min_length=2,max_length=200)
    dueDate:date|None=None
    status:Literal['open','resolved']='open'
    documentIds:list[str]=Field(default_factory=list,max_length=30)
    resolution:str=Field(default='',max_length=2000)
    nonSafetyConfirmed:bool=False
class Review(Payload):
    revision:int=Field(ge=1)
    subtype:str=Field(max_length=30)
    ruleVersion:str=Field(default=VERSION,max_length=30)
    originalForm:Literal['','03','04','05']=''
    extensionCount:int|None=Field(default=None,ge=1,le=2)
    checks:list[Check]=Field(max_length=30)
    defects:list[Defect]=Field(default_factory=list,max_length=100)
    authority:str=Field(default='',max_length=300)
    investor:str=Field(default='',max_length=300)
    location:str=Field(default='',max_length=500)
    scope:str=Field(default='',max_length=3000)
    parameters:str=Field(default='',max_length=3000)
    priorPermit:str=Field(default='',max_length=300)
    designBasis:str=Field(default='',max_length=3000)
    conclusion:Literal['pending','supplement','eligible','ineligible']='pending'
    conditions:str=Field(default='',max_length=4000)
    visitDate:date|None=None
    participants:str=Field(default='',max_length=2000)
    observations:str=Field(default='',max_length=4000)
    details:dict[str,str]=Field(default_factory=dict,max_length=60)

def specification(case,subtype=None):
    procedure=case.get('procedure')
    if procedure not in ('gpxd','nghiem_thu'):raise HTTPException(422,'Phiếu này dành cho GPXD và kiểm tra nghiệm thu.')
    if case['legalDate']<'2026-07-01':raise HTTPException(422,'Bộ phiếu này áp dụng từ 01/07/2026; cần xác định chế độ chuyển tiếp riêng cho hồ sơ cũ.')
    if procedure=='gpxd':
        subtype=subtype or (case.get('procedureReview') or {}).get('subtype','new')
        if subtype not in PERMITS:raise HTTPException(422,'Chọn loại thủ tục GPXD hợp lệ.')
        article=PERMITS[subtype][1];rows=permit_checks(subtype)
        citation=f'Điều 55–56 và Điều {article} Nghị định 217/2026/NĐ-CP; cần đối chiếu quy định thẩm quyền tại địa phương.'
    else:
        subtype=subtype or (case.get('procedureReview') or {}).get('subtype','complete')
        if subtype not in ('complete','conditional','partial'):raise HTTPException(422,'Chọn loại nghiệm thu hợp lệ.')
        rows=inspection_checks(subtype);citation='Điều 24–30, Phụ lục VI, VII, VIII, X NĐ 207/2026/NĐ-CP; Điều 2–5 TT 32/2026/TT-BXD theo đối tượng.'
    return {'subtype':subtype,'citation':citation,'ruleVersion':VERSION,
        'reviewOutdated':bool(case.get('procedureReview') and case['procedureReview'].get('ruleVersion')!=VERSION),
        'template':template_info(procedure,subtype),'detailFields':[{'id':k,'label':v} for k,v in DETAILS.items() if (procedure=='gpxd' and k not in ('completionReport','acceptanceRecord','correctionReport','contractors','constructionPeriod','completedQuantities','qualityAssessment','remainingSafety')) or (procedure=='nghiem_thu' and k in ('projectNationalId','buildingId','buildingClass','authorityBasis','specializedBasis','completionReport','acceptanceRecord','correctionReport','contractors','constructionPeriod','completedQuantities','qualityAssessment','remainingSafety'))],'types':[{'value':k,'label':v[0]} for k,v in PERMITS.items()] if procedure=='gpxd' else
        [{'value':'complete','label':'Hoàn thành'},{'value':'conditional','label':'Có điều kiện'},{'value':'partial','label':'Một phần'}],
        'checks':rows}

def apply(case,actor,body):
    if set(body.details)-DETAILS.keys() or any(len(v)>2000 for v in body.details.values()):raise HTTPException(422,'Thông tin dự thảo vượt giới hạn hoặc có trường không hợp lệ.')
    if body.ruleVersion!=VERSION:raise HTTPException(409,'Checklist đã thay đổi; mở lại phiếu và rà soát phiên bản mới.')
    spec=specification(case,body.subtype);expected={r['id']:r for r in spec['checks']}
    if len(body.checks)!=len(expected) or {c.id for c in body.checks}!=set(expected):raise HTTPException(422,'Checklist chưa đầy đủ theo loại thủ tục đã chọn.')
    documents={d['id']:d for d in case['documents'] if d['role']=='submission'}
    for check in body.checks:
        if not set(check.documentIds)<=documents.keys():raise HTTPException(422,'Dẫn chứng phải là tài liệu nộp trong hồ sơ này.')
        if check.status!='pending' and len(check.note.strip())<10:raise HTTPException(422,'Mỗi kết luận cần giải thích ít nhất 10 ký tự.')
        if check.status=='satisfied' and not check.documentIds:raise HTTPException(422,'Kết luận đã đáp ứng cần tài liệu dẫn chứng.')
        if check.status=='not_applicable' and not expected[check.id]['conditional']:raise HTTPException(422,'Nội dung bắt buộc không được đánh dấu không áp dụng.')
    for defect in body.defects:
        if not set(defect.documentIds)<=documents.keys():raise HTTPException(422,'Tài liệu khắc phục phải thuộc hồ sơ này.')
        if defect.status=='resolved' and (not defect.documentIds or len(defect.resolution.strip())<10):raise HTTPException(422,'Xác nhận khắc phục cần tài liệu và giải trình.')
    value=body.model_dump(mode='json',exclude={'revision'})
    if body.conclusion=='eligible':validate(value)
    value.update(reviewedBy=actor['name'],reviewedAt=now(),citation=spec['citation'],
        evidenceHashes={id:d['hash'] for id,d in documents.items()})
    if case.get('procedureReview'):
        case.setdefault('procedureReviewHistory',[]).append(deepcopy(case['procedureReview']))
    case['procedureReview']=value;case['finalReview']=None

def validate(review):
    if review and review.get('ruleVersion')!=VERSION:raise HTTPException(422,'Phiếu dùng checklist cũ; cập nhật theo phiên bản pháp lý hiện hành trước khi trình.')
    if not review or review.get('conclusion')=='pending':raise HTTPException(422,'Cần hoàn thành phiếu rà soát chuyên môn trước khi trình lãnh đạo.')
    if not review.get('authority','').strip() or not review.get('scope','').strip():raise HTTPException(422,'Cần xác định cơ quan có thẩm quyền và phạm vi xử lý.')
    if any(c['status']=='pending' for c in review['checks']):raise HTTPException(422,'Còn nội dung chưa được rà soát.')
    if review['conclusion']=='eligible':
        if any(c['status']=='missing' for c in review['checks']):raise HTTPException(422,'Còn nội dung thiếu; chưa được đề xuất đủ điều kiện.')
        for defect in review['defects']:
            if defect['status']=='open' and not (review['subtype']=='conditional' and defect.get('nonSafetyConfirmed')
                and defect.get('dueDate') and defect.get('documentIds') and len(defect.get('resolution','').strip())>=10
                and len(review.get('conditions','').strip())>=10):
                raise HTTPException(422,'Tồn tại chưa khắc phục chỉ được xét nghiệm thu có điều kiện khi xác nhận không ảnh hưởng chịu lực, thời hạn sử dụng, công năng; có dẫn chứng, hạn hoàn thành và điều kiện sử dụng.')
        if not review.get('details',{}).get('authorityBasis','').strip():raise HTTPException(422,'Cần căn cứ xác định thẩm quyền cụ thể; hệ thống không tự suy đoán phân cấp địa phương.')
        if review['subtype'] in ('amendment','extension') and (not review.get('originalForm') or not review.get('priorPermit','').strip()):raise HTTPException(422,'Cần giấy phép đã cấp và mẫu giấy phép gốc để lập nội dung điều chỉnh/gia hạn.')
        if review['subtype']=='extension' and review.get('extensionCount') not in (1,2):raise HTTPException(422,'Xác định lần gia hạn 1 hoặc 2; mỗi lần 12 tháng.')
        if review['subtype']=='temporary' and not review.get('details',{}).get('temporaryTerm','').strip():raise HTTPException(422,'Cần thời hạn tồn tại được xác định theo quy định địa phương.')
        if review['subtype']=='partial' and not review.get('details',{}).get('remainingSafety','').strip():raise HTTPException(422,'Cần xác định an toàn khi tiếp tục thi công phần còn lại.')
        if not review.get('investor','').strip() or not review.get('location','').strip():raise HTTPException(422,'Cần thông tin chủ đầu tư và địa điểm trước khi đề xuất đủ điều kiện.')

def export_blocks(case,kind):
    review=case.get('procedureReview')
    if not review:raise HTTPException(422,'Lưu phiếu rà soát trước khi xuất dự thảo.')
    if review.get('ruleVersion')!=VERSION:raise HTTPException(409,'Cập nhật phiếu theo checklist mới trước khi xuất.')
    spec=specification(case,review['subtype']);labels={x['id']:x['label']+'\n'+x['citation'] for x in spec['checks']}
    if kind in ('draft','application'):return draft_blocks(case,review,spec,kind)
    docs={d['id']:d['name'] for d in case['documents']}
    status={'pending':'Chưa đánh giá','satisfied':'Đã đối chiếu, đáp ứng','missing':'Thiếu / chưa đáp ứng','not_applicable':'Không áp dụng'}
    title='PHIẾU RÀ SOÁT HỒ SƠ CẤP GIẤY PHÉP XÂY DỰNG' if case['procedure']=='gpxd' else 'PHIẾU KIỂM TRA CÔNG TÁC NGHIỆM THU'
    if kind=='minutes':title='BIÊN BẢN GHI NHẬN KIỂM TRA HIỆN TRƯỜNG'
    blocks=[{'heading':'Phạm vi dự thảo','text':['Chưa ký, chưa cấp số; sử dụng để rà soát nội bộ. Không thay thế văn bản ban hành.',spec['citation']]},
      {'heading':'Thông tin công trình','text':['Cơ quan: '+review['authority'],'Dự án: '+str(case.get('projectName') or case['name']),
       'Chủ đầu tư: '+review['investor'],'Địa điểm: '+review['location'],'Phạm vi: '+review['scope'],'Thông số: '+review['parameters'],
       'Thiết kế / căn cứ: '+review['designBasis'],'Giấy phép đã cấp: '+review['priorPermit']]},
      {'heading':'Nội dung đối chiếu','rows':[['Nội dung','Đánh giá','Giải thích và tài liệu']]+[[labels[c['id']],status[c['status']],c['note']+'\n'+', '.join(docs[id] for id in c['documentIds'])] for c in review['checks']]},
      {'heading':'Kiểm tra hiện trường','text':['Ngày: '+(date.fromisoformat(review['visitDate']).strftime('%d/%m/%Y') if review.get('visitDate') else 'Chưa xác định'),'Thành phần: '+review['participants'],review['observations']]},
      {'heading':'Tồn tại và khắc phục','rows':[['Nội dung','Phụ trách / hạn','Tình trạng']]+[[d['description'],d['responsible']+' / '+(date.fromisoformat(d['dueDate']).strftime('%d/%m/%Y') if d.get('dueDate') else 'Chưa xác định'),('Đã xác nhận khắc phục' if d['status']=='resolved' else 'Chưa khắc phục')+'\n'+d['resolution']] for d in review['defects']]},
      {'heading':'Đề xuất của người rà soát','text':[{'pending':'Chưa kết luận','supplement':'Đề nghị bổ sung','eligible':'Đề xuất đủ điều kiện trong phạm vi đã đối chiếu','ineligible':'Đề xuất chưa đủ điều kiện'}[review['conclusion']],review['conditions'],'Người rà soát: '+review['reviewedBy']]}]
    if kind=='minutes':
        blocks=[blocks[0],blocks[1],blocks[3],blocks[4],blocks[5],
            {'keepTogether':True,'heading':'Xác nhận của các bên tham gia',
             'text':['[Đại diện cơ quan kiểm tra, chủ đầu tư và các bên tham gia ký, ghi rõ họ tên, chức vụ — chưa ký].',
                     'Đây là biên bản ghi nhận kiểm tra hiện trường; biên bản nghiệm thu của chủ đầu tư được lập riêng theo khoản 5, 6 Điều 24 NĐ 207/2026.']}]
    elif case['procedure']=='gpxd' and not review.get('defects') and not review.get('visitDate'):
        blocks=[blocks[0],blocks[1],blocks[2],blocks[5]]
    return title,blocks

def draft_blocks(case,r,spec,kind='draft'):
    from .procedure_templates import draft_blocks as render
    return render(case,r,spec,kind)
