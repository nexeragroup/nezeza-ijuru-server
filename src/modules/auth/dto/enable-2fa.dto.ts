import { IsString, MaxLength, MinLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class EnableTwoFactor {
  @ApiProperty({
    description: 'Current account password',
    maxLength: 256,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
