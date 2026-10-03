import { resolveSessionCookieName } from './session-cookie.util';

describe('resolveSessionCookieName', () => {
  it('uses the configured name when one is supplied', () => {
    expect(
      resolveSessionCookieName({
        applicationName: 'Central API',
        configuredCookieName: 'central.sid',
        secureCookies: true,
      }),
    ).toBe('central.sid');
  });

  it('derives the secure middleware default when no name is configured', () => {
    expect(
      resolveSessionCookieName({
        applicationName: 'Central API',
        secureCookies: true,
      }),
    ).toBe('__Host-central-api.sid');
  });
});
