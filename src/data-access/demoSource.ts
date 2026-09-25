/**
 * Nguồn dữ liệu chế độ DEMO (offline). Tải động để bộ dữ liệu mẫu
 * không nằm trong bundle chính khi chạy chế độ live.
 */
import type { Project } from '../types/domain';
import { getProjectCoordinates } from '../lib/gisData';
import { inferInvestmentForm, inferProjectField, stageToProcedureType } from '../lib/projectClassification';
import { workflowStateFromSla } from '../lib/workflow';

type DemoModules = {
  projects: Project[];
  mockData: typeof import('../data/mockData');
  organizations: typeof import('../data/mockOrganizations');
  personnel: typeof import('../data/mockPersonnel');
  appraisal: typeof import('../data/mockAppraisalData');
  staff: typeof import('../data/mockStaff');
  holidays: typeof import('../data/holidaysVN');
};

let cache: Promise<DemoModules> | null = null;

export function loadDemo(): Promise<DemoModules> {
  if (!cache) {
    cache = Promise.all([
      import('../data/mockData'),
      import('../data/mockOrganizations'),
      import('../data/mockPersonnel'),
      import('../data/mockAppraisalData'),
      import('../data/mockStaff'),
      import('../data/holidaysVN'),
    ]).then(([mockData, organizations, personnel, appraisal, staff, holidays]) => ({
      // Chuẩn hóa dữ liệu demo giống bản ghi DB (lĩnh vực, hình thức đầu tư, tọa độ, mã cán bộ)
      projects: mockData.MOCK_PROJECTS.map((p) => {
        const coords = getProjectCoordinates(p.id, p.location);
        return {
          ...p,
          field: p.field ?? inferProjectField(p.name),
          investmentForm: p.investmentForm ?? inferInvestmentForm(p.investorName),
          procedureType: p.procedureType ?? stageToProcedureType(p.stage),
          assigneeStaffId: p.assigneeStaffId ?? staff.findStaffByName(p.assignee)?.id,
          lat: p.lat ?? coords.lat,
          lng: p.lng ?? coords.lng,
          workflowState: p.workflowState ?? workflowStateFromSla(p.slaStatus),
          supplementCount: p.supplementCount ?? (p.slaStatus === 'yeu_cau_bo_sung' ? 1 : 0),
          extensionCount: p.extensionCount ?? 0,
          receivedDate: p.receivedDate ?? (p.slaStatus === 'tiep_nhan' ? undefined : p.submissionDate),
        };
      }),
      mockData,
      organizations,
      personnel,
      appraisal,
      staff,
      holidays,
    }));
  }
  return cache;
}
