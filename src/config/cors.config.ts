export default () => ({
  cors: {
    origins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    methods: (
      process.env.CORS_METHODS ?? 'GET,HEAD,PUT,PATCH,POST,DELETE'
    ).split(','),
    credentials: process.env.CORS_CREDENTIALS !== 'false',
    maxAge: Number(process.env.CORS_MAX_AGE ?? 86_400),
    allowedHeaders: (
      process.env.CORS_ALLOW_HEADERS ??
      'Origin,Content-Type,Accept,Authorization,X-XSRF-TOKEN'
    ).split(','),
    exposedHeaders: (
      process.env.CORS_EXPOSE_HEADERS ?? 'Content-Length,X-Request-Id'
    ).split(','),
  },
});
