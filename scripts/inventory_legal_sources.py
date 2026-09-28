"""Non-destructive inventory; flags are review aids, not validity determinations."""

import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
corpus = ROOT / '01_phap_ly_quy_chuan'
reviewed = {
    'nd_cp_217_2026_quan_ly_hoat_dong_xay_dung.md',
    'nd_cp_217_2026_quan_ly_hoat_dong_xay_dung_phu_luc_i.md',
    'luat_qh15_135_2025_xay_dung.md',
    'nd_cp_206_2026_quan_ly_chi_phi_dau_tu_xay_dung.md',
    'tt_bxd_34_2026_quy_dinh_chi_tiet_cap_cong_trinh_xay_dung.md',
    'tt_bxd_36_2026_huong_dan_mot_so_noi_dung_phuong_phap.docx.md',
    'tt_bxd_37_2026_xac_dinh_dinh_muc_du_toan_va_chi_tieu_ktkt.md',
    'tt_bxd_38_2026_ban_hanh_dinh_muc_xay_dung.md',
    'tt_bxd_39_2026_huong_dan_he_thong_thong_tin_co_so_du_lieu_xay_dung.md',
    'nd_cp_212_2026_he_thong_thong_tin_co_so_du_lieu.docx.md',
    'nd_cp_207_2026_quan_ly_chat_luong_thi_cong_xay_dung_va_bao_tri_cong_trinh_xay_dung.md',
}
entries = []
for path in sorted(corpus.rglob('*')):
    if not path.is_file():
        continue
    data = path.read_bytes()
    relative = path.relative_to(corpus).as_posix()
    header = data.decode('utf-8-sig', errors='replace')[:3000] if path.suffix == '.md' else ''
    flags = []
    if 'dự thảo' in path.name.lower() or path.name.startswith('dt_') or 'DỰ THẢO' in header[:800]:
        flags.append('draft_candidate')
    if path.name == 'qcvn_bca_10_2025_xay_dung_cong_trinh_dam_bao_nguoi_khuyet_tat_tiep_can_su_dung.md':
        flags.append('filename_topic_mismatch')
    if path.suffix == '.md':
        flags.append('converted_text_requires_original')
    entries.append(
        {
            'path': relative,
            'sha256': hashlib.sha256(data).hexdigest(),
            'bytes': len(data),
            'reviewedSelectedSections': path.parent == corpus and path.name in reviewed,
            'flags': flags,
            'autoApprovedLegalAuthority': False,
        }
    )
counts = Counter(e['sha256'] for e in entries)
for e in entries:
    e['identicalCopies'] = counts[e['sha256']]
payload = {
    'reviewDate': '2026-09-27',
    'scope': 'Kiểm kê tệp; chỉ nghiên cứu điều khoản trọng tâm trong báo cáo kèm theo. Không tự xác nhận hiệu lực.',
    'totalFiles': len(entries),
    'flagCounts': dict(Counter(f for e in entries for f in e['flags'])),
    'files': entries,
}
target = ROOT / 'docs/legal-corpus-inventory.json'
target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in payload.items() if k != 'files'}, ensure_ascii=False))
