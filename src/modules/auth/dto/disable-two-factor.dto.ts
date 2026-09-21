import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class DisableTwoFactorDto {
  @ApiProperty({
    description: 'Current account password',
    maxLength: 256,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  @ApiProperty({
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Two-factor authentication code must contain exactly 6 digits',
  })
  code!: string;
}
