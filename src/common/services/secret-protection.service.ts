import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

const CURRENT_VERSION = 'v2';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const MAX_SECRET_BYTES = 16_384;
const MAX_ENVELOPE_LENGTH = 65_536;

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

@Injectable()
export class SecretProtectionService {
  private readonly activeKeyId: string;

  private readonly keys = new Map<string, Buffer>();

  constructor(private readonly config: ConfigService) {
    this.activeKeyId = this.getActiveKeyId();

    const configuredKey = this.config.getOrThrow<unknown>(
      'security.mfaEncryptionKey',
    );

    const activeKey = this.loadKey(configuredKey, 'security.mfaEncryptionKey');

    this.keys.set(this.activeKeyId, activeKey);

    this.loadPreviousKeys();
  }

  encrypt(value: string): string {
    this.assertPlaintext(value);

    const key = this.keys.get(this.activeKeyId);

    if (!key) {
      throw new Error('Active encryption key is unavailable');
    }

    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const aad = this.createAad(CURRENT_VERSION, this.activeKeyId);

    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),

      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return [
      CURRENT_VERSION,
      this.activeKeyId,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string): string {
    if (
      typeof envelope !== 'string' ||
      !envelope ||
      envelope.length > MAX_ENVELOPE_LENGTH
    ) {
      throw new Error('Encrypted secret is invalid');
    }

    const parts = envelope.split('.');

    try {
      if (parts[0] === 'v2') {
        return this.decryptV2(parts);
      }

      /*
       * Temporary compatibility with the original:
       *
       * v1.iv.tag.ciphertext
       *
       * Re-encrypt v1 values as v2 after successful use.
       */
      if (parts[0] === 'v1') {
        return this.decryptV1(parts);
      }
    } catch {
      /*
       * Do not reveal whether failure came from:
       *
       * - unknown key
       * - invalid authentication tag
       * - malformed ciphertext
       * - tampering
       */
      throw new Error('Encrypted secret could not be decrypted');
    }

    throw new Error('Encrypted secret could not be decrypted');
  }

  private decryptV2(parts: string[]): string {
    if (parts.length !== 5) {
      throw new Error('Invalid envelope');
    }

    const [version, keyId, encodedIv, encodedTag, encodedCiphertext] = parts;

    if (version !== CURRENT_VERSION || !KEY_ID_PATTERN.test(keyId)) {
      throw new Error('Invalid envelope');
    }

    const key = this.keys.get(keyId);

    if (!key) {
      throw new Error('Unknown key');
    }

    const iv = Buffer.from(encodedIv, 'base64url');

    const tag = Buffer.from(encodedTag, 'base64url');

    const ciphertext = Buffer.from(encodedCiphertext, 'base64url');

    this.validateCipherParts(iv, tag, ciphertext);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAAD(this.createAad(version, keyId));

    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),

      decipher.final(),
    ]).toString('utf8');
  }

  private decryptV1(parts: string[]): string {
    if (parts.length !== 4) {
      throw new Error('Invalid legacy envelope');
    }

    const [, encodedIv, encodedTag, encodedCiphertext] = parts;

    const iv = Buffer.from(encodedIv, 'base64url');

    const tag = Buffer.from(encodedTag, 'base64url');

    const ciphertext = Buffer.from(encodedCiphertext, 'base64url');

    this.validateCipherParts(iv, tag, ciphertext);

    /*
     * Legacy v1 did not contain a key ID.
     * Try every configured key so old values survive
     * one or more key rotations.
     */
    for (const key of this.keys.values()) {
      try {
        const decipher = createDecipheriv(ALGORITHM, key, iv, {
          authTagLength: AUTH_TAG_LENGTH,
        });

        decipher.setAuthTag(tag);

        return Buffer.concat([
          decipher.update(ciphertext),

          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Try next historical key.
      }
    }

    throw new Error('Legacy decryption failed');
  }

  private loadPreviousKeys(): void {
    const configured = this.config.get<string>(
      'security.mfaPreviousEncryptionKeys',
      '',
    );

    if (!configured.trim()) {
      return;
    }

    for (const entry of configured.split(',')) {
      const separator = entry.indexOf(':');

      if (separator <= 0) {
        throw new Error('Invalid MFA previous encryption key configuration');
      }

      const keyId = entry.slice(0, separator).trim();

      const encoded = entry.slice(separator + 1).trim();

      if (!KEY_ID_PATTERN.test(keyId)) {
        throw new Error(`Invalid MFA encryption key ID "${keyId}"`);
      }

      if (this.keys.has(keyId)) {
        throw new Error(`Duplicate MFA encryption key ID "${keyId}"`);
      }

      this.keys.set(keyId, this.loadKey(encoded, `MFA key ${keyId}`));
    }
  }

  private getActiveKeyId(): string {
    const keyId = this.config.get<string>(
      'security.mfaEncryptionKeyId',
      'primary',
    );

    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new Error('security.mfaEncryptionKeyId is invalid');
    }

    return keyId;
  }

  private loadKey(value: unknown, name: string): Buffer {
    /*
     * Configuration may already have decoded the key.
     */
    if (Buffer.isBuffer(value)) {
      if (value.length !== KEY_LENGTH) {
        throw new Error(`${name} must contain exactly ${KEY_LENGTH} bytes`);
      }

      /*
       * Return a copy rather than retaining a reference to
       * configuration-owned mutable memory.
       */
      return Buffer.from(value);
    }

    if (typeof value !== 'string') {
      throw new Error(`${name} must be a base64/base64url string or a Buffer`);
    }

    const encoded = value.trim();

    if (!encoded) {
      throw new Error(`${name} cannot be empty`);
    }

    let key: Buffer;

    try {
      /*
       * Node's base64 decoder also accepts the Base64URL
       * alphabet, so this handles both representations.
       */
      key = Buffer.from(encoded, 'base64');
    } catch {
      throw new Error(`${name} must be a valid base64/base64url encoded key`);
    }

    if (key.length !== KEY_LENGTH) {
      throw new Error(`${name} must decode to exactly ${KEY_LENGTH} bytes`);
    }

    /*
     * Reject malformed Base64 values that Buffer.from()
     * could otherwise decode permissively.
     */
    const canonical = key.toString('base64url');

    const suppliedCanonical = encoded
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    if (canonical !== suppliedCanonical) {
      throw new Error(`${name} is not a valid canonical base64/base64url key`);
    }

    return key;
  }

  private createAad(version: string, keyId: string): Buffer {
    return Buffer.from(`mfa-secret:${version}:${keyId}`, 'utf8');
  }

  private validateCipherParts(
    iv: Buffer,
    tag: Buffer,
    ciphertext: Buffer,
  ): void {
    if (
      iv.length !== IV_LENGTH ||
      tag.length !== AUTH_TAG_LENGTH ||
      ciphertext.length === 0 ||
      ciphertext.length > MAX_SECRET_BYTES
    ) {
      throw new Error('Invalid encrypted secret');
    }
  }

  private assertPlaintext(value: string): void {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError('Secret must be a non-empty string');
    }

    if (Buffer.byteLength(value, 'utf8') > MAX_SECRET_BYTES) {
      throw new RangeError('Secret exceeds maximum supported size');
    }
  }
}
