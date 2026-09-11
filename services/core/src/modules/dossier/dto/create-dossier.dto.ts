import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { DossierType } from '@prisma/client';

export class CreateDossierDto {
  @IsEnum(DossierType)
  @IsNotEmpty()
  type!: DossierType;

  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  provinceId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
