import { IsString, Matches } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFactor {
  @ApiProperty({
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Two-factor authentication code must contain exactly 6 digits',
  })
  code!: string;
}
