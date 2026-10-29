import type React from 'react';
import {
  Bot,
  Box,
  Building2,
  Coins,
  FileCheck,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Printer,
  Settings,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { PROJECT_PROCEDURES } from '../lib/projectProcedures';

export type ProcedureId = 'bcnckt' | 'gpxd' | 'nghiem_thu';

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Nghiệp vụ có hạn xử lý — menu hiện số hồ sơ quá hạn / sắp đến hạn. */
  procedure?: ProcedureId;
  /** Từ khóa thêm cho tìm nhanh Ctrl+K. */
  keywords?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/** Menu chính — nhóm theo nghiệp vụ (U2). Thêm mục mới vào đúng nhóm; không đánh số. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Tổng quan',
    items: [
      {
        to: '/dashboard',
        label: 'Dashboard & Thống kê',
        shortLabel: 'Dashboard',
        icon: LayoutDashboard,
        keywords: 'tong quan kpi bao cao',
      },
    ],
  },
  {
    id: 'dossiers',
    label: 'Hồ sơ nghiệp vụ',
    items: [
      {
        to: PROJECT_PROCEDURES.bcnckt.path,
        label: PROJECT_PROCEDURES.bcnckt.label,
        shortLabel: 'BCNCKT',
        icon: ShieldCheck,
        procedure: 'bcnckt',
        keywords: 'bcnckt bao cao nghien cuu kha thi tham dinh',
      },
      {
        to: PROJECT_PROCEDURES.gpxd.path,
        label: PROJECT_PROCEDURES.gpxd.label,
        shortLabel: 'GPXD',
        icon: FileText,
        procedure: 'gpxd',
        keywords: 'gpxd giay phep xay dung cap phep',
      },
      {
        to: PROJECT_PROCEDURES.nghiem_thu.path,
        label: PROJECT_PROCEDURES.nghiem_thu.label,
        shortLabel: 'Nghiệm thu',
        icon: FileCheck,
        procedure: 'nghiem_thu',
        keywords: 'nghiem thu hau kiem khoi cong kiem tra',
      },
      { to: '/projects', label: 'Danh mục dự án', shortLabel: 'Dự án', icon: FolderKanban, keywords: 'du an' },
    ],
  },
  {
    id: 'catalog',
    label: 'Danh mục',
    items: [
      {
        to: '/organizations',
        label: 'Tổ chức tham gia',
        shortLabel: 'Tổ chức',
        icon: Building2,
        keywords: 'cdt chu dau tu nha thau tu van',
      },
      { to: '/personnel', label: 'Cá nhân hành nghề', shortLabel: 'Cá nhân', icon: UserCheck, keywords: 'chung chi' },
      {
        to: '/cost-database',
        label: 'Giá & Định mức',
        shortLabel: 'Giá VLXD',
        icon: Coins,
        keywords: 'gia vat lieu dinh muc don gia',
      },
    ],
  },
  {
    id: 'tools',
    label: 'Công cụ',
    items: [
      {
        to: '/legal-ai',
        label: 'Trợ lý AI Pháp luật',
        shortLabel: 'AI Luật',
        icon: Bot,
        keywords: 'luat nghi dinh ai',
      },
      { to: '/gis-map', label: 'Bản đồ Quy hoạch', shortLabel: 'Bản đồ', icon: MapPin, keywords: 'gis ban do' },
      { to: '/bim', label: 'Mô hình BIM', shortLabel: 'BIM', icon: Box, keywords: 'bim ifc revit mo hinh' },
      {
        to: '/documents',
        label: 'Văn bản & In ấn A4',
        shortLabel: 'Văn bản',
        icon: Printer,
        keywords: 'van ban a4 in',
      },
    ],
  },
  {
    id: 'system',
    label: 'Hệ thống',
    items: [
      { to: '/settings', label: 'Cài đặt Hệ thống', shortLabel: 'Cài đặt', icon: Settings, keywords: 'cai dat' },
      {
        to: '/help',
        label: 'Hướng dẫn sử dụng',
        shortLabel: 'Hướng dẫn',
        icon: LifeBuoy,
        keywords: 'huong dan tro giup help phim tat cach dung quy trinh tai lieu',
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Mục menu ứng với đường dẫn hiện tại (hồ sơ /dossiers/:id thuộc nhóm hồ sơ). */
export function findNav(pathname: string): { group?: NavGroup; item?: NavItem } {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => pathname === i.to || pathname.startsWith(i.to + '/'));
    if (item) return { group, item };
  }
  if (pathname.startsWith('/dossiers/')) return { group: NAV_GROUPS[1] };
  return {};
}
