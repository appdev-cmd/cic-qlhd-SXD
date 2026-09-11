import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DossierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(data: any, userId: string) {
    const code = await this.generateCode();
    
    const dossier = await this.prisma.dossier.create({
      data: {
        ...data,
        code,
      },
    });

    await this.auditService.log('Dossier', dossier.id, 'CREATE', null, dossier, userId, dossier.id);
    return dossier;
  }

  async findAll(skip: number = 0, take: number = 10) {
    const [data, total] = await Promise.all([
      this.prisma.dossier.findMany({ skip, take }),
      this.prisma.dossier.count(),
    ]);
    return { data, total, skip, take };
  }

  async findOne(id: string) {
    const dossier = await this.prisma.dossier.findUnique({
      where: { id },
      include: { documents: true, project: true },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    return dossier;
  }

  async update(id: string, data: any, userId: string) {
    const oldDossier = await this.findOne(id);
    const updated = await this.prisma.dossier.update({
      where: { id },
      data,
    });
    await this.auditService.log('Dossier', id, 'UPDATE', oldDossier, updated, userId, id);
    return updated;
  }

  async updateStatus(id: string, status: any, userId: string) {
    return this.update(id, { status }, userId);
  }

  async generateCode() {
    const year = new Date().getFullYear();
    const count = await this.prisma.dossier.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        }
      }
    });
    const number = String(count + 1).padStart(4, '0');
    return `SXD-DB-${year}-${number}`;
  }

  async uploadDocument(dossierId: string, docData: any, userId: string) {
    const doc = await this.prisma.document.create({
      data: {
        ...docData,
        dossierId,
        uploadedBy: userId,
      }
    });
    await this.auditService.log('Document', doc.id, 'UPLOAD', null, doc, userId, dossierId);
    return doc;
  }
}
