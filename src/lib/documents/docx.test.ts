import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDocxBlob } from './docx';
import { buildMau03 } from './templates';
import { formatAdminDate } from './model';
import type { Project } from '../../types/domain';

const project: Project = {
  id: 'proj-test',
  code: 'DA-2026-DB-9999',
  name: 'Dự án kiểm thử xuất văn bản',
  investorId: 'org-001',
  investorName: 'Ban QLDA kiểm thử',
  location: 'TP. Điện Biên Phủ',
  projectGroup: 'B',
  buildingGrade: 'II',
  totalInvestment: 100_000_000_000,
  stage: 'bcnckt',
  slaStatus: 'dang_tham_dinh',
  submissionDate: '2026-09-01',
  deadlineDate: '2026-09-23',
  assignee: 'KS. Kiểm Thử',
  department: 'Phòng Quản lý Xây dựng',
  planningCompliance: true,
  standardCompliance: true,
  fireSafetyStatus: 'dat',
  estimatedSavings: 5_000_000_000,
  contractors: [],
};

describe('xuất DOCX văn bản hành chính', () => {
  it('khổ A4, lề 30/20/22/20 mm, Times New Roman, không số trang ở trang đầu', async () => {
    const doc = buildMau03(project, null, '2026-09-25');
    const blob = await buildDocxBlob(doc);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(xml).toMatch(/w:top="1247"/);
    expect(xml).toMatch(/w:bottom="1134"/);
    expect(xml).toMatch(/w:left="1701"/);
    expect(xml).toMatch(/w:right="1134"/);
    expect(xml).toContain('<w:titlePg');
    expect(xml).toContain('Times New Roman');
    expect(xml).toContain('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
    expect(xml).toContain('Dự án kiểm thử xuất văn bản');
  });

  it('ngày tháng theo thể thức NĐ 30 (thêm số 0 cho ngày < 10, tháng 1–2)', () => {
    expect(formatAdminDate('Điện Biên', '2026-02-05')).toBe('Điện Biên, ngày 05 tháng 02 năm 2026');
    expect(formatAdminDate('Điện Biên', '2026-09-25')).toBe('Điện Biên, ngày 25 tháng 9 năm 2026');
    expect(formatAdminDate('Điện Biên', '2026-12-01')).toBe('Điện Biên, ngày 01 tháng 12 năm 2026');
  });
});
