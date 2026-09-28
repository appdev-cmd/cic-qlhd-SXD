"""Explicit synthetic fixtures. Never modify or impersonate the signed source dossier."""
from .domain import REQUIREMENTS,COSTS
from .reporting import document_bytes

INITIAL=[9_000_000_000,170_129_000_000,10_744_000_000,3_090_000_000,9_530_000_000,1_587_000_000,13_150_000_000]
REVISED=[14_352_000_000,173_075_000_000,6_033_000_000,3_101_000_000,9_391_000_000,1_194_000_000,10_084_000_000]
def vi(n):return f'{n:,}'.replace(',','.')
def costs(values):return [label+': '+vi(v)+' đồng' for (_,label),v in zip(COSTS,values)]

def sample_specs(scenario='initial'):
    specs=[]
    def add(code,title,lines,revision=1):
        specs.append({'requirementId':code,'filename':f'{code}_v{revision}.docx','title':title,
            'blocks':[{'text':['Bản mô phỏng phục vụ phát triển và kiểm thử phần mềm. Không phải bản sao đầy đủ văn bản chính thức; không có chữ ký, con dấu hoặc giá trị chứng minh pháp lý.',
                               'Tên dự án: Trường liên cấp Hương Xuân — hồ sơ mô phỏng','Địa phương công trình: Hà Tĩnh']},
                      {'heading':'Nội dung phục vụ kiểm tra','text':lines}]})
    add('TTR','Tờ trình thẩm định BCNCKT mô phỏng',[
        'Ngày trình giả lập: 27/09/2026. Áp dụng quy trình sau 01/07/2026 theo Nghị định 217/2026/NĐ-CP.',
        'Kịch bản mới phục vụ thử nghiệm; không thay đổi ngày tháng hoặc kết quả hồ sơ Hương Xuân gốc.',
        'Cấp công trình: III','Tổng mức đầu tư: 217.230.000.000 đồng',*costs(INITIAL),
        'Chứng chỉ chủ trì MEP: SAMPLE-MEP-001','Chứng chỉ chủ trì khảo sát: SAMPLE-KS-001',
        'Tiêu chuẩn trường tiểu học: TCVN 8793:2011','Tiêu chuẩn trường trung học: TCVN 8794:2011',
        'Danh mục hồ sơ gửi kèm:',*[code+': '+name for code,name,_ in REQUIREMENTS if code!='TTR'],
        'Các mã SAMPLE là định danh giả lập, không phải chứng chỉ hành nghề.'])
    specs[0]['blocks'].insert(0,{'letterhead':True,'agency':'CƠ QUAN CHUẨN BỊ DỰ ÁN MÔ PHỎNG'})
    specs[0]['blocks'].insert(2,{'heading':'I. THÔNG TIN CHUNG DỰ ÁN — khung Mẫu số 01', 'text':[
        'Kính gửi: [Cơ quan chuyên môn có thẩm quyền — chưa xác nhận].',
        'Căn cứ quy trình: Luật 135/2025/QH15; Nghị định 217/2026/NĐ-CP. Căn cứ riêng của dự án phải kiểm tra bản chính thức.',
        '1. Tên dự án: Trường liên cấp Hương Xuân — hồ sơ mô phỏng',
        '2. Nhóm B; công trình dân dụng; cấp III giả lập, cần kiểm tra TT 34/2026. Thời hạn sử dụng thiết kế: chưa xác nhận.',
        '3. Mã định danh: chưa có mã chính thức.',
        '4. Quy mô giả lập: 37 lớp; đất 46.694 m²; tối đa 3 tầng; giải pháp kỹ thuật xem tài liệu KT03/KT04.',
        '5. Phạm vi giả lập: toàn bộ dự án. Cấp từng công trình và thời hạn sử dụng: cần xác nhận.',
        '6. Người quyết định đầu tư: chưa xác nhận.',
        '7. Cơ quan chuẩn bị dự án: Ban quản lý dự án mẫu; địa chỉ, điện thoại chưa cung cấp.',
        '8. Địa điểm nghiên cứu: Hương Xuân, Hà Tĩnh; ranh giới và địa danh hành chính hiện hành cần xác nhận.',
        '9. Tổng mức đầu tư: 217.230.000.000 đồng',
        '10. Nguồn vốn: đầu tư công trong kịch bản giả lập, chưa có xác nhận bố trí vốn.',
        '11. Thời gian giả lập: 2026–2027; không chia phân kỳ trong kịch bản này.',
        '12. Danh mục quy chuẩn/tiêu chuẩn: các dòng bên dưới chỉ phục vụ đối chiếu; cần hoàn thiện phiên bản và phạm vi áp dụng.',
        '13. Nhà thầu lập BCNCKT/thiết kế: đơn vị mẫu trong NL01; không có mã doanh nghiệp thật.',
        '14. Nhà thầu khảo sát: đơn vị mẫu trong NL01; không có mã doanh nghiệp thật.',
        '15. Nhà thầu thẩm tra: chưa cung cấp; cần xác định điều kiện bắt buộc thẩm tra.',
        '16. Thông tin khác: đây là bộ mẫu cố ý có thiếu sót để kiểm tra quy trình bổ sung.']})
    specs[0]['blocks'][-1]['heading']='II. DANH MỤC HỒ SƠ VÀ DỮ LIỆU ĐỐI CHIẾU'
    specs[0]['blocks'].append({'text':['Danh sách mã chứng chỉ hành nghề chủ nhiệm/chủ trì: tham chiếu NL01; các mã SAMPLE không có giá trị tra cứu năng lực.',
        'Nơi nhận: [theo thẩm quyền được xác nhận]; lưu hồ sơ mẫu.',
        'CƠ QUAN CHUẨN BỊ DỰ ÁN — không ký, không đóng dấu trong bộ mẫu.']})
    legal_content={
        'PL01':['Tham chiếu nghiên cứu: Thông báo 81-TB/TW ngày 18/07/2025.','Tình huống mô phỏng: xây dựng trường nội trú liên cấp phục vụ địa bàn biên giới.','Cần văn bản chính thức và danh mục để xác nhận đối tượng.'],
        'PL02':['Tham chiếu nghiên cứu: Nghị quyết 298/NQ-CP ngày 26/09/2025.','Kế hoạch mô phỏng: chuẩn bị và thực hiện dự án giai đoạn 2026–2027.','Chưa chứng minh nguồn vốn đã được bố trí.'],
        'PL03':['Tham chiếu nghiên cứu: Kế hoạch 564/KH-UBND ngày 20/10/2025.','Tên trường và địa phương cần được đối chiếu phụ lục kế hoạch tỉnh.'],
        'PL04':['Tham chiếu nghiên cứu: Quyết định 539/QĐ-UBND ngày 04/03/2026.','Chủ đầu tư mô phỏng: Ban quản lý dự án mẫu.','Phạm vi mô phỏng: tổ chức chuẩn bị đầu tư và tiếp nhận tư vấn.'],
        'PL05':['Tham chiếu nghiên cứu: Văn bản 1989/BGDĐT-KHTC ngày 17/04/2026.','Tổng số lớp: 37','Số lớp tiểu học: 19','Số lớp THCS: 18','Số học sinh và chỗ nội trú chưa được xác nhận.'],
        'PL06':['Tham chiếu nghiên cứu: Quyết định 119/QĐ-BQLDA ngày 20/04/2026.','Đề cương mô phỏng: khảo sát địa hình, địa chất và lập BCNCKT.','Phụ lục nhiệm vụ/thí nghiệm chính thức phải được chuyên viên kiểm tra.'],
        'PL07':['Tham chiếu nghiên cứu: Văn bản 545/UBND-KT ngày 15/05/2026.','Diện tích khu đất: 46.694 m²','Diện tích xây dựng: 8.338 m²','Số tầng tối đa: 3 tầng','Chưa có bản đồ được cơ quan có thẩm quyền đóng dấu.']}
    for code,name,_ in REQUIREMENTS:
        if code in legal_content:add(code,'Phiếu dữ liệu pháp lý mô phỏng '+code,legal_content[code])
    add('KT01','Báo cáo khảo sát địa hình mô phỏng',[
        'Diện tích khu đất: 46.694 m²','Cao độ mô phỏng từ +97,50 m đến +100,55 m.','Hệ tọa độ dự kiến VN-2000; chưa xác minh kinh tuyến trục và múi chiếu.',
        'Dữ liệu mô phỏng không đại diện kết quả đo thực địa. Cần bảng tọa độ, lưới khống chế và nghiệm thu trước khi sử dụng thiết kế.'])
    add('KT02','Báo cáo khảo sát địa chất mô phỏng',[
        'Tình huống giả lập có lớp đất đắp và lớp đất chịu lực; chưa cung cấp số liệu thí nghiệm.',
        'Đề xuất kiểm tra: A1–A4 móng băng; A5, A6, B, C móng cọc; D móng đơn.','Chưa có cơ sở tính sức chịu tải, độ lún hoặc xác nhận giải pháp móng.'])
    def feasibility(rev):
        add('KT03','Thuyết minh BCNCKT mô phỏng',[
            'Cấp công trình: III','Tổng mức đầu tư: 217.230.000.000 đồng','Diện tích khu đất: 46.694 m²',
            'Diện tích xây dựng: 8.338 m²','Tổng diện tích sàn: '+('17.140' if rev==1 else '17.551')+' m²',
            'Mật độ xây dựng: 17,9 %','Hệ số sử dụng đất: '+('0,37' if rev==1 else '0,38')+' lần',
            'Tổng số lớp: 37','Số lớp tiểu học: 19','Số lớp THCS: 18',
            'Tiêu chuẩn trường tiểu học: TCVN 8793:'+('2021' if rev==1 else '2011'),
            'Tiêu chuẩn trường trung học: TCVN 8794:'+('2021' if rev==1 else '2011'),
            'Mục tiêu mô phỏng: cơ sở học tập và nội trú. Chưa xác nhận sĩ số, số chỗ nội trú và phương án vận hành.',
            'Bản v2 chỉ minh họa phản hồi kiểm tra, không sửa số liệu hồ sơ Hương Xuân thực tế.'],rev)
    feasibility(1)
    floor_values=[1800,1343,2006,1712,2200,2175,2357,1658,1577,503,220]
    add('KT04','Thuyết minh thiết kế cơ sở mô phỏng',[
        *[f'Diện tích sàn {k}: {vi(v)} m²' for k,v in zip(['A1','A2','A3','A4','A5','A6','B','C','D','G1','G2'],floor_values)],
        'Dung tích bể hữu ích: 45 m³','Chiều dài ngoài bể: 7,12 m','Chiều rộng ngoài bể: 5,35 m','Chiều cao ngoài bể: 2,25 m',
        'Bố trí khối học, hiệu bộ, nội trú, bếp ăn và hành lang cầu theo tình huống minh họa.',
        'Chưa có bản vẽ đủ tỷ lệ, bảng tính kết cấu, thoát nạn và chữa cháy; không dùng để thi công.'])
    add('KT05','Bảng tổng mức đầu tư mô phỏng lần đầu',['Tổng mức đầu tư: 217.230.000.000 đồng',*costs(INITIAL),
        'Đơn vị: đồng Việt Nam. Dữ liệu tổng hợp dùng kiểm tra số học, chưa kèm khối lượng và căn cứ đơn giá.'])
    def capacity(rev):
        add('NL01','Danh mục năng lực mô phỏng',[
            'Đơn vị tư vấn mẫu A: SAMPLE-ORG-001; đơn vị tư vấn mẫu B: SAMPLE-ORG-002.',
            'Nhân sự mẫu A — chủ nhiệm; B — kiến trúc; C — kết cấu; D — MEP; E — chi phí; F — khảo sát.',
            'Chứng chỉ chủ trì MEP: '+('SAMPLE-MEP-002' if rev==1 else 'SAMPLE-MEP-001'),
            'Chứng chỉ chủ trì khảo sát: '+('SAMPLE-KS-002' if rev==1 else 'SAMPLE-KS-001'),
            'Không sử dụng tên/chứng chỉ cá nhân thật. Chưa có chứng chỉ có giá trị pháp lý hoặc kết quả tra cứu.'],rev)
    capacity(1)
    if scenario=='revised':
        feasibility(2)
        add('KT05','Bảng tổng mức đầu tư mô phỏng điều chỉnh',['Tổng mức đầu tư: 217.230.000.000 đồng',*costs(REVISED),
            'Giải trình mô phỏng: điều chỉnh cơ cấu khoản mục, tổng không thay đổi. Chưa chứng minh tính hợp lý của từng điều chỉnh.'],2)
        capacity(2)
    return specs

def sample_documents(scenario='initial'):
    for spec in sample_specs(scenario):
        yield spec,document_bytes(spec['title'],spec['blocks'],'docx',True)
