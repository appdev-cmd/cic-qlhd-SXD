import { Controller, Get, Post, Body, Param, Put, Query, UseGuards } from '@nestjs/common';
import { DossierService } from './dossier.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('dossiers')
export class DossierController {
  constructor(private readonly dossierService: DossierService) {}

  @Post()
  create(@Body() createDto: any, @CurrentUser() user: any) {
    return this.dossierService.create(createDto, user.userId);
  }

  @Get()
  findAll(@Query('skip') skip: string, @Query('take') take: string) {
    return this.dossierService.findAll(Number(skip) || 0, Number(take) || 10);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dossierService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: any, @CurrentUser() user: any) {
    return this.dossierService.update(id, updateDto, user.userId);
  }

  @Post(':id/documents')
  uploadDocument(@Param('id') id: string, @Body() docDto: any, @CurrentUser() user: any) {
    return this.dossierService.uploadDocument(id, docDto, user.userId);
  }
}
