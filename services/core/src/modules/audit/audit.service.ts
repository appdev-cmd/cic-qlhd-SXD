import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    entity: string,
    entityId: string,
    action: string,
    oldValue?: any,
    newValue?: any,
    userId?: string,
    dossierId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        oldValue,
        newValue,
        userId,
        dossierId,
        ipAddress,
        userAgent,
      },
    });
  }
}
