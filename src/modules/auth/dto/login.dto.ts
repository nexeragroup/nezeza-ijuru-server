import { Transform } from 'class-transformer';

import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class Login {
  @ApiProperty({
    example: 'user@example.com',
    maxLength: 254,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  usernameOrEmail!: string;

  /**
   * Never trim or transform passwords.
   *
   * Leading/trailing whitespace may legitimately be part
   * of a user's password.
   */
  @ApiProperty({
    maxLength: 256,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
