import { SetMetadata } from '@nestjs/common';
import {
  PERMISSIONS,
  type PermissionCode,
} from '../constants/permission.constants';

export const PERMISSIONS_KEY = 'auth:permissions' as const;
export type PermissionMetadata = readonly PermissionCode[];
type RequiredPermissions = [PermissionCode, ...PermissionCode[]];
const VALID_PERMISSIONS = new Set<PermissionCode>(Object.values(PERMISSIONS));
export const Permissions = (
  ...permissions: RequiredPermissions
): MethodDecorator & ClassDecorator => {
  const normalizedPermissions = [...new Set(permissions)];

  for (const permission of normalizedPermissions) {
    if (!VALID_PERMISSIONS.has(permission)) {
      throw new Error(
        `@Permissions() received an unknown permission: "${permission}"`,
      );
    }
  }

  const metadata: PermissionMetadata = Object.freeze(normalizedPermissions);

  return SetMetadata(PERMISSIONS_KEY, metadata);
};
