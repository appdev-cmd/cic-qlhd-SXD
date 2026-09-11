import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermitService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dossierId: string) {
    const permitNumber = await this.issuePermitNumber();
    return this.prisma.permit.create({
      data: {
        dossierId,
        permitNumber,
      },
    });
  }

  async issuePermitNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.permit.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        }
      }
    });
    return `GPXD-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async sign(dossierId: string, signatureData: any, userId: string) {
    return this.prisma.permit.update({
      where: { dossierId },
      data: {
        digitalSignature: signatureData,
        signedBy: userId,
        issuedAt: new Date(),
      },
    });
  }
}
