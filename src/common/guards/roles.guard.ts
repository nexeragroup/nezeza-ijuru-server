import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthRequest } from '../types/auth-request.interface';
import { AppRole } from '../constants/roles.constant';
import { hasElevatedRole, normalizeRoles } from '../utils/role.util';

@Injectable()
export class RolesGuard implements CanActivate {
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

    const requiredRoles = this.reflector.getAllAndOverride<readonly AppRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();

    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }

    if (hasElevatedRole(user.roles)) {
      return true;
    }

    const userRoles = new Set(normalizeRoles(user.roles));

    const hasRequiredRole = requiredRoles.some((role) =>
      userRoles.has(role.toLowerCase()),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'You do not have the required role to perform this action',
      });
    }

    return true;
  }
}
