export default () => ({
  security: {
    cookieSecret: process.env.SESSION_SECRET ?? '',
    csrfSecret: process.env.CSRF_SECRET ?? '',
    disablePostCsrf: process.env.DISABLE_POST_CSRF === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true',
    secureCookies: process.env.SECURE_COOKIES === 'true',
    cookieHttpOnly: process.env.COOKIE_HTTP_ONLY !== 'false',
    cookieSameSite: process.env.COOKIE_SAME_SITE ?? 'lax',
    sessionCookieName: process.env.SESSION_COOKIE_NAME,
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY ?? '',
  },
});
