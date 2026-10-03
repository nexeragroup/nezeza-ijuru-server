import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import type {
  AuthenticatedUser,
  AuthRequest,
} from '../types/auth-request.interface';

type CurrentUserKey = keyof AuthenticatedUser;
type CurrentUserValue = AuthenticatedUser | AuthenticatedUser[CurrentUserKey];

export const CurrentUser = createParamDecorator<
  CurrentUserKey | undefined,
  CurrentUserValue
>(
  (
    property: CurrentUserKey | undefined,
    context: ExecutionContext,
  ): CurrentUserValue => {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authenticated user is not available');
    }

    if (property !== undefined) {
      return user[property];
    }

    return user;
  },
);
