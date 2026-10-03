export default () => ({
  security: {
    cookieSecret: process.env.SESSION_SECRET ?? 'change-me-in-production',
    csrfSecret: process.env.CSRF_SECRET ?? 'change-me-in-production',
    trustProxy: process.env.TRUST_PROXY === 'true',
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
    secureCookies: process.env.SECURE_COOKIES === 'true',
    cookieHttpOnly: process.env.COOKIE_HTTP_ONLY !== 'false',
    cookieSameSite: process.env.COOKIE_SAME_SITE ?? 'lax',
    sessionCookieName: process.env.SESSION_COOKIE_NAME,
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY ?? '',
  },
});
