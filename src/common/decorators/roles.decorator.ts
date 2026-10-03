import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'auth:roles' as const;

export type Role = string;
type RequiredRoles = [Role, ...Role[]];

/**
 * Defines the roles required to access a controller or route handler.
 *
 * At least one role must be provided.
 *
 * @example
 * @Roles('admin')
 *
 * @example
 * @Roles('admin', 'manager')
 */
export const Roles = (...roles: RequiredRoles) => {
  const normalizedRoles = [...new Set(roles.map((role) => role.trim()))];

  if (normalizedRoles.some((role) => role.length === 0)) {
    throw new Error('@Roles() cannot contain empty role values.');
  }

  return SetMetadata(ROLES_KEY, Object.freeze(normalizedRoles));
};
