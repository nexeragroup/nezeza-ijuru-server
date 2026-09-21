export const normalizeOptionalString = (
  value?: string | null,
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized || undefined;
};

export const normalizeName = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');

  return normalized || undefined;
};

export const normalizeCode = (value: string): string => {
  if (typeof value !== 'string') {
    throw new TypeError('Code must be a string');
  }

  return value.normalize('NFKC').trim().toLocaleUpperCase('en-US');
};

/**
 * This application treats email identifiers as
 * case-insensitive.
 */
export const normalizeEmail = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLocaleLowerCase('en-US');

  return normalized || undefined;
};
