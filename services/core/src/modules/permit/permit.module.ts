import { Module } from '@nestjs/common';
import { PermitService } from './permit.service';
import { PermitController } from './permit.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { DossierModule } from '../dossier/dossier.module';

@Module({
  imports: [PrismaModule, DossierModule],
  providers: [PermitService],
  controllers: [PermitController],
  exports: [PermitService],
})
export class PermitModule {}
