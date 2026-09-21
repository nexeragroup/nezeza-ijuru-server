export default () => ({
  crypto: {
    enabled: process.env.CRYPTO_ENABLED === 'true',
    serverId: process.env.SERVER_ID ?? 'default-server',
    serverKeyId: process.env.SERVER_KEY_ID ?? 'client-encryption-v1',
    serverPrivateKeyPath: process.env.SERVER_PRIVATE_KEY_PATH ?? '',
    gatewayId: process.env.GATEWAY_ID ?? 'default-gateway',
    gatewayKeyId: process.env.GATEWAY_KEY_ID ?? 'gateway-encryption-v1',
    gatewayPublicKeyPath: process.env.GATEWAY_PUBLIC_KEY_PATH ?? '',
    messageTtlSeconds: Number(process.env.CRYPTO_MESSAGE_TTL_SECONDS ?? 120),
  },
});
