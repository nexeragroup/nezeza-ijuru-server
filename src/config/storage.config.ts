export default () => ({
  storage: {
    enabled: process.env.STORAGE_ENABLED === 'true',
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    bucket: process.env.STORAGE_BUCKET,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    tls: process.env.STORAGE_TLS !== 'false',
    presignedExpirySeconds: Number(
      process.env.STORAGE_PRESIGNED_EXPIRY_SECONDS ?? 900,
    ),
  },
});
