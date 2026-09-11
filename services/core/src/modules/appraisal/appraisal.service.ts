import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
      throw new BadRequestException('Hồ sơ phải ở trạng thái đã tiếp nhận (ACCEPTED)');
    }

    const workingDays = this.slaService.getSlaWorkingDays(
      dossier.project?.projectGroup ?? 'GROUP_C',
      dossier.project?.constructionGrade ?? 'GRADE_III',
      dossier.type,
    );

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
    if (!appraisal) {
      throw new NotFoundException('Không tìm thấy quy trình thẩm định');
    }
    if (appraisal.slaSuspendCount >= 1) {
      throw new BadRequestException('Chỉ được tạm dừng tối đa 1 lần');
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
    if (!appraisal) {
      throw new NotFoundException('Không tìm thấy quy trình thẩm định');
    }
    if (!appraisal.slaSuspendedAt) {
      throw new BadRequestException('Hồ sơ chưa được tạm dừng');
    }

    // Tính lại SLA deadline dựa trên số ngày LV còn lại
    const remainingDays = (appraisal.slaWorkingDays ?? 15) - appraisal.slaElapsedDays;
    const newDeadline = this.slaService.addWorkingDays(new Date(), remainingDays);

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
    if (!appraisal) {
      throw new NotFoundException('Không tìm thấy quy trình thẩm định');
    }
    if (appraisal.slaExtendedOnce) {
      throw new BadRequestException('Chỉ được gia hạn tối đa 1 lần');
    }

    const currentDeadline = appraisal.slaDeadline ?? new Date();
    const newDeadline = this.slaService.addWorkingDays(currentDeadline, days);
    const currentWorkingDays = appraisal.slaWorkingDays ?? 15;

    await this.prisma.appraisal.update({
      where: { dossierId },
      data: {
        slaExtendedOnce: true,
        slaDeadline: newDeadline,
        slaWorkingDays: currentWorkingDays + days,
      },
    });
  }

  async approve(dossierId: string, userId: string) {
    await this.prisma.appraisal.update({
      where: { dossierId },
      data: { signedAt: new Date(), signedBy: userId },
    });
    await this.dossierService.updateStatus(dossierId, 'APPROVED', userId);
  }

  async reject(dossierId: string, userId: string) {
    await this.dossierService.updateStatus(dossierId, 'REJECTED', userId);
  }
}
