import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSettingDto {
  @IsObject()
  value!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
