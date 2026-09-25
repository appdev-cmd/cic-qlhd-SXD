import type { StaffUser } from '../types/domain';

/**
 * Cán bộ Sở Xây dựng tỉnh Điện Biên (dữ liệu demo giai đoạn phát triển).
 * Dùng chung cho seed Supabase và chế độ demo offline.
 */
export const MOCK_STAFF: StaffUser[] = [
  {
    id: 'staff-001',
    fullName: 'KTS. Lê Hồng Phong',
    title: 'Chuyên viên Phòng QLXD',
    department: 'Phòng Quản lý Xây dựng',
    role: 'officer',
    email: 'lehongphong.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-002',
    fullName: 'ThS. Nguyễn Đức Long',
    title: 'Chuyên viên chính Phòng QLXD',
    department: 'Phòng Quản lý Xây dựng',
    role: 'officer',
    email: 'nguyenduclong.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-003',
    fullName: 'KS. Trần Văn Hùng',
    title: 'Chuyên viên Tổ Giao thông',
    department: 'Phòng Quản lý Xây dựng',
    role: 'officer',
    email: 'tranvanhung.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-004',
    fullName: 'KS. Phạm Quốc Tuấn',
    title: 'Chuyên viên Phòng QLĐT',
    department: 'Phòng Quản lý Đô thị',
    role: 'officer',
    email: 'phamquoctuan.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-005',
    fullName: 'KS. Hoàng Thị Mai',
    title: 'Chuyên viên Phòng QLXD',
    department: 'Phòng Quản lý Xây dựng',
    role: 'officer',
    email: 'hoangthimai.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-006',
    fullName: 'KS. Đặng Minh Tuấn',
    title: 'Chuyên viên Phòng QLXD',
    department: 'Phòng Quản lý Xây dựng',
    role: 'officer',
    email: 'dangminhtuan.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-010',
    fullName: 'ThS. Vũ Thanh Bình',
    title: 'Trưởng phòng Quản lý Xây dựng',
    department: 'Phòng Quản lý Xây dựng',
    role: 'head_of_department',
    email: 'vuthanhbinh.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-011',
    fullName: 'KTS. Lò Thị Hằng',
    title: 'Trưởng phòng Quản lý Đô thị',
    department: 'Phòng Quản lý Đô thị',
    role: 'head_of_department',
    email: 'lothihang.sxd@dienbien.gov.vn',
  },
  {
    id: 'staff-020',
    fullName: 'Nguyễn Văn Hùng',
    title: 'Phó Giám đốc Sở',
    department: 'Ban Giám đốc',
    role: 'director',
    email: 'nguyenvanhung.sxd@dienbien.gov.vn',
  },
];

export function findStaffByName(fullName: string): StaffUser | undefined {
  return MOCK_STAFF.find((s) => s.fullName === fullName);
}
