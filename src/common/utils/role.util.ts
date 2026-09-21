interface RoleLike {
  readonly name?: unknown;
}

export const normalizeRole = (role: unknown): string | null => {
  let value: string | null = null;

  if (typeof role === 'string') {
    value = role;
  } else if (isRoleLike(role) && typeof role.name === 'string') {
    value = role.name;
  }

  if (!value) {
    return null;
  }

  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

  return normalized || null;
};

export const normalizeRoles = (roles: unknown): string[] => {
  const values = Array.isArray(roles)
    ? roles
    : roles !== null && roles !== undefined
      ? [roles]
      : [];

  return [
    ...new Set(
      values.map(normalizeRole).filter((role): role is string => role !== null),
    ),
  ];
};

export const ELEVATED_ROLE_NAMES = new Set(['developer', 'super_admin']);

export const hasElevatedRole = (roles: unknown): boolean =>
  normalizeRoles(roles).some((role) => ELEVATED_ROLE_NAMES.has(role));

function isRoleLike(value: unknown): value is RoleLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
