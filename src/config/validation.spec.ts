import { validationSchema } from './validation';

describe('gateway crypto environment validation', () => {
  it('allows a shared parent domain for the cross-origin CSRF cookie', () => {
    const result = validationSchema.validate({
      CSRF_COOKIE_DOMAIN: '.nezezaijuru.org',
    });

    expect(result.error).toBeUndefined();
  });

  it('keeps encrypted gateway transport opt-in', () => {
    const result = validationSchema.validate({ CRYPTO_ENABLED: false });

    expect(result.error).toBeUndefined();
    expect(result.value.SERVER_KEY_ID).toBe('client-encryption-v1');
  });

  it('requires a complete peer configuration when encrypted transport is enabled', () => {
    const incomplete = validationSchema.validate({ CRYPTO_ENABLED: true });
    const configured = validationSchema.validate({
      CRYPTO_ENABLED: true,
      SERVER_PRIVATE_KEY_PATH: '/run/secrets/server-private.pem',
      GATEWAY_PUBLIC_KEY_PATH: '/run/secrets/gateway-public.pem',
      GATEWAY_BASE_URL: 'https://gateway.example.test/api/v1',
      GATEWAY_API_KEY: 'a'.repeat(32),
    });

    expect(incomplete.error).toBeDefined();
    expect(configured.error).toBeUndefined();
  });

  it('allows production startup before mail transport is configured', () => {
    const result = validationSchema.validate({
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(32),
      SESSION_SECRET: 's'.repeat(32),
      CSRF_SECRET: 'c'.repeat(32),
      MFA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
      SECURE_COOKIES: true,
      HELMET_ENABLED: true,
      DATABASE_SYNCHRONIZE: false,
      DATABASE_SSL: false,
      DATABASE_SSL_REJECT_UNAUTHORIZED: true,
      MAIL_TLS_REJECT_UNAUTHORIZED: true,
      CORS_ORIGIN: 'https://example.test',
    });

    expect(result.error).toBeUndefined();
  });
});
