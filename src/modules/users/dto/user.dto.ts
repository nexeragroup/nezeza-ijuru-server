import { Transform, Type } from 'class-transformer';

import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,149}$/;

function normalizeName(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

function normalizeIdentifier(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class NewUser {
  @ApiProperty({
    example: 'John',
  })
  @Transform(({ value }) => normalizeName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  firstname!: string;

  @ApiProperty({
    example: 'Doe',
  })
  @Transform(({ value }) => normalizeName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  lastname!: string;

  @ApiProperty({
    example: 'john.doe',
  })
  @Transform(({ value }) => normalizeIdentifier(value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  @Matches(USERNAME_PATTERN, {
    message:
      'Username may contain lowercase letters, numbers, dots, underscores, and hyphens',
  })
  username!: string;

  @ApiProperty({
    example: 'john@example.com',
  })
  @Transform(({ value }) => normalizeIdentifier(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 256,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 256,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  confirm!: string;

  /*
   * Sent as a string to preserve PostgreSQL bigint precision.
   */
  @ApiPropertyOptional({
    example: '123456789012345',
    type: String,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    return String(value).trim();
  })
  @IsOptional()
  @IsNumberString({
    no_symbols: true,
  })
  @MaxLength(19)
  reference?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
  })
  roles?: string[];
}

export class UpdateUser {
  @Transform(({ value }) => normalizeName(value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  firstname?: string;

  @Transform(({ value }) => normalizeName(value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  lastname?: string;

  @Transform(({ value }) => normalizeIdentifier(value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @Transform(({ value }) => normalizeIdentifier(value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  @Matches(USERNAME_PATTERN, {
    message:
      'Username may contain lowercase letters, numbers, dots, underscores, and hyphens',
  })
  username?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
  })
  roles?: string[];
}

export class ListUsersQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
