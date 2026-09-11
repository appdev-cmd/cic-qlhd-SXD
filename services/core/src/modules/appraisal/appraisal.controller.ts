import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AppraisalService } from './appraisal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('appraisals')
export class AppraisalController {
  constructor(private readonly appraisalService: AppraisalService) {}

  @Post(':dossierId/start')
  startAppraisal(@Param('dossierId') dossierId: string, @CurrentUser() user: any) {
    return this.appraisalService.startAppraisal(dossierId, user.userId);
  }

  @Post(':dossierId/suspend')
  suspend(@Param('dossierId') dossierId: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.appraisalService.suspend(dossierId, reason, user.userId);
  }

  @Post(':dossierId/resume')
  resume(@Param('dossierId') dossierId: string, @CurrentUser() user: any) {
    return this.appraisalService.resume(dossierId, user.userId);
  }

  @Post(':dossierId/extend')
  extend(@Param('dossierId') dossierId: string, @Body('days') days: number, @CurrentUser() user: any) {
    return this.appraisalService.extend(dossierId, days, user.userId);
  }

  @Post(':dossierId/approve')
  approve(@Param('dossierId') dossierId: string, @CurrentUser() user: any) {
    return this.appraisalService.approve(dossierId, user.userId);
  }

  @Post(':dossierId/reject')
  reject(@Param('dossierId') dossierId: string, @CurrentUser() user: any) {
    return this.appraisalService.reject(dossierId, user.userId);
  }
}
