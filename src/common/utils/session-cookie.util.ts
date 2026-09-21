export interface SessionCookieNameInput {
  readonly applicationName: string;
  readonly configuredCookieName?: string;
  readonly secureCookies: boolean;
}

/**
 * Resolves the Express session cookie name from the same inputs used by
 * SessionMiddleware. Controllers clearing a session cookie must use this
 * helper rather than maintaining a separate default.
 */
export function resolveSessionCookieName({
  applicationName,
  configuredCookieName,
  secureCookies,
}: SessionCookieNameInput): string {
  const configured = configuredCookieName?.trim();
  if (configured) {
    return configured;
  }

  const normalizedApplicationName = sanitizeSessionName(applicationName);
  return secureCookies
    ? `__Host-${normalizedApplicationName}.sid`
    : `${normalizedApplicationName}.sid`;
}

function sanitizeSessionName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  return normalized || 'application';
}
