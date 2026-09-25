import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '../types/domain';
import {
  getProject,
  getProjectDetail,
  listAllProjects,
  listProjects,
  type ProjectFilters,
  type ProjectQuery,
} from '../data-access/projects';
import {
  getOrganization,
  getPersonnel,
  listHolidays,
  listMaterialPrices,
  listOrganizations,
  listPersonnel,
  listStaff,
  type OrganizationFilters,
  type PersonnelFilters,
} from '../data-access/registry';
import { getDashboardByInvestmentForm, getDashboardMonthly, getDashboardSummary } from '../data-access/dashboard';
import { listAuditLogs, type AuditEntityTable } from '../data-access/auditLogs';
import {
  createDossier,
  listTransitions,
  transitionDossier,
  type DossierIntakeInput,
  type TransitionOptions,
} from '../data-access/dossiers';
import type { WorkflowAction } from '../lib/workflow';

export const queryKeys = {
  projects: (q?: ProjectQuery) => ['projects', 'list', q ?? {}] as const,
  allProjects: (f?: ProjectFilters) => ['projects', 'all', f ?? {}] as const,
  project: (id: string) => ['projects', 'item', id] as const,
  projectDetail: (id: string) => ['projects', 'detail', id] as const,
  organizations: (f?: OrganizationFilters) => ['organizations', f ?? {}] as const,
  organization: (id: string) => ['organizations', 'item', id] as const,
  personnel: (f?: PersonnelFilters) => ['personnel', f ?? {}] as const,
  personnelItem: (id: string) => ['personnel', 'item', id] as const,
  materialPrices: (search?: string) => ['material_prices', search ?? ''] as const,
  staff: ['staff_users'] as const,
  holidays: ['holidays'] as const,
  dashboard: (part: string, arg?: unknown) => ['dashboard', part, arg ?? null] as const,
  auditLogs: (table: string, id: string) => ['audit_logs', table, id] as const,
  transitions: (projectId: string) => ['workflow_transitions', projectId] as const,
};

export function useProjects(query: ProjectQuery = {}) {
  return useQuery({
    queryKey: queryKeys.projects(query),
    queryFn: () => listProjects(query),
    placeholderData: keepPreviousData,
  });
}

export function useAllProjects(filters: ProjectFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.allProjects(filters),
    queryFn: () => listAllProjects(filters),
    enabled,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(id ?? ''),
    queryFn: () => getProject(id!),
    enabled: Boolean(id),
  });
}

export function useProjectDetail(project: Project) {
  return useQuery({
    queryKey: queryKeys.projectDetail(project.id),
    queryFn: () => getProjectDetail(project),
    staleTime: 5 * 60_000,
  });
}

export function useOrganizations(filters: OrganizationFilters = {}) {
  return useQuery({
    queryKey: queryKeys.organizations(filters),
    queryFn: () => listOrganizations(filters),
    placeholderData: keepPreviousData,
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.organization(id ?? ''),
    queryFn: () => getOrganization(id!),
    enabled: Boolean(id),
  });
}

export function usePersonnelList(filters: PersonnelFilters = {}) {
  return useQuery({
    queryKey: queryKeys.personnel(filters),
    queryFn: () => listPersonnel(filters),
    placeholderData: keepPreviousData,
  });
}

export function usePersonnel(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.personnelItem(id ?? ''),
    queryFn: () => getPersonnel(id!),
    enabled: Boolean(id),
  });
}

export function useMaterialPrices(search?: string) {
  return useQuery({
    queryKey: queryKeys.materialPrices(search),
    queryFn: () => listMaterialPrices(search),
    placeholderData: keepPreviousData,
  });
}

export function useStaff() {
  return useQuery({ queryKey: queryKeys.staff, queryFn: listStaff, staleTime: 30 * 60_000 });
}

export function useHolidays() {
  return useQuery({ queryKey: queryKeys.holidays, queryFn: listHolidays, staleTime: 60 * 60_000 });
}

export function useDashboardSummary() {
  return useQuery({ queryKey: queryKeys.dashboard('summary'), queryFn: getDashboardSummary });
}

export function useDashboardMonthly(year?: number) {
  return useQuery({ queryKey: queryKeys.dashboard('monthly', year), queryFn: () => getDashboardMonthly(year) });
}

export function useDashboardByInvestmentForm() {
  return useQuery({ queryKey: queryKeys.dashboard('investment_form'), queryFn: getDashboardByInvestmentForm });
}

export function useAuditLogs(table: AuditEntityTable, recordId: string) {
  return useQuery({
    queryKey: queryKeys.auditLogs(table, recordId),
    queryFn: () => listAuditLogs(table, recordId),
  });
}

export function useTransitions(projectId: string) {
  return useQuery({ queryKey: queryKeys.transitions(projectId), queryFn: () => listTransitions(projectId) });
}

/** Làm mới mọi dữ liệu phụ thuộc hồ sơ sau khi ghi */
function useInvalidateDossiers() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
      qc.invalidateQueries({ queryKey: ['audit_logs'] }),
      qc.invalidateQueries({ queryKey: ['workflow_transitions'] }),
    ]);
}

export function useCreateDossier() {
  const invalidate = useInvalidateDossiers();
  return useMutation({
    mutationFn: (input: DossierIntakeInput) => createDossier(input),
    onSuccess: () => invalidate(),
  });
}

export function useTransitionDossier() {
  const invalidate = useInvalidateDossiers();
  return useMutation({
    mutationFn: (args: { project: Project; action: WorkflowAction; options?: TransitionOptions }) =>
      transitionDossier(args.project, args.action, args.options),
    onSuccess: () => invalidate(),
  });
}
