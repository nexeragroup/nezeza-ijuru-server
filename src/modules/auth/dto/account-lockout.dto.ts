import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AccountLockout {
  @ApiProperty({
    example: true,
  })
  @IsBoolean()
  isLocked!: boolean;

  /**
   * Optional automatic unlock timestamp.
   *
   * null / undefined can represent an administrative lock
   * with no automatic expiration.
   */
  @ApiPropertyOptional({
    example: '2026-09-15T12:00:00.000Z',
    nullable: true,
  })
  @IsOptional()
  @IsDateString({
    strict: true,
  })
  lockExpiresAt?: string | null;
}
