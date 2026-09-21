export default () => ({
  gateway: {
    enabled: process.env.GATEWAY_ENABLED !== 'false',
    baseUrl: process.env.GATEWAY_BASE_URL ?? '',
    apiKey: process.env.GATEWAY_API_KEY ?? '',
    timeoutMs: Number(process.env.GATEWAY_TIMEOUT ?? 10_000),
  },
});
