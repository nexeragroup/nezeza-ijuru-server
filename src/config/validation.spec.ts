import { validationSchema } from './validation';

describe('storage environment validation', () => {
  it('uses a local provider by default', () => {
    const result = validationSchema.validate({});

    expect(result.error).toBeUndefined();
    expect(result.value.STORAGE_PROVIDER).toBe('local');
    expect(result.value.STORAGE_LOCAL_PATH).toBe('./storage');
    expect(result.value.STORAGE_MAX_FILE_SIZE_BYTES).toBe(26_214_400);
  });

  it('rejects unsupported storage providers', () => {
    const result = validationSchema.validate({ STORAGE_PROVIDER: 'invalid' });

    expect(result.error).toBeDefined();
  });
});
