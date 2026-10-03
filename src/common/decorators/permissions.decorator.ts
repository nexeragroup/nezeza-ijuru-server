import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'auth:permissions' as const;

export type Permission = string;

type RequiredPermissions = [Permission, ...Permission[]];

export const Permissions = (...permissions: RequiredPermissions) => {
  const normalizedPermissions = [
    ...new Set(permissions.map((permission) => permission.trim())),
  ];

  if (normalizedPermissions.some((permission) => permission.length === 0)) {
    throw new Error('@Permissions() cannot contain empty permission values.');
  }

  return SetMetadata(PERMISSIONS_KEY, Object.freeze(normalizedPermissions));
};
