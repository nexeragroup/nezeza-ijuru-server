export default () => ({
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? '',
    accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    maxFailedAttempts: Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 5),
    lockTimeMinutes: Number(process.env.AUTH_LOCK_TIME_MINUTES ?? 15),
    password: {
      algorithm: 'argon2id',
      memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 65_536),
      timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
      parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
      hashLength: Number(process.env.ARGON2_HASH_LENGTH ?? 32),
      saltLength: Number(process.env.ARGON2_SALT_LENGTH ?? 16),
    },
  },
});
