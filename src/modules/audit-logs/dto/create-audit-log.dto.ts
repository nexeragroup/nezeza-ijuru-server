// src/modules/audit-logs/dto/create-audit-log.dto.ts
import {
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsObject,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AuditLogDeviceDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  deviceType!: string;

  @IsString()
  @IsNotEmpty()
  os!: string;

  @IsString()
  @IsNotEmpty()
  browser!: string;

  @IsString()
  ip!: string;
}

export class CreateAuditLogDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  method!: string;

  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsInt()
  statusCode?: number;

  @IsObject()
  @ValidateNested()
  @Type(() => AuditLogDeviceDto)
  device!: AuditLogDeviceDto;
}
