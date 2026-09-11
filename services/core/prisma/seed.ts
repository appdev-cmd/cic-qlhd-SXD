import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Seed Province
  const province = await prisma.province.upsert({
    where: { code: 'dien_bien' },
    update: {},
    create: {
      code: 'dien_bien',
      name: 'Điện Biên',
      config: {
        unitPrice: 2500000,
        planningZone: 'Zone 1'
      }
    }
  });

  console.log(`Upserted province: ${province.name}`);

  // 2. Seed Users
  // Note: These use a placeholder hash for the password "password123"
  const fakePasswordHash = 'placeholder_hash_for_password123';

  const usersData = [
    {
      email: 'admin@dienbien.gov.vn',
      fullName: 'System Admin',
      role: 'ADMIN',
      provinceId: province.id,
    },
    {
      email: 'chuyenvien1@dienbien.gov.vn',
      fullName: 'Chuyên viên 1',
      role: 'SPECIALIST',
      provinceId: province.id,
      department: 'Phòng QLXD',
    },
    {
      email: 'chuyenvien2@dienbien.gov.vn',
      fullName: 'Chuyên viên 2',
      role: 'SPECIALIST',
      provinceId: province.id,
      department: 'Phòng QLXD',
    },
    {
      email: 'truongphong@dienbien.gov.vn',
      fullName: 'Trưởng phòng QLXD',
      role: 'DEPT_HEAD',
      provinceId: province.id,
      department: 'Phòng QLXD',
    },
    {
      email: 'giamdoc@dienbien.gov.vn',
      fullName: 'Giám đốc Sở',
      role: 'DIRECTOR',
      provinceId: province.id,
      position: 'Giám đốc',
    }
  ];

  for (const user of usersData) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        ...user,
        role: user.role as any,
        passwordHash: fakePasswordHash,
      },
    });
    console.log(`Upserted user: ${user.email}`);
  }

  // 3. Seed Projects & Dossiers mẫu tại Điện Biên
  const sampleProject1 = await prisma.project.upsert({
    where: { id: 'proj-db-001' },
    update: {},
    create: {
      id: 'proj-db-001',
      name: 'Trường Tiểu học Thanh Xương, Huyện Điện Biên',
      investor: 'Ban Quản lý dự án huyện Điện Biên',
      location: 'Xã Thanh Xương, Huyện Điện Biên, Tỉnh Điện Biên',
      investmentType: 'PUBLIC',
      projectGroup: 'GROUP_C',
      constructionGrade: 'GRADE_III',
      constructionType: 'Công trình dân dụng (Giáo dục)',
      totalInvestment: 15000000000,
      fundingSource: 'Ngân sách Nhà nước',
      provinceId: province.id,
    }
  });

  const sampleProject2 = await prisma.project.upsert({
    where: { id: 'proj-db-002' },
    update: {},
    create: {
      id: 'proj-db-002',
      name: 'Nâng cấp đường giao thông nội thị Thị xã Mường Lay',
      investor: 'Ban QLDA các công trình Giao thông tỉnh Điện Biên',
      location: 'Thị xã Mường Lay, Tỉnh Điện Biên',
      investmentType: 'PUBLIC',
      projectGroup: 'GROUP_B',
      constructionGrade: 'GRADE_II',
      constructionType: 'Công trình giao thông',
      totalInvestment: 45000000000,
      fundingSource: 'Vốn đầu tư công trung hạn',
      provinceId: province.id,
    }
  });

  const sampleProject3 = await prisma.project.upsert({
    where: { id: 'proj-db-003' },
    update: {},
    create: {
      id: 'proj-db-003',
      name: 'Khu thương mại dịch vụ và nhà ở Him Lam',
      investor: 'Công ty Cổ phần Đầu tư Xây dựng Him Lam Điện Biên',
      location: 'Phường Him Lam, TP. Điện Biên Phủ, Tỉnh Điện Biên',
      investmentType: 'BUSINESS',
      projectGroup: 'GROUP_B',
      constructionGrade: 'GRADE_II',
      constructionType: 'Công trình dân dụng thương mại',
      totalInvestment: 120000000000,
      fundingSource: 'Vốn doanh nghiệp và vốn vay',
      provinceId: province.id,
    }
  });

  // Seed Dossier 1: Đang thẩm định BCNCKT
  await prisma.dossier.upsert({
    where: { code: 'SXD-DB-2026-0001' },
    update: {},
    create: {
      code: 'SXD-DB-2026-0001',
      type: 'APPRAISAL_BCNCKT',
      status: 'APPRAISING',
      receivedAt: new Date('2026-03-01'),
      acceptedAt: new Date('2026-03-05'),
      projectId: sampleProject1.id,
      provinceId: province.id,
      notes: 'Hồ sơ đầy đủ, chuyển chuyên viên thẩm định theo thẩm quyền',
      appraisal: {
        create: {
          slaWorkingDays: 15,
          slaDeadline: new Date('2026-03-26'),
          slaElapsedDays: 4,
        }
      }
    }
  });

  // Seed Dossier 2: Kiểm tra tính hợp lệ
  await prisma.dossier.upsert({
    where: { code: 'SXD-DB-2026-0002' },
    update: {},
    create: {
      code: 'SXD-DB-2026-0002',
      type: 'APPRAISAL_BCNCKT',
      status: 'CHECKING',
      receivedAt: new Date('2026-03-08'),
      projectId: sampleProject2.id,
      provinceId: province.id,
      notes: 'Đang rà soát tính đầy đủ thành phần hồ sơ theo NĐ 217/2026',
    }
  });

  // Seed Dossier 3: Cấp phép xây dựng
  await prisma.dossier.upsert({
    where: { code: 'SXD-DB-2026-0003' },
    update: {},
    create: {
      code: 'SXD-DB-2026-0003',
      type: 'PERMIT_GPXD',
      status: 'APPRAISING',
      receivedAt: new Date('2026-03-02'),
      acceptedAt: new Date('2026-03-03'),
      projectId: sampleProject3.id,
      provinceId: province.id,
      notes: 'Hồ sơ xin cấp GPXD công trình cấp II',
      permit: {
        create: {
          permitNumber: 'GPXD-SXD-01/2026',
        }
      }
    }
  });

  console.log('Upserted sample projects and dossiers!');
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
