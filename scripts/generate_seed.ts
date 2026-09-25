import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_ORGANIZATIONS } from '../src/data/mockOrganizations';
import { MOCK_PERSONNEL } from '../src/data/mockPersonnel';
import { MOCK_PROJECTS, getProjectTT39Data } from '../src/data/mockData';
import { getProjectAppraisalData } from '../src/data/mockAppraisalData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function escapeSql(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function escapeJson(obj: any): string {
  if (obj === null || obj === undefined) return "'{}'::jsonb";
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

function escapeArray(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const elements = arr.map((item) => `"${item.replace(/"/g, '\\"')}"`).join(',');
  return `'{${elements}}'::text[]`;
}

async function generateSeed() {
  console.log('Generating supabase/seed.sql...');
  const lines: string[] = [];

  lines.push('-- ====================================================================');
  lines.push('-- SEED DATA: HỆ THỐNG THẨM ĐỊNH SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN');
  lines.push('-- Tự động sinh từ Mock Data: 32 Tổ chức, 40 Cá nhân, 26 Dự án');
  lines.push('-- ====================================================================\n');

  lines.push('-- 1. XÓA DỮ LIỆU CŨ THEO THỨ TỰ RÀNG BUỘC KHÓA NGOẠI');
  lines.push('truncate table public.ai_compliance_alerts cascade;');
  lines.push('truncate table public.project_documents cascade;');
  lines.push('truncate table public.appraisal_checklists cascade;');
  lines.push('truncate table public.appraisal_disciplines cascade;');
  lines.push('truncate table public.projects cascade;');
  lines.push('truncate table public.personnel cascade;');
  lines.push('truncate table public.organizations cascade;\n');

  // 1. ORGANIZATIONS
  lines.push('-- 2. NẠP DỮ LIỆU TỔ CHỨC THAM GIA (32 TỔ CHỨC)');
  for (const org of MOCK_ORGANIZATIONS) {
    const fields = [
      escapeSql(org.id),
      escapeSql(org.code),
      escapeSql(org.name),
      escapeSql(org.name.length > 40 ? org.code : org.name),
      escapeSql(org.type),
      escapeSql(org.taxCode || '5600000000'),
      escapeSql(org.taxCode || '5600000000'),
      escapeSql(org.address),
      escapeSql(org.phone || '0215.3824.000'),
      escapeSql(org.representative || 'Chưa cập nhật'),
      escapeSql(org.certificateNumber || null),
      escapeSql(org.certificateGrade || 'Chưa xếp hạng'),
      escapeSql(org.certificateExpiry || null),
      escapeSql(org.status || 'hieu_luc'),
      org.activeProjectsCount || 0,
    ];
    lines.push(
      `insert into public.organizations (id, code, name, short_name, type, license_number, tax_code, address, phone, legal_rep, cert_number, cert_grade, cert_expiry, status, active_projects_count) values (${fields.join(
        ', '
      )}) on conflict (id) do nothing;`
    );
  }
  lines.push('');

  // 2. PERSONNEL
  lines.push('-- 3. NẠP DỮ LIỆU CÁ NHÂN HÀNH NGHỀ (40 CÁ NHÂN)');
  for (const p of MOCK_PERSONNEL) {
    const fields = [
      escapeSql(p.id),
      escapeSql(p.id.toUpperCase()),
      escapeSql(p.fullName),
      escapeSql(p.idCard),
      escapeSql(p.certNumber),
      escapeSql(p.certIssuer || (p as any).certAuthority || 'Sở Xây dựng tỉnh Điện Biên'),
      escapeSql(p.certExpiry),
      escapeSql(p.certGrade),
      escapeArray(p.specialties),
      escapeSql(p.orgId),
      escapeSql(p.orgName),
      escapeSql(p.email),
      escapeSql(p.phone),
      escapeSql(p.status),
      p.activeProjectsCount || 0,
      p.hasConflictWarning ? 'true' : 'false',
      escapeSql(p.conflictDetails || null),
    ];
    lines.push(
      `insert into public.personnel (id, code, full_name, id_card, cert_number, cert_authority, cert_expiry, cert_grade, specialties, org_id, org_name, email, phone, status, active_projects_count, has_conflict_warning, conflict_details) values (${fields.join(
        ', '
      )}) on conflict (id) do nothing;`
    );
  }
  lines.push('');

  // 3. PROJECTS
  lines.push('-- 4. NẠP DỮ LIỆU DỰ ÁN ĐẦU TƯ XÂY DỰNG & HỒ SƠ THẨM ĐỊNH (26 DỰ ÁN)');
  for (const proj of MOCK_PROJECTS) {
    const tt39 = getProjectTT39Data(proj);
    const appraisalData = getProjectAppraisalData(proj);

    // Tìm thông tin đơn vị liên kết
    const invId = proj.investor?.id || (proj as any).orgId || 'org-001';
    const desId = proj.consultant?.id || 'org-003';
    const audId = 'org-005';
    const reviewerId = (proj as any).leadPersonnelId || 'per-001';

    const fields = [
      escapeSql(proj.id),
      escapeSql(proj.code),
      escapeSql(proj.name),
      escapeSql(proj.field || 'Dân dụng'),
      escapeSql(proj.group || 'Nhóm B'),
      escapeSql(proj.grade || 'Cấp II'),
      proj.totalInvestment || 0,
      escapeSql(invId),
      escapeSql(proj.investor?.name || 'Ban QLDA Tỉnh Điện Biên'),
      escapeSql(desId),
      escapeSql(proj.consultant?.name || 'Tư vấn Thiết kế Điện Biên'),
      escapeSql(audId),
      escapeSql('Trung tâm Kiểm định Chất lượng Xây dựng Điện Biên'),
      escapeSql(reviewerId),
      escapeSql('KTS. Chuyên gia Sở Xây dựng'),
      escapeSql(proj.procedureType || 'Báo cáo NCKT (Thiết kế cơ sở)'),
      escapeSql(proj.status || 'Đang thẩm định'),
      proj.slaDays || 30,
      escapeSql(proj.slaStatus || 'on_time'),
      proj.progress || 0,
      escapeSql(proj.submissionDate || '2026-03-01'),
      escapeSql(proj.deadline || '2026-04-15'),
      escapeSql(proj.location || 'TP. Điện Biên Phủ'),
      proj.coordinates ? proj.coordinates[0] : 21.386,
      proj.coordinates ? proj.coordinates[1] : 103.022,
      escapeSql(proj.thumbnailUrl || null),
      escapeSql(proj.description || null),
      escapeJson({ ...tt39, appraisalExtra: appraisalData }),
    ];

    lines.push(
      `insert into public.projects (id, code, title, field, group_type, grade, investment_cost, investor_id, investor_name, designer_id, designer_name, auditor_id, auditor_name, lead_reviewer_id, lead_reviewer_name, procedure_type, status, sla_days, sla_status, progress, submission_date, deadline, location_district, lat, lng, thumbnail_url, description, tt39_data) values (${fields.join(
        ', '
      )}) on conflict (id) do nothing;`
    );

    // Tạo disciplines cho dự án
    const disciplines = [
      { code: 'ARCH', name: 'Kiến trúc & Quy hoạch', reviewer: 'per-001' },
      { code: 'STRUCT', name: 'Kết cấu công trình', reviewer: 'per-003' },
      { code: 'MEP', name: 'Cơ điện & Hạ tầng kỹ thuật', reviewer: 'per-005' },
      { code: 'FIRE', name: 'An toàn Phòng cháy chữa cháy', reviewer: 'per-014' },
      { code: 'COST', name: 'Dự toán & Tổng mức đầu tư', reviewer: 'per-004' },
    ];

    for (const d of disciplines) {
      const discId = `disc-${proj.id}-${d.code.toLowerCase()}`;
      lines.push(
        `insert into public.appraisal_disciplines (id, project_id, discipline_code, discipline_name, assigned_reviewer_id, status, comments_count) values (${escapeSql(
          discId
        )}, ${escapeSql(proj.id)}, ${escapeSql(d.code)}, ${escapeSql(d.name)}, ${escapeSql(d.reviewer)}, 'reviewing', 2) on conflict (id) do nothing;`
      );
    }
  }
  lines.push('');

  // 4. AI COMPLIANCE ALERTS
  lines.push('-- 5. NẠP DỮ LIỆU CẢNH BÁO AI GIÁM SÁT TUÂN THỦ');
  const alertPersonnel = MOCK_PERSONNEL.filter((p) => p.hasConflictWarning);
  for (let i = 0; i < alertPersonnel.length; i++) {
    const p = alertPersonnel[i];
    const alertId = `alt-${String(i + 1).padStart(3, '0')}`;
    const severity = p.status === 'het_han' ? 'critical' : 'warning';
    const fields = [
      escapeSql(alertId),
      escapeSql(p.status === 'het_han' ? 'cert_expired' : 'project_overload'),
      escapeSql(severity),
      escapeSql(p.id),
      escapeSql('proj-001'),
      escapeSql(`Cảnh báo điều kiện hành nghề: ${p.fullName}`),
      escapeSql(p.conflictDetails || 'Phát hiện bất thường về năng lực hành nghề hoặc quá tải dự án'),
      'false',
    ];
    lines.push(
      `insert into public.ai_compliance_alerts (id, alert_type, severity, target_personnel_id, target_project_id, title, message, is_resolved) values (${fields.join(
        ', '
      )}) on conflict (id) do nothing;`
    );
  }

  const outputPath = path.resolve(__dirname, '../supabase/seed.sql');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`Successfully written seed file to ${outputPath} (${lines.length} lines)`);
}

generateSeed().catch(console.error);
