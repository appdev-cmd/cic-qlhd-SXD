import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { PermitService } from './permit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('permits')
export class PermitController {
  constructor(private readonly permitService: PermitService) {}

  @Post(':dossierId')
  create(@Param('dossierId') dossierId: string) {
    return this.permitService.create(dossierId);
  }

  @Post(':dossierId/sign')
  sign(@Param('dossierId') dossierId: string, @Body() signatureData: any, @CurrentUser() user: any) {
    return this.permitService.sign(dossierId, signatureData, user.userId);
  }
}
