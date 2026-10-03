import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const CSRF_TOKEN_VERSION = 'v1';

const CSRF_NONCE_BYTES = 32;

const MAX_TOKEN_LENGTH = 512;
const MIN_SECRET_BYTES = 32;

/*
 * 32 random bytes encoded as base64url = 43 characters.
 * SHA-256 HMAC encoded as base64url = 43 characters.
 *
 * v1.<nonce>.<signature>
 */
const VERSIONED_TOKEN_PATTERN =
  /^v1\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

/*
 * Temporary compatibility with the previous format:
 *
 * <48-char hex nonce>.<64-char hex signature>
 */
const LEGACY_TOKEN_PATTERN = /^([a-f0-9]{48})\.([a-f0-9]{64})$/;

export const generateCsrfToken = (
  sessionId: string,
  secret: string,
): string => {
  assertSessionId(sessionId);
  assertSecret(secret);

  const nonce = randomBytes(CSRF_NONCE_BYTES).toString('base64url');

  const signature = createVersionedSignature(sessionId, nonce, secret).toString(
    'base64url',
  );

  return [CSRF_TOKEN_VERSION, nonce, signature].join('.');
};

export const validCsrfToken = (
  token: string,
  sessionId: string,
  secret: string,
): boolean => {
  if (
    typeof token !== 'string' ||
    !token ||
    token.length > MAX_TOKEN_LENGTH ||
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof secret !== 'string' ||
    Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES
  ) {
    return false;
  }

  const versionedMatch = VERSIONED_TOKEN_PATTERN.exec(token);

  if (versionedMatch) {
    const nonce = versionedMatch[1];

    const providedSignature = Buffer.from(versionedMatch[2], 'base64url');

    const expectedSignature = createVersionedSignature(
      sessionId,
      nonce,
      secret,
    );

    return safeBufferEqual(providedSignature, expectedSignature);
  }

  /*
   * Migration path for tokens created by the
   * previous implementation.
   *
   * Remove this branch after existing sessions
   * have naturally expired.
   */
  const legacyMatch = LEGACY_TOKEN_PATTERN.exec(token);

  if (!legacyMatch) {
    return false;
  }

  const [, nonce, signature] = legacyMatch;

  const expected = createHmac('sha256', secret)
    .update(`${sessionId}:${nonce}`)
    .digest('hex');

  return csrfTokensMatch(signature, expected);
};

/**
 * Constant-time comparison for CSRF values.
 *
 * Hashing both inputs first guarantees timingSafeEqual()
 * always receives equal-length buffers.
 */
export const csrfTokensMatch = (left: string, right: string): boolean => {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string' ||
    left.length > MAX_TOKEN_LENGTH ||
    right.length > MAX_TOKEN_LENGTH
  ) {
    return false;
  }

  const leftDigest = createHash('sha256').update(left, 'utf8').digest();

  const rightDigest = createHash('sha256').update(right, 'utf8').digest();

  return timingSafeEqual(leftDigest, rightDigest);
};

function createVersionedSignature(
  sessionId: string,
  nonce: string,
  secret: string,
): Buffer {
  /*
   * JSON encoding removes ambiguity that could otherwise
   * arise from delimiter-based concatenation.
   *
   * The session ID itself never appears in the resulting
   * token; only the HMAC depends on it.
   */
  const message = JSON.stringify([CSRF_TOKEN_VERSION, sessionId, nonce]);

  return createHmac('sha256', secret).update(message, 'utf8').digest();
}

function safeBufferEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function assertSessionId(sessionId: string): void {
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new TypeError('sessionId is required');
  }

  if (sessionId.length > 2_048) {
    throw new RangeError('sessionId exceeds maximum supported length');
  }
}

function assertSecret(secret: string): void {
  if (
    typeof secret !== 'string' ||
    Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES
  ) {
    throw new Error('CSRF secret must contain at least 32 bytes');
  }
}
