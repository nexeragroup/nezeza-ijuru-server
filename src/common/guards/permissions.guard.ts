import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  PERMISSIONS_KEY,
  type PermissionMetadata,
} from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthRequest } from '../types/auth-request.interface';
import { hasElevatedRole } from '../utils/role.util';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<PermissionMetadata>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();

    const user = request.user;

    /*
     * JwtAuthGuard should normally reject unauthenticated requests
     * before this guard executes.
     *
     * This check keeps the authorization layer fail-closed in case
     * guard ordering or configuration changes.
     */
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    if (hasElevatedRole(user.roles)) {
      return true;
    }

    const userPermissions = new Set(user.permissions ?? []);

    const hasRequiredPermissions = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasRequiredPermissions) {
      /*
       * Do not expose exact missing permissions to the API client.
       * Detailed authorization failures can be recorded internally
       * through application audit/security logging instead.
       */
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to perform this action',
      });
    }

    return true;
  }
}
