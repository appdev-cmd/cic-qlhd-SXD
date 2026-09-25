import type { InvestmentForm, ProcedureType, Project } from '../types/domain';
import { removeVietnameseTones } from './smartSearch';

export const PROJECT_FIELDS = [
  'Giao thông',
  'Dân dụng',
  'Hạ tầng kỹ thuật',
  'Công nghiệp',
  'Nông nghiệp & PTNT',
] as const;

export type ProjectField = (typeof PROJECT_FIELDS)[number];

export const INVESTMENT_FORM_LABELS: Record<InvestmentForm, string> = {
  dau_tu_cong: 'Đầu tư công',
  ppp: 'Đối tác PPP',
  kinh_doanh: 'Kinh doanh (Phụ lục IV)',
};

export const PROCEDURE_TYPE_LABELS: Record<ProcedureType, string> = {
  tham_dinh_bcnckt: 'Thẩm định BCNCKT',
  cap_gpxd: 'Cấp Giấy phép XD',
  kiem_tra_nghiem_thu: 'Kiểm tra nghiệm thu',
};

/** Suy ra lĩnh vực công trình từ tên dự án (dùng cho dữ liệu demo chưa khai báo lĩnh vực). */
export function inferProjectField(name: string): ProjectField {
  const t = removeVietnameseTones(name);
  if (/(duong|cau |cau$|quoc lo|ben xe|giao thong|tuyen|dai lo|san bay|cang hang khong)/.test(t)) return 'Giao thông';
  if (/(cap nuoc|thoat nuoc|nuoc thai|xu ly chat thai|xlctr|chieu sang|ha tang|ke |de |dap)/.test(t)) return 'Hạ tầng kỹ thuật';
  if (/(nha may|cum cong nghiep|ccn|che bien)/.test(t)) return 'Công nghiệp';
  if (/(thuy loi|canh dong|nong nghiep|ho chua)/.test(t)) return 'Nông nghiệp & PTNT';
  return 'Dân dụng';
}

/** Suy ra hình thức đầu tư từ tên chủ đầu tư. */
export function inferInvestmentForm(investorName: string): InvestmentForm {
  const t = removeVietnameseTones(investorName);
  if (/(ppp|doi tac cong tu|bot|bt )/.test(t)) return 'ppp';
  if (/(cong ty|tap doan|doanh nghiep|ctcp|tnhh)/.test(t)) return 'kinh_doanh';
  return 'dau_tu_cong';
}

export function stageToProcedureType(stage: Project['stage']): ProcedureType {
  if (stage === 'gpxd') return 'cap_gpxd';
  if (stage === 'nghiem_thu' || stage === 'hoan_thanh') return 'kiem_tra_nghiem_thu';
  return 'tham_dinh_bcnckt';
}
