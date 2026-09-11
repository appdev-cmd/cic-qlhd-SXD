import { Module } from '@nestjs/common';
import { AppraisalService } from './appraisal.service';
import { AppraisalController } from './appraisal.controller';
import { SlaService } from './sla.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { DossierModule } from '../dossier/dossier.module';

@Module({
  imports: [PrismaModule, AuditModule, DossierModule],
  providers: [AppraisalService, SlaService],
  controllers: [AppraisalController],
  exports: [AppraisalService],
})
export class AppraisalModule {}
