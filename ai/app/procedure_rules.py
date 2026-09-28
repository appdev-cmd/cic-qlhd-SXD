"""Versioned documentary rules, cross-checked against the official July 2026 texts."""
VERSION = '2026-07.v2'
ND217 = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/217-ndcp.signed.pdf'
PL217 = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/pl217.pdf'
ND207 = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/207-ndcp.signed.pdf'
TT32 = 'https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/6/32-bxd.pdf'


def check(id, label, citation, conditional=False, condition='', url=ND217):
    return dict(id=id, label=label, citation=citation, conditional=conditional, condition=condition, url=url)


def permit_checks(subtype):
    article = {'new':57,'stage':58,'group':59,'house':60,'repair':61,'relocation':61,
               'temporary':62,'amendment':63,'extension':63,'reissue':64}[subtype]
    form = '02' if subtype in ('amendment','extension','reissue') else '01'
    rows = [check('authority','Đối tượng, trường hợp miễn phép và căn cứ thẩm quyền cụ thể',
                  'Điều 53–54, 56 NĐ 217/2026; quy định áp dụng tại địa phương',condition='Cấp xã: công trình cấp III, IV và nhà ở hộ gia đình/cá nhân; ban quản lý khu theo khoản 2; Sở Xây dựng: các đối tượng còn lại. Xét ngoại lệ, công trình cấp cao nhất và thay đổi cấp theo khoản 4 Điều 53.'),
            check('application',f'Đơn đề nghị Mẫu {form}, Phụ lục II, đúng loại thủ tục',f'Điều {article} NĐ 217/2026; Mẫu {form} Phụ lục II'),
            check('formality','Tính hợp lệ của bản chính, bản sao / hồ sơ điện tử, chữ ký và bản vẽ',
                  'Điều 56 NĐ 217/2026',condition='Khai thác dữ liệu đã có hợp lệ trong cơ sở dữ liệu; không mặc định yêu cầu nộp lại bản giấy.')]
    land = check('land','Giấy tờ đất đai hoặc dữ liệu được khai thác hợp lệ theo phạm vi công trình',
                 f'Điều 55, 56 và Điều {article} NĐ 217/2026')
    if subtype in ('new','stage'):
        land['condition']='Đối chiếu phương án thay thế được pháp luật cho phép: văn bản chấp thuận vị trí, phương án tuyến hoặc quyết định thu hồi đất; phạm vi đất tương ứng giai đoạn.'
    design = check('design','Bản vẽ thiết kế tương ứng loại công trình, phạm vi đề nghị cấp phép',f'Điều {article} NĐ 217/2026')
    specialized = check('specialized','Kết quả thủ tục PCCC, môi trường, văn hóa theo đối tượng áp dụng',
                        f'Điều {article} NĐ 217/2026',True,'Xác định từng đối tượng theo pháp luật chuyên ngành; giải thích nếu không áp dụng.')
    if subtype in ('new','stage','group','temporary'):
        rows += [land, design,
                 check('approval','Quyết định phê duyệt dự án',f'Điều {article}; điểm c khoản 1 Điều 57 NĐ 217/2026'),
                 check('verification','Báo cáo thẩm tra thiết kế nếu thuộc trường hợp phải thẩm tra',
                       'Điều 56; điểm c khoản 1 Điều 57 NĐ 217/2026',True,'Áp dụng theo đối tượng, quy mô và yêu cầu về thẩm tra thiết kế.'), specialized,
                 check('special_building','Yêu cầu riêng đối với công trình tôn giáo, tín ngưỡng, tượng đài, quảng cáo, ngoại giao',
                       'Khoản 2–5 Điều 57 NĐ 217/2026',True,'Đối chiếu loại công trình và pháp luật chuyên ngành tương ứng.')]
        if subtype == 'stage':
            rows += [check('stage_scope','Đất, thiết kế và phạm vi công việc của giai đoạn xin phép','Điều 58 NĐ 217/2026')]
        if subtype == 'group':
            rows += [check('group_scope','Danh mục và bản vẽ của từng công trình trong nhóm','Điều 59 NĐ 217/2026')]
        if subtype == 'temporary':
            rows += [check('local','Quy định cấp tỉnh về quy mô, chiều cao và thời hạn tồn tại','Khoản 1 Điều 62 NĐ 217/2026'),
                     check('temporary','Đơn có tiêu đề cấp phép có thời hạn và nghĩa vụ tháo dỡ theo mẫu','Khoản 2 Điều 62; Mẫu 05 Phụ lục II NĐ 217/2026')]
    elif subtype == 'house':
        rows += [land, design,
                 check('verification','Điều kiện thiết kế, thẩm tra và PCCC theo đối tượng nhà ở','Điều 60 NĐ 217/2026',True,
                       'Phân biệt chủ đầu tư cá nhân và tổ chức; đối chiếu diện phải thẩm tra/PCCC.'),
                 check('heritage','Chấp thuận về di tích, di sản khi thuộc khu vực bảo vệ','Điều 60 NĐ 217/2026',True,
                       'Chỉ áp dụng khi nhà thuộc trường hợp bảo vệ di tích, di sản theo quy định.'),
                 check('adjacent','Cam kết bảo đảm an toàn công trình liền kề','Điều 60 NĐ 217/2026')]
    elif subtype == 'repair':
        rows += [land,
                 check('existing','Bản vẽ hiện trạng được duyệt và ảnh hiện trạng, lân cận tối thiểu 10 × 15 cm',
                       'Điểm b khoản 2 Điều 61 NĐ 217/2026'), design, specialized]
    elif subtype == 'relocation':
        rows += [check('land','Quyền sử dụng đất nơi di dời đến và giấy tờ hợp pháp về sở hữu công trình',
                       'Điểm a khoản 3 Điều 61 NĐ 217/2026'),
                 check('existing','Hoàn công hoặc bản vẽ thực trạng, kết cấu; tổng mặt bằng và móng nơi di dời đến',
                       'Điểm b khoản 3 Điều 61 NĐ 217/2026'),
                 check('survey','Khảo sát đánh giá chất lượng do tổ chức có chức năng thiết kế hoặc kiểm định thực hiện',
                       'Điểm c khoản 3 Điều 61 NĐ 217/2026'),
                 check('relocation_plan','Phương án di dời: biện pháp, nhân lực, thiết bị, an toàn, môi trường, tiến độ',
                       'Điểm d khoản 3 Điều 61 NĐ 217/2026')]
    elif subtype == 'amendment':
        rows += [check('reason','Nội dung thay đổi thuộc trường hợp phải điều chỉnh giấy phép','Khoản 1 Điều 63 NĐ 217/2026'),
                 check('prior','Giấy phép đã cấp và bản vẽ kèm theo','Điểm b khoản 2 Điều 63 NĐ 217/2026'),
                 check('design','Thiết kế điều chỉnh; thiết kế trong BCNCKT nếu điều chỉnh dự án','Điểm c khoản 2 Điều 63 NĐ 217/2026'),
                 check('approval','Kết quả thẩm định, phê duyệt thiết kế điều chỉnh; an toàn, PCCC, môi trường',
                       'Điểm d khoản 2 Điều 63 NĐ 217/2026'),
                 check('land','Giấy tờ đất khi thay đổi diện tích hoặc chức năng sử dụng đất',
                       'Điểm đ khoản 2 Điều 63 NĐ 217/2026',True,'Chỉ áp dụng nếu thay đổi diện tích hoặc chức năng sử dụng đất.')]
    elif subtype == 'extension':
        rows += [check('prior','Giấy phép: bản chính, bản sao chứng thực hoặc bản điện tử đã cấp','Điểm b khoản 3 Điều 63 NĐ 217/2026'),
                 check('reason','Chưa khởi công khi hết hiệu lực khởi công; tối đa 02 lần, mỗi lần 12 tháng',
                       'Điểm a khoản 3 Điều 63 NĐ 217/2026')]
    elif subtype == 'reissue':
        rows += [check('reason','Lý do rách, nát hoặc mất giấy phép; cấp lại là bản sao giấy phép cũ','Khoản 1, 3 Điều 64 NĐ 217/2026'),
                 check('prior','Bản chính hoặc bản sao chứng thực giấy phép bị rách, nát','Điểm b khoản 2 Điều 64 NĐ 217/2026',True,
                       'Trường hợp mất phải nêu rõ lý do; không bắt buộc nộp bản giấy đã mất.')]
    if subtype not in ('extension','reissue'):
        rows += [check('safety','An toàn kết cấu, lân cận, hạ tầng; môi trường, PCCC và thiết kế được duyệt',
                       'Khoản 3, 4 Điều 50; Điều 51–52 NĐ 217/2026'),
                 check('planning','Mục đích sử dụng đất, quy hoạch và điều kiện theo loại giấy phép',
                       'Điều 50–52 NĐ 217/2026',subtype=='repair',
                       'Sửa chữa giữ nguyên quy mô, chức năng: áp dụng ngoại lệ khoản 1 Điều 51 đối với yêu cầu quy hoạch; mục đích sử dụng đất vẫn phải đáp ứng.')]
    if subtype=='temporary':
        rows += [check('temporary_eligibility','Quy hoạch chưa thực hiện, thu hồi đất, kế hoạch sử dụng đất và cam kết phá dỡ',
                       'Khoản 1–4 Điều 52 NĐ 217/2026',condition='Không đồng nhất thời hạn tồn tại với 12 tháng hiệu lực khởi công. Kiểm tra trường hợp đã có kế hoạch sử dụng đất cấp xã và ngoại lệ sau 02 năm.')]
    return rows


def inspection_checks(subtype):
    def row(id,label,citation,conditional=False,condition=''):
        return check(id,label,citation,conditional,condition,ND207)
    rows = [row('authority','Đối tượng phải kiểm tra, cơ quan có thẩm quyền và phạm vi kiểm tra','Điều 25–27 NĐ 207/2026'),
            row('completion','Báo cáo hoàn thành thi công, mã định danh dự án/công trình và danh mục hồ sơ','Điểm a khoản 4 Điều 27; Phụ lục VI NĐ 207/2026'),
            row('acceptance','Biên bản nghiệm thu của chủ đầu tư, thành phần ký và điều kiện nghiệm thu','Điều 24 NĐ 207/2026'),
            row('design','Thiết kế được duyệt, điều chỉnh; giấy phép nếu thuộc diện','Điều 24, 27; Phụ lục VII NĐ 207/2026'),
            row('quality','Hồ sơ nghiệm thu công việc, thí nghiệm, chất lượng và chạy thử theo thiết kế','Khoản 1 Điều 24; Phụ lục VII NĐ 207/2026'),
            check('technical_checks','Kế hoạch, năng lực và kết quả thí nghiệm, quan trắc, kiểm định theo đối tượng',
                  'Điều 2–5 TT 32/2026/TT-BXD; Điều 8 NĐ 207/2026',True,
                  'Áp dụng khi có yêu cầu thí nghiệm, quan trắc, kiểm định; không mặc định bắt kiểm định mọi công trình.',TT32),
            row('specialized','Hồ sơ PCCC, môi trường và chuyên ngành nếu thuộc diện','Điểm d khoản 1 Điều 24; Điều 29 NĐ 207/2026',True,
                'Xác định từng đối tượng; ghi rõ căn cứ nếu không áp dụng.'),
            row('site','Kết quả kiểm tra, các tồn tại, công việc còn lại và xử lý theo đúng loại nghiệm thu','Điều 24, 27 NĐ 207/2026'),
            row('archive','Danh mục và lưu trữ hồ sơ hoàn thành công trình','Điều 28; Phụ lục VII NĐ 207/2026'),
            row('handover','Hồ sơ phục vụ quản lý, sử dụng; vận hành và bảo trì khi bàn giao','Điều 30; Phụ lục X NĐ 207/2026',True,
                'Đối chiếu khi bàn giao/đưa phần công trình vào sử dụng; không thay thế danh mục hồ sơ hoàn thành Phụ lục VII.')]
    if subtype == 'conditional':
        rows += [row('conditional_safety','Tồn tại không ảnh hưởng chịu lực, thời hạn sử dụng, công năng; có hạn hoàn thành và giới hạn sử dụng',
                     'Khoản 3 Điều 24; khoản 5 Điều 27 và khoản 5 Điều 29 NĐ 207/2026')]
    if subtype == 'partial':
        rows += [row('partial_safety','Phần đưa vào sử dụng đã hoàn thành, đủ điều kiện; phần thi công tiếp không ảnh hưởng an toàn, vận hành',
                     'Khoản 2 Điều 24; khoản 6 Điều 30 NĐ 207/2026')]
    return rows


def template_info(procedure, subtype):
    if procedure == 'nghiem_thu':
        return {'input':'Báo cáo hoàn thành — Phụ lục VI', 'output':'Thông báo kết quả — Phụ lục VIII', 'url':ND207}
    output = ('Bản sao giấy phép đã cấp' if subtype == 'reissue' else
              'Ghi trên giấy phép gốc / phụ lục bổ sung đúng mẫu gốc' if subtype in ('amendment','extension') else
              'Mẫu 04 — Sửa chữa, cải tạo, di dời' if subtype in ('repair','relocation') else
              'Mẫu 05 — Xây dựng có thời hạn' if subtype == 'temporary' else 'Mẫu 03 — Giấy phép xây dựng')
    return {'input':f"Đơn Mẫu {'02' if subtype in ('amendment','extension','reissue') else '01'} — Phụ lục II",
            'output':output, 'url':PL217}
