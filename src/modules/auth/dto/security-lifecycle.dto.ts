import { Transform } from 'class-transformer';

import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class EmailRequestDto {
  @ApiProperty({
    example: 'user@example.com',
    maxLength: 254,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class TokenDto {
  /**
   * Intentionally bounded.
   *
   * Allows opaque random tokens as well as signed MFA
   * challenge tokens without permitting arbitrarily large input.
   */
  @ApiProperty({
    maxLength: 4096,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({
    minLength: 12,
    maxLength: 256,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  @Matches(/[A-Z]/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/[a-z]/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/[0-9]/, {
    message: 'Password must contain at least one number',
  })
  newPassword!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 256,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  confirmPassword!: string;
}

export class MfaLoginDto extends TokenDto {
  @ApiProperty({
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'MFA code must contain exactly 6 digits',
  })
  code!: string;
}
