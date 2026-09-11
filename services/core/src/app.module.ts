import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { DossierModule } from './modules/dossier/dossier.module';
import { AppraisalModule } from './modules/appraisal/appraisal.module';
import { PermitModule } from './modules/permit/permit.module';
import { AuditModule } from './modules/audit/audit.module';
import { IntegrationModule } from './modules/integration/integration.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DossierModule,
    AppraisalModule,
    PermitModule,
    AuditModule,
    IntegrationModule,
  ],
})
export class AppModule {}
