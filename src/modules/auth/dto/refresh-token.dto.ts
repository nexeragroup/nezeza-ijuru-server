import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

/**
 * Intended only for non-browser clients where refresh tokens
 * cannot be transported using the application's HttpOnly cookie.
 *
 * Browser clients should use the HttpOnly refresh_token cookie.
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
    maxLength: 8192,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  refreshToken!: string;
}
