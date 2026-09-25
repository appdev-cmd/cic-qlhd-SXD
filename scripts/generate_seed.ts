/**
 * Sinh supabase/seed.sql từ bộ dữ liệu demo trong src/data (nguồn duy nhất cho cả chế độ demo và Supabase).
 *   pnpm db:seed:generate && pnpm db:seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './lib/env';
import { MOCK_ORGANIZATIONS } from '../src/data/mockOrganizations';
import { MOCK_PERSONNEL } from '../src/data/mockPersonnel';
import { MOCK_PROJECTS, MOCK_MATERIAL_PRICES, getProjectTT39Data } from '../src/data/mockData';
import { getProjectAppraisalData } from '../src/data/mockAppraisalData';
import { MOCK_STAFF, findStaffByName } from '../src/data/mockStaff';
import { VN_HOLIDAYS } from '../src/data/holidaysVN';
import { getProjectCoordinates } from '../src/lib/gisData';
import { workflowStateFromSla } from '../src/lib/workflow';
import {
  inferInvestmentForm,
  inferProjectField,
  stageToProcedureType,
} from '../src/lib/projectClassification';

class TextArray {
  constructor(readonly items: string[]) {}
}

type SqlValue = string | number | boolean | null | undefined | TextArray | Record<string, unknown> | unknown[];

function sql(value: SqlValue): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (value instanceof TextArray) {
    const items = value.items.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    return `${sql(`{${items.join(',')}}`)}::text[]`;
  }
  return `${sql(JSON.stringify(value))}::jsonb`;
}

function insert(table: string, row: Record<string, SqlValue>): string {
  const cols = Object.keys(row);
  return `insert into public.${table} (${cols.join(', ')}) values (${cols.map((c) => sql(row[c])).join(', ')});`;
}

function main() {
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    '-- ====================================================================',
    '-- SEED DATA (DEMO): HỆ THỐNG THẨM ĐỊNH SỞ XÂY DỰNG TỈNH ĐIỆN BIÊN',
    `-- Tự động sinh bởi scripts/generate_seed.ts — KHÔNG sửa tay.`,
    `-- ${MOCK_STAFF.length} cán bộ Sở, ${MOCK_ORGANIZATIONS.length} tổ chức, ${MOCK_PERSONNEL.length} cá nhân, ${MOCK_PROJECTS.length} dự án`,
    '-- ====================================================================',
    '',
    "set app.skip_audit = 'on';",
    '',
    'truncate table public.ai_logs, public.audit_logs, public.ai_compliance_alerts, public.project_documents,',
    '  public.appraisal_checklists, public.appraisal_disciplines, public.projects, public.personnel,',
    '  public.organizations, public.material_prices, public.holidays, public.staff_users cascade;',
    ''
  );

  push('-- 1. CÁN BỘ SỞ XÂY DỰNG');
  for (const s of MOCK_STAFF) {
    push(
      insert('staff_users', {
        id: s.id,
        full_name: s.fullName,
        title: s.title,
        department: s.department,
        role: s.role,
        email: s.email,
        phone: s.phone,
      })
    );
  }

  push('', '-- 2. TỔ CHỨC THAM GIA HOẠT ĐỘNG XÂY DỰNG');
  for (const org of MOCK_ORGANIZATIONS) {
    push(
      insert('organizations', {
        id: org.id,
        code: org.code,
        name: org.name,
        type: org.type,
        tax_code: org.taxCode,
        license_number: org.taxCode,
        address: org.address,
        phone: org.phone,
        legal_rep: org.representative,
        cert_number: org.certificateNumber,
        cert_grade: org.certificateGrade ?? 'Chưa xếp hạng',
        cert_expiry: org.certificateExpiry,
        status: org.status,
        active_projects_count: org.activeProjectsCount,
      })
    );
  }

  push('', '-- 3. CÁ NHÂN HÀNH NGHỀ XÂY DỰNG');
  for (const p of MOCK_PERSONNEL) {
    push(
      insert('personnel', {
        id: p.id,
        code: p.code,
        full_name: p.fullName,
        id_card: p.idCard,
        cert_number: p.certNumber,
        cert_authority: p.certIssuer,
        cert_expiry: p.certExpiry,
        cert_grade: p.certGrade,
        specialties: new TextArray(p.specialties),
        org_id: p.orgId,
        org_name: p.orgName,
        email: p.email,
        phone: p.phone,
        status: p.status,
        active_projects_count: p.activeProjectsCount,
        has_conflict_warning: Boolean(p.hasConflictWarning),
      })
    );
  }

  push('', '-- 4. DỰ ÁN & HỒ SƠ THẨM ĐỊNH');
  const disciplineTemplates = [
    { code: 'ARCH', name: 'Kiến trúc & Quy hoạch', reviewer: 'per-001' },
    { code: 'STRUCT', name: 'Kết cấu công trình', reviewer: 'per-003' },
    { code: 'MEP', name: 'Cơ điện & Hạ tầng kỹ thuật', reviewer: 'per-005' },
    { code: 'FIRE', name: 'An toàn Phòng cháy chữa cháy', reviewer: 'per-014' },
    { code: 'COST', name: 'Tổng mức đầu tư', reviewer: 'per-004' },
  ];
  const personnelIds = new Set(MOCK_PERSONNEL.map((p) => p.id));

  for (const proj of MOCK_PROJECTS) {
    const coords = getProjectCoordinates(proj.id, proj.location);
    const designer = proj.contractors.find((c) => /thiết kế/i.test(c.role));
    const auditor = proj.contractors.find((c) => /thẩm tra/i.test(c.role));
    const staff = findStaffByName(proj.assignee);

    push(
      insert('projects', {
        id: proj.id,
        code: proj.code,
        title: proj.name,
        field: proj.field ?? inferProjectField(proj.name),
        investment_form: proj.investmentForm ?? inferInvestmentForm(proj.investorName),
        group_type: proj.projectGroup,
        grade: proj.buildingGrade,
        investment_cost: proj.totalInvestment,
        investor_id: proj.investorId,
        investor_name: proj.investorName,
        designer_id: designer?.orgId,
        designer_name: designer?.orgName,
        auditor_id: auditor?.orgId,
        auditor_name: auditor?.orgName,
        lead_reviewer_name: proj.assignee,
        lead_reviewer_staff_id: staff?.id,
        procedure_type: proj.procedureType ?? stageToProcedureType(proj.stage),
        stage: proj.stage,
        status: proj.slaStatus,
        sla_status: proj.slaStatus,
        submission_date: proj.submissionDate,
        deadline: proj.deadlineDate,
        location_district: proj.location,
        department: proj.department,
        lat: coords.lat,
        lng: coords.lng,
        thumbnail_url: proj.coverImage,
        images: proj.images ?? [],
        contractors: proj.contractors,
        planning_compliance: proj.planningCompliance,
        standard_compliance: proj.standardCompliance,
        fire_safety_status: proj.fireSafetyStatus,
        estimated_savings: proj.estimatedSavings,
        workflow_state: workflowStateFromSla(proj.slaStatus),
        received_date: proj.slaStatus === 'tiep_nhan' ? null : proj.submissionDate,
        supplement_count: proj.slaStatus === 'yeu_cau_bo_sung' ? 1 : 0,
        tt39_data: getProjectTT39Data(proj) as unknown as Record<string, unknown>,
        appraisal_data: getProjectAppraisalData(proj) as unknown as Record<string, unknown>,
      })
    );

    for (const d of disciplineTemplates) {
      push(
        insert('appraisal_disciplines', {
          id: `disc-${proj.id}-${d.code.toLowerCase()}`,
          project_id: proj.id,
          discipline_code: d.code,
          discipline_name: d.name,
          assigned_reviewer_id: personnelIds.has(d.reviewer) ? d.reviewer : null,
          status: proj.slaStatus === 'da_tham_dinh' ? 'approved' : 'reviewing',
          comments_count: 0,
        })
      );
    }
  }

  push('', '-- 5. GIÁ VẬT LIỆU XÂY DỰNG CÔNG BỐ');
  for (const m of MOCK_MATERIAL_PRICES) {
    push(
      insert('material_prices', {
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        standard_price: m.standardPrice,
        market_price: m.marketPrice,
        region: m.region,
        period: m.period,
        supplier: m.supplier,
      })
    );
  }

  push('', '-- 6. LỊCH NGHỈ LỄ, TẾT');
  for (const h of VN_HOLIDAYS) {
    push(
      insert('holidays', {
        holiday_date: h.date,
        name: h.name,
        kind: h.kind,
        is_confirmed: h.isConfirmed,
        note: h.note,
      })
    );
  }

  push('', '-- 7. CẢNH BÁO AI VỀ ĐIỀU KIỆN HÀNH NGHỀ');
  MOCK_PERSONNEL.filter((p) => p.hasConflictWarning || p.status !== 'hieu_luc').forEach((p, i) => {
    const relatedProject = MOCK_PROJECTS.find((proj) => proj.contractors.some((c) => c.leadPersonnelId === p.id));
    push(
      insert('ai_compliance_alerts', {
        id: `alt-${String(i + 1).padStart(3, '0')}`,
        alert_type: p.status === 'het_han' ? 'cert_expired' : p.status === 'sap_het_han' ? 'cert_expiring' : 'project_overload',
        severity: p.status === 'het_han' ? 'critical' : 'warning',
        target_personnel_id: p.id,
        target_project_id: relatedProject?.id,
        title: `Cảnh báo điều kiện hành nghề: ${p.fullName}`,
        message:
          p.status === 'het_han'
            ? `Chứng chỉ hành nghề ${p.certNumber} đã hết hạn ngày ${p.certExpiry}.`
            : p.status === 'sap_het_han'
              ? `Chứng chỉ hành nghề ${p.certNumber} sắp hết hạn ngày ${p.certExpiry}.`
              : `Cá nhân đang đảm nhận ${p.activeProjectsCount} dự án đồng thời — cần kiểm tra xung đột vị trí chủ trì.`,
        is_resolved: false,
      })
    );
  });

  push('', 'reset app.skip_audit;', '');

  const outputPath = path.join(ROOT_DIR, 'supabase', 'seed.sql');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`Đã ghi ${outputPath} (${lines.length} dòng).`);
}

main();
