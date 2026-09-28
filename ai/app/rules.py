"""Deterministic checks. Findings are proposals, never administrative approval."""
from decimal import Decimal
from .domain import COSTS, now, uid, latest_documents
from .legal import legal_overview, ref, ND206, LAW135

RULE_VERSION = 'bcnckt-1.1.0-nd217'

def analyze(case, mode='intake'):
    documents = latest_documents(case, mode)
    active_ids = {d['id'] for d in documents}
    facts = [f for f in case['facts'] if f['documentId'] in active_ids and f['reviewStatus'] != 'rejected']
    findings = []
    def add(code, category, title, result, explanation, evidence=(), missing=(), formula='', legal=()):
        refs = []
        for f in evidence:
            refs.append({k: f[k] for k in ['documentId', 'segmentId', 'locator', 'quote']})
        findings.append({'id': uid(), 'code': code, 'category': category, 'title': title,
                         'result': result, 'explanation': explanation, 'sources': refs,
                         'missingEvidence': list(missing), 'calculation': formula,
                         'legalRefs': list(legal), 'review': None,
                         'severity': 'warning' if result in ['inconsistent','insufficient_evidence'] else 'info'})
    def values(key, requirement=None):
        return [f for f in facts if f['key'] == key and (not requirement or any(d['id'] == f['documentId'] and d['requirementId'] == requirement for d in documents))]
    def numeric(key, requirement=None):
        vs = values(key, requirement)
        # Contradictory occurrences within the same scope cannot silently choose a winner.
        if not vs or len({f['value'] for f in vs}) != 1:
            return None
        try:
            return Decimal(vs[0]['value']), vs[0]
        except Exception:
            return None

    for req in case['requirements']:
        docs = [d for d in documents if d['requirementId'] == req['id'] and d['role'] != 'reference']
        readable = [d for d in docs if d['segments'] and not any('chưa đọc đủ' in w for w in d['warnings'])]
        if req['required'] and not readable:
            add('INPUT.'+req['id'], 'Hồ sơ đầu vào', req['name'], 'insufficient_evidence',
                'Chưa có tệp đọc được đầy đủ trong lần trình này. Việc dẫn tên tài liệu không thay thế tệp đầu vào.', missing=[req['name']])
        elif readable:
            source=readable[-1]
            add('INPUT.'+req['id'], 'Hồ sơ đầu vào', req['name'], 'consistent',
                'Đã có tệp đọc được. Chuyên viên cần kiểm tra nội dung và phụ lục; đây chưa phải xác nhận hợp lệ.',
                evidence=[{'documentId': source['id'], 'segmentId': source['segments'][0]['id'],
                           'locator': source['segments'][0]['locator'], 'quote': source['segments'][0]['text']}])

    for key in ['project_name','province','building_grade','mep_certificate','survey_certificate','standard_primary','standard_secondary']:
        vs = values(key)
        if len({f['value'].casefold() for f in vs}) > 1:
            add('CROSS.'+key, 'Nhất quán', vs[0]['label'] + ' khác nhau giữa tài liệu', 'inconsistent',
                'Cần xác minh bản gốc hoặc giải trình phiên bản; chưa xác định giá trị nào đúng.', vs)

    cost_docs = [d for d in case['documents'] if d['requirementId']=='KT05' and d['role']!='reference']
    cost_versions = []
    for d in cost_docs:
        fs = [f for f in case['facts'] if f['documentId']==d['id'] and f['reviewStatus']!='rejected']
        mapped = {}
        for key,_ in COSTS:
            matches = [f for f in fs if f['key']=='cost.'+key]
            if matches and len({f['value'] for f in matches}) == 1:
                mapped[key] = matches[0]
        totals = [f for f in fs if f['key']=='total']
        if len(mapped)==7 and totals and len({f['value'] for f in totals})==1:
            summed = sum(Decimal(f['value']) for f in mapped.values())
            declared = Decimal(totals[0]['value'])
            cost_versions.append({'documentId':d['id'], 'name':d['name'], 'version':d['version'],
                                  'total':str(declared), 'sum':str(summed),
                                  'items':[{ 'key':k,'name':label,'value':mapped[k]['value']} for k,label in COSTS]})
            if d['id'] in active_ids:
                add('COST.SUM', 'Chi phí', 'Tổng 7 khoản mục chi phí', 'consistent' if summed==declared else 'inconsistent',
                    'Kiểm tra số học trên giá trị được trích xuất. Chưa xác nhận khối lượng, đơn giá hoặc tính hợp pháp.',
                    [*mapped.values(),totals[0]], formula=f'{summed:,.0f} VNĐ so với tổng công bố {declared:,.0f} VNĐ')
    if not cost_versions:
        add('COST.MISSING','Chi phí','Chưa đủ bảng tổng mức đầu tư','insufficient_evidence',
            'Cần đủ 7 khoản mục, đơn vị tiền và tổng công bố trong cùng tài liệu.',missing=['Bảng tổng mức đầu tư đủ 7 khoản mục'])

    planning = [numeric(k, 'KT03') for k in ['land_area','footprint','floor_area','density','far']]
    if all(planning) and planning[0][0]>0:
        land, footprint, floor, density, far = [p[0] for p in planning]
        expected_d, expected_f = footprint/land*100, floor/land
        matches = abs(expected_d-density)<=Decimal('.05') and abs(expected_f-far)<=Decimal('.005')
        add('PLAN.MATH','Quy hoạch','Mật độ và hệ số sử dụng đất','consistent' if matches else 'inconsistent',
            'Kiểm tra số học và làm tròn; cần bản quy hoạch được chấp thuận để kết luận phù hợp.',
            [p[1] for p in planning], formula=f'{footprint}/{land} × 100 = {expected_d:.4f}%; {floor}/{land} = {expected_f:.5f}')
    total_floor = numeric('floor_area','KT03')
    floor_facts = [numeric('floor.'+k,'KT04') for k in ['A1','A2','A3','A4','A5','A6','B','C','D','G1','G2']]
    if total_floor and all(floor_facts):
        summed = sum(x[0] for x in floor_facts)
        diff = summed-total_floor[0]
        add('AREA.SUM','Thiết kế','Đối chiếu diện tích sàn các hạng mục','inconsistent' if diff else 'consistent',
            'Giả thiết cộng A1–A6, B, C, D, G1, G2; cần xác nhận phạm vi tính diện tích, bán hầm và hành lang.',
            [total_floor[1],*[x[1] for x in floor_facts]],formula=f'{summed} − {total_floor[0]} = {diff} m²')
    tank = [numeric(k,'KT04') for k in ['tank_capacity','tank_length','tank_width','tank_height']]
    if all(tank):
        capacity,l,w,h = [x[0] for x in tank]
        add('FIRE.TANK','PCCC và môi trường','Dung tích bể và kích thước ngoài','requires_specialist',
            'Kích thước ngoài không phải dung tích hữu ích. Cần mặt cắt, ngăn bể, mực nước và tính toán chữa cháy.',
            [x[1] for x in tank],['Bản vẽ chi tiết bể và tính toán lưu lượng'],f'{l} × {w} × {h} = {l*w*h} m³; dung tích hữu ích ghi {capacity} m³')

    specialized = [
        ('LEGAL','Pháp lý và năng lực','Lập dự án, chủ trương và năng lực','Bản pháp lý chính thức, phạm vi chứng chỉ, quy định chuyển tiếp'),
        ('PLANNING','Quy hoạch','TKCS với quy hoạch được chấp thuận','Bản đồ/phụ lục chỉ tiêu được cơ quan có thẩm quyền xác nhận'),
        ('STRUCT','Khảo sát và kết cấu','An toàn nền móng và kết cấu','Báo cáo khảo sát, bảng tính thiết kế và thẩm tra chuyên ngành'),
        ('INFRA','Hạ tầng','Khả năng đấu nối điện, nước, giao thông','Thỏa thuận đấu nối, nhu cầu và công suất được xác nhận'),
        ('FIRE','PCCC và môi trường','An toàn cháy và môi trường','Hồ sơ PCCC/môi trường, các tính toán và ý kiến chuyên ngành'),
        ('STANDARD','Quy chuẩn','Danh mục và điều kiện áp dụng tiêu chuẩn','Danh mục chính thức, toàn văn điều khoản, thời điểm và ngoại lệ'),
        ('COST','Chi phí','Khối lượng, giá và cơ sở tổng mức đầu tư','Bảng khối lượng, nguồn giá địa phương đúng kỳ, cơ sở GPMB và dự phòng'),
    ]
    for code,cat,title,need in specialized:
        add('SCOPE.'+code,cat,title,'requires_specialist',
            'Cần chuyên viên đánh giá căn cứ và phạm vi; kiểm tra tự động chưa thay thế thẩm định nội dung này.',missing=[need])
    overview=legal_overview(case)
    profile=overview['profile']
    add('LAW.TIME','Pháp lý và năng lực','Chế độ pháp lý và phạm vi thẩm định','requires_specialist',
        profile['label']+'. '+profile['reason']+' Phạm vi: '+profile['scopeLabel']+
        ('. Chuyên viên đã xác nhận lựa chọn.' if profile['confirmed'] else '. Chưa có xác nhận của chuyên viên.'),legal=profile['refs'])
    for item in overview['checklist']:
        if item['state'] in ['missing','unknown']:
            add('LAW.INPUT.'+item['id'],'Thành phần theo pháp luật',item['name'],'insufficient_evidence',
                ('Chưa xác định có thuộc trường hợp áp dụng. ' if item['state']=='unknown' else 'Chưa liên kết tệp chứng cứ. ')+item['condition'],
                missing=[item['name']],legal=[item['legalRef']])
    if profile['code']=='nd217':
        add('LAW.SCOPE','Phạm vi thẩm định','Phân biệt nhiệm vụ cơ quan chuyên môn và người quyết định đầu tư','requires_specialist',
            ' '.join(overview['scopeNotes']),legal=[ref('Điều 26–27 Luật 135/2025',LAW135),ref('Điều 38 NĐ 217/2026'),ref('Điều 7 NĐ 206/2026',ND206)])
        add('LAW.AUTHORITY','Pháp lý và năng lực','Xác định đúng cơ quan có thẩm quyền','requires_specialist',
            'Cần loại, nhóm, cấp công trình chính, người quyết định đầu tư, địa bàn, phân cấp và lịch sử thẩm định; không suy ra chỉ từ tên tỉnh.',
            missing=['Căn cứ xác định thẩm quyền cụ thể'],legal=[ref('Điều 32–33; khoản 7–9 Điều 76 NĐ 217/2026')])

    unreviewed = len([f for f in facts if f['reviewStatus']!='confirmed'])
    if unreviewed:
        add('DATA.REVIEW','Dữ liệu','Dữ liệu cần chuyên viên xác nhận','insufficient_evidence',
            f'Còn {unreviewed} trường dữ liệu chưa xác nhận. Các phép kiểm tra hiện là kết quả sơ bộ.',missing=['Xác nhận các trường dữ liệu quan trọng'])
    delta = None
    if len(cost_versions)>1:
        before,after = cost_versions[0],cost_versions[-1]
        delta = {'before':before['total'],'after':after['total'],
                 'netSavings':str(Decimal(before['total'])-Decimal(after['total'])),
                 'items':[{ 'name':a['name'],'before':b['value'],'after':a['value'],
                            'difference':str(Decimal(a['value'])-Decimal(b['value']))}
                           for b,a in zip(before['items'],after['items'])]}
    return {'id':uid(),'createdAt':now(),'ruleVersion':RULE_VERSION,'mode':mode,
            'documentIds':list(active_ids),'stale':False,'findings':findings,
            'costVersions':cost_versions,'costComparison':delta,'provider':'deterministic',
            'aiStatus':'Chưa gọi mô hình AI; kết quả kiểm tra bằng quy tắc.',
            'legalDate':case['legalDate'],'legalOverview':overview,'revision':case['revision'],'aiNotes':[]}
