import { Module } from '@nestjs/common';
import { DvcTandanAdapter } from './dvc-tandan.adapter';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DvcTandanAdapter],
  exports: [DvcTandanAdapter],
})
export class IntegrationModule {}
