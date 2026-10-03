export default () => {
  const environment = process.env.NODE_ENV ?? 'development';
  const port = Number(process.env.PORT ?? 3000);
  const appUrl = process.env.APP_URL?.replace(/\/$/, '') ?? '';

  return {
    app: {
      name: process.env.APP_NAME ?? 'centralized-api',
      version: process.env.APP_VERSION ?? '0.0.1',
      host: process.env.HOST ?? '0.0.0.0',
      port,
      publicUrl:
        environment === 'development' && appUrl ? `${appUrl}:${port}` : appUrl,
      environment,
      role: process.env.APP_ROLE ?? 'all',
    },
  };
};
