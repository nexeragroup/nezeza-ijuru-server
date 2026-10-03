import appConfig from './app.config';

describe('appConfig', () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalAppUrl = process.env.APP_URL;
  const originalPort = process.env.PORT;

  afterEach(() => {
    restoreEnvironment('NODE_ENV', originalEnvironment);
    restoreEnvironment('APP_URL', originalAppUrl);
    restoreEnvironment('PORT', originalPort);
  });

  it('derives the local public URL port from PORT', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost';
    process.env.PORT = '3300';

    expect(appConfig().app.publicUrl).toBe('http://localhost:3300');
  });
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
