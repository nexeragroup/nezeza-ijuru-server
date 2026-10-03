import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used to mark controllers or route handlers
 * as publicly accessible without authentication.
 */
export const IS_PUBLIC_KEY = 'auth:is-public' as const;

/**
 * Marks a controller or route handler as publicly accessible.
 *
 * Authentication guards should check this metadata before
 * attempting to authenticate the request.
 *
 * @example
 * @Public()
 * @Get('health')
 * healthCheck() {
 *   return { status: 'ok' };
 * }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
