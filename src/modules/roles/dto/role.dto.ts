import { Transform } from 'class-transformer';

import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import {
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_NAME_PATTERN,
  ROLE_PERMISSION_LIMIT,
} from '../../../common/constants/roles.constant';

export class NewRole {
  @ApiProperty({
    example: 'SALES_MANAGER',
    maxLength: 100,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.trim().replace(/\s+/g, '_').toUpperCase()
      : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(ROLE_NAME_PATTERN, {
    message:
      'Role name must use uppercase letters, numbers, and underscores such as SALES_MANAGER',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'Manages sales operations and sales reports.',
    maxLength: ROLE_DESCRIPTION_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(ROLE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ROLE_PERMISSION_LIMIT)
  @IsUUID('4', {
    each: true,
  })
  permissionIds?: string[];
}

export class UpdateRole extends PartialType(NewRole) {}

/**
 * Assigns one or more roles to a user.
 */
export class AssignRolesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('4', {
    each: true,
  })
  roleIds!: string[];
}

/**
 * Adds or removes permissions from a role.
 */
export class AssignPermissionsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(ROLE_PERMISSION_LIMIT)
  @IsUUID('4', {
    each: true,
  })
  permissionIds!: string[];
}
