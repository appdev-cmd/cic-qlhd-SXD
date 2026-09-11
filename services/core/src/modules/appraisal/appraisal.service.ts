import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SlaService } from './sla.service';
import { DossierService } from '../dossier/dossier.service';

@Injectable()
export class AppraisalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slaService: SlaService,
    private readonly dossierService: DossierService,
  ) {}

  async startAppraisal(dossierId: string, userId: string) {
    const dossier = await this.dossierService.findOne(dossierId);
    if (dossier.status !== 'ACCEPTED') {
      throw new BadRequestException('Dossier must be in ACCEPTED status');
    }

    const workingDays = 15; // Ví dụ mặc định
    const acceptedAt = new Date();
    const slaDeadline = this.slaService.addWorkingDays(acceptedAt, workingDays);

    const appraisal = await this.prisma.appraisal.create({
      data: {
        dossierId,
        slaWorkingDays: workingDays,
        slaDeadline,
      },
    });

    await this.dossierService.updateStatus(dossierId, 'APPRAISING', userId);
    return appraisal;
  }

  async calculateSlaDeadline(startDate: Date, days: number) {
    return this.slaService.addWorkingDays(startDate, days);
  }

  async suspend(dossierId: string, reason: string, userId: string) {
    const appraisal = await this.prisma.appraisal.findUnique({ where: { dossierId } });
    if (appraisal.slaSuspendCount >= 1) {
      throw new BadRequestException('Can only suspend once');
    }

    await this.prisma.appraisal.update({
      where: { dossierId },
      data: {
        slaSuspendedAt: new Date(),
        slaSuspendCount: { increment: 1 },
      },
    });

    await this.dossierService.updateStatus(dossierId, 'SUSPENDED', userId);
  }

  async resume(dossierId: string, userId: string) {
    const appraisal = await this.prisma.appraisal.findUnique({ where: { dossierId } });
    if (!appraisal.slaSuspendedAt) {
      throw new BadRequestException('Not currently suspended');
    }

    // Tính lại SLA deadline based on suspension time
    const newDeadline = this.slaService.addWorkingDays(new Date(), appraisal.slaWorkingDays - appraisal.slaElapsedDays);

    await this.prisma.appraisal.update({
      where: { dossierId },
      data: {
        slaSuspendedAt: null,
        slaDeadline: newDeadline,
      },
    });

    await this.dossierService.updateStatus(dossierId, 'APPRAISING', userId);
  }

  async extend(dossierId: string, days: number, userId: string) {
    const appraisal = await this.prisma.appraisal.findUnique({ where: { dossierId } });
    if (appraisal.slaExtendedOnce) {
      throw new BadRequestException('Can only extend once');
    }

    const newDeadline = this.slaService.addWorkingDays(appraisal.slaDeadline, days);

    await this.prisma.appraisal.update({
      where: { dossierId },
      data: {
        slaExtendedOnce: true,
        slaDeadline: newDeadline,
        slaWorkingDays: appraisal.slaWorkingDays + days,
      },
    });
  }

  async approve(dossierId: string, userId: string) {
    await this.dossierService.updateStatus(dossierId, 'APPROVED', userId);
  }

  async reject(dossierId: string, userId: string) {
    await this.dossierService.updateStatus(dossierId, 'REJECTED', userId);
  }
}
