import type { Request } from 'express';

export interface AuthenticatedUser {
  readonly sub: string;
  readonly username: string;
  readonly email?: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

export interface AuthRequest extends Request {
  readonly user?: AuthenticatedUser;
}
