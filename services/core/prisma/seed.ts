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
