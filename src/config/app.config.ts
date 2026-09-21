export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'centralized-api',
    publicUrl: process.env.APP_PUBLIC_URL ?? process.env.APP_URL,
    port: Number(process.env.PORT ?? 3000),
    environment: process.env.NODE_ENV ?? 'development',
    role: process.env.APP_ROLE ?? 'all',
  },
});
