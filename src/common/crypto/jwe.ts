import {
  CompactEncrypt,
  compactDecrypt,
  importPKCS8,
  importSPKI,
  type CompactJWEHeaderParameters,
} from 'jose';

export const JWE_ALGORITHM = 'RSA-OAEP-256' as const;
export const JWE_ENCRYPTION = 'A256GCM' as const;
export const JWE_CONTENT_TYPE = 'application/json' as const;

const RSA_ALGORITHM = 'RSA-OAEP';
const RSA_HASH = 'SHA-256';
const MIN_RSA_MODULUS_BITS = 3072;
const EXPECTED_PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]);
const MAX_KEY_ID_LENGTH = 256;

export const MAX_JWE_PLAINTEXT_BYTES = 1024 * 1024;

const MAX_COMPACT_JWE_LENGTH =
  Math.ceil((MAX_JWE_PLAINTEXT_BYTES * 4) / 3) + 16 * 1024;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf8', { fatal: true });
const allowedProtectedHeaders = new Set(['alg', 'enc', 'kid', 'cty']);

export class InvalidEncryptedEnvelopeError extends Error {
  readonly code = 'INVALID_ENCRYPTED_ENVELOPE';

  constructor(options?: ErrorOptions) {
    super('Invalid encrypted envelope.', options);
    this.name = 'InvalidEncryptedEnvelopeError';
  }
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  assertPem(pem, 'private');
  const key = await importPKCS8(pem, JWE_ALGORITHM, { extractable: false });
  assertRsaOaepKey(key, 'private', 'decrypt');
  return key;
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
  assertPem(pem, 'public');
  const key = await importSPKI(pem, JWE_ALGORITHM, { extractable: false });
  assertRsaOaepKey(key, 'public', 'encrypt');
  return key;
}

export type ImportedPrivateKey = Awaited<ReturnType<typeof importPrivateKey>>;
export type ImportedPublicKey = Awaited<ReturnType<typeof importPublicKey>>;

export async function encryptJson(
  value: unknown,
  key: ImportedPublicKey,
  keyId: string,
): Promise<string> {
  assertKeyId(keyId);
  assertRsaOaepKey(key, 'public', 'encrypt');

  const plaintext = serializeJson(value);
  if (plaintext.byteLength > MAX_JWE_PLAINTEXT_BYTES) {
    throw new RangeError('Encrypted payload exceeds the maximum allowed size');
  }

  try {
    return await new CompactEncrypt(plaintext)
      .setProtectedHeader({
        alg: JWE_ALGORITHM,
        enc: JWE_ENCRYPTION,
        kid: keyId,
        cty: JWE_CONTENT_TYPE,
      })
      .encrypt(key);
  } catch (error) {
    throw new Error('Failed to encrypt payload.', { cause: error });
  }
}

export async function decryptJson(
  token: string,
  key: ImportedPrivateKey,
  expectedKeyId: string,
): Promise<unknown> {
  assertKeyId(expectedKeyId);
  assertRsaOaepKey(key, 'private', 'decrypt');

  try {
    assertCompactJwe(token);

    const { plaintext, protectedHeader } = await compactDecrypt(token, key, {
      keyManagementAlgorithms: [JWE_ALGORITHM],
      contentEncryptionAlgorithms: [JWE_ENCRYPTION],
    });

    assertProtectedHeader(protectedHeader, expectedKeyId);

    if (plaintext.byteLength > MAX_JWE_PLAINTEXT_BYTES) {
      throw new Error('Decrypted payload exceeds the maximum allowed size.');
    }

    return deserializeJson(plaintext);
  } catch (error) {
    if (error instanceof InvalidEncryptedEnvelopeError) {
      throw error;
    }

    throw new InvalidEncryptedEnvelopeError({ cause: error });
  }
}

function serializeJson(value: unknown): Uint8Array {
  let json: string | undefined;

  try {
    json = JSON.stringify(value);
  } catch (error) {
    throw new TypeError('Payload must be JSON serializable.', { cause: error });
  }

  if (json === undefined) {
    throw new TypeError('Payload must be JSON serializable.');
  }

  return textEncoder.encode(json);
}

function deserializeJson(plaintext: Uint8Array): unknown {
  return JSON.parse(textDecoder.decode(plaintext)) as unknown;
}

function assertProtectedHeader(
  header: CompactJWEHeaderParameters,
  expectedKeyId: string,
): void {
  if (
    header.alg !== JWE_ALGORITHM ||
    header.enc !== JWE_ENCRYPTION ||
    header.kid !== expectedKeyId ||
    header.cty !== JWE_CONTENT_TYPE
  ) {
    throw new Error('Unexpected protected header.');
  }

  const headerNames = Object.keys(header);
  if (
    headerNames.length !== allowedProtectedHeaders.size ||
    headerNames.some((headerName) => !allowedProtectedHeaders.has(headerName))
  ) {
    throw new Error('Unsupported protected header.');
  }
}

function assertCompactJwe(token: string): void {
  if (
    typeof token !== 'string' ||
    !token ||
    token.length > MAX_COMPACT_JWE_LENGTH
  ) {
    throw new InvalidEncryptedEnvelopeError();
  }

  const segments = token.split('.');
  if (segments.length !== 5 || segments.some((segment) => !segment)) {
    throw new InvalidEncryptedEnvelopeError();
  }
}

function assertKeyId(keyId: string): void {
  if (
    typeof keyId !== 'string' ||
    !keyId ||
    keyId.length > MAX_KEY_ID_LENGTH ||
    /\p{Cc}/u.test(keyId)
  ) {
    throw new TypeError('Invalid encryption key ID.');
  }
}

function assertPem(pem: string, type: 'private' | 'public'): void {
  const expectedPrefix =
    type === 'private'
      ? '-----BEGIN PRIVATE KEY-----'
      : '-----BEGIN PUBLIC KEY-----';

  if (typeof pem !== 'string' || !pem.startsWith(expectedPrefix)) {
    throw new TypeError(
      `${type === 'private' ? 'Private' : 'Public'} key must use ${
        type === 'private' ? 'PKCS#8' : 'SPKI'
      } PEM format.`,
    );
  }
}

function assertRsaOaepKey(
  key: CryptoKey,
  expectedType: 'public' | 'private',
  expectedUsage: 'encrypt' | 'decrypt',
): void {
  if (!key || key.type !== expectedType) {
    throw new TypeError(`Expected an RSA ${expectedType} key.`);
  }

  const algorithm = key.algorithm as RsaHashedKeyAlgorithm;
  if (
    algorithm.name !== RSA_ALGORITHM ||
    algorithm.modulusLength < MIN_RSA_MODULUS_BITS ||
    algorithm.hash?.name !== RSA_HASH ||
    !hasExpectedPublicExponent(algorithm.publicExponent) ||
    !key.usages.includes(expectedUsage) ||
    (expectedType === 'private' && key.extractable)
  ) {
    throw new TypeError('Invalid RSA-OAEP encryption key.');
  }
}

function hasExpectedPublicExponent(exponent: Uint8Array): boolean {
  return (
    exponent.byteLength === EXPECTED_PUBLIC_EXPONENT.byteLength &&
    exponent.every((value, index) => value === EXPECTED_PUBLIC_EXPONENT[index])
  );
}
