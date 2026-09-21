export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  DEVELOPER: 'developer',
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
  AUDITOR: 'auditor',
  SUPPORT: 'support',
  USER: 'user',
} as const;
export type AppRole = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,99}$/;
export const ROLE_DESCRIPTION_MAX_LENGTH = 500;
export const ROLE_PERMISSION_LIMIT = 200;
export const ROLE_BULK_LIMIT = 100;
