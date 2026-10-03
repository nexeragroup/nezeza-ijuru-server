import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { InvitationRole } from '../../../common/enums/invitation-role.enum';

export class InvitationRoleDto {
  @ApiProperty({ enum: InvitationRole })
  @IsEnum(InvitationRole)
  role!: InvitationRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  roleLabel?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
