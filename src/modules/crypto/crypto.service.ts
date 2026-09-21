import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';

import {
  decryptJson,
  encryptJson,
  importPrivateKey,
  importPublicKey,
  type ImportedPrivateKey,
  type ImportedPublicKey,
} from '../../common/crypto/jwe';
import {
  SECURE_MESSAGE_MAX_TTL_SECONDS,
  SECURE_MESSAGE_VERSION,
  assertSecureIdentifier,
  validateSecureMessage,
  type SecureMessage,
} from '../../common/crypto/secure-message';
import { GatewayReplayProtectionService } from './gateway-replay-protection.service';

interface CryptoRuntimeConfig {
  readonly serverId: string;
  readonly serverKeyId: string;
  readonly serverPrivateKeyPath: string;
  readonly gatewayId: string;
  readonly gatewayKeyId: string;
  readonly gatewayPublicKeyPath: string;
  readonly messageTtlSeconds: number;
}

export interface EncryptedGatewayRequest {
  readonly requestId: string;
  readonly encrypted: string;
}

export interface GatewayResponseInput {
  readonly operation: string;
  readonly requestId: string;
  readonly encrypted: string;
}

@Injectable()
export class GatewayCryptoService implements OnModuleInit {
  readonly enabled: boolean;
  private readonly settings: CryptoRuntimeConfig | null;
  private serverPrivateKey: ImportedPrivateKey | null = null;
  private gatewayPublicKey: ImportedPublicKey | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly replay: GatewayReplayProtectionService,
  ) {
    this.enabled = config.get<boolean>('crypto.enabled', false);
    this.settings = this.enabled ? this.loadRuntimeConfig() : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const settings = this.getSettings();

    try {
      const [serverPrivateKeyPem, gatewayPublicKeyPem] = await Promise.all([
        readFile(settings.serverPrivateKeyPath, 'utf8'),
        readFile(settings.gatewayPublicKeyPath, 'utf8'),
      ]);

      const [serverPrivateKey, gatewayPublicKey] = await Promise.all([
        importPrivateKey(serverPrivateKeyPem),
        importPublicKey(gatewayPublicKeyPem),
      ]);

      this.serverPrivateKey = serverPrivateKey;
      this.gatewayPublicKey = gatewayPublicKey;
    } catch (error) {
      throw new Error(
        'Gateway encryption key initialization failed. Verify the configured RSA key material.',
        { cause: error },
      );
    }
  }

  async encryptGatewayRequest(
    operation: string,
    data: Record<string, unknown>,
    options: {
      readonly idempotencyKey?: string;
      readonly requestId?: string;
    } = {},
  ): Promise<EncryptedGatewayRequest> {
    const { gatewayPublicKey, settings } = this.getReadyState();
    assertSecureIdentifier(operation, 'Gateway operation');

    const requestId = options.requestId ?? randomUUID();
    const now = Math.floor(Date.now() / 1_000);
    const expiresAt = now + settings.messageTtlSeconds;

    const message: SecureMessage = validateSecureMessage(
      {
        version: SECURE_MESSAGE_VERSION,
        kind: 'request',
        requestId,
        sender: settings.serverId,
        recipient: settings.gatewayId,
        operation,
        issuedAt: now,
        expiresAt,
        ...(options.idempotencyKey
          ? {
              idempotencyKey: options.idempotencyKey,
            }
          : {}),
        data,
      },
      {
        kind: 'request',
        sender: settings.serverId,
        recipient: settings.gatewayId,
        operation,
        requestId,
      },
      now,
    );

    const encrypted = await encryptJson(
      message,
      gatewayPublicKey,
      settings.gatewayKeyId,
    );

    await this.replay.reserveOutgoing(
      settings.serverId,
      settings.gatewayId,
      requestId,
      expiresAt,
    );

    return { requestId, encrypted };
  }

  async decryptGatewayResponse(
    input: GatewayResponseInput,
  ): Promise<Record<string, unknown>> {
    const { serverPrivateKey, settings } = this.getReadyState();
    assertSecureIdentifier(input.operation, 'Gateway operation');

    const decrypted = await decryptJson(
      input.encrypted,
      serverPrivateKey,
      settings.serverKeyId,
    );

    const message = validateSecureMessage(decrypted, {
      kind: 'response',
      sender: settings.gatewayId,
      recipient: settings.serverId,
      operation: input.operation,
      requestId: input.requestId,
    });

    await this.replay.consumeResponse(
      settings.serverId,
      settings.gatewayId,
      input.requestId,
    );

    return message.data;
  }

  private getReadyState(): {
    readonly settings: CryptoRuntimeConfig;
    readonly serverPrivateKey: ImportedPrivateKey;
    readonly gatewayPublicKey: ImportedPublicKey;
  } {
    if (!this.enabled) {
      throw new Error('Gateway encryption is disabled.');
    }

    const settings = this.getSettings();
    if (!this.serverPrivateKey || !this.gatewayPublicKey) {
      throw new Error('Gateway encryption is not initialized.');
    }

    return {
      settings,
      serverPrivateKey: this.serverPrivateKey,
      gatewayPublicKey: this.gatewayPublicKey,
    };
  }

  private getSettings(): CryptoRuntimeConfig {
    if (!this.settings) {
      throw new Error('Gateway encryption configuration is unavailable.');
    }

    return this.settings;
  }

  private loadRuntimeConfig(): CryptoRuntimeConfig {
    const messageTtlSeconds = this.config.getOrThrow<number>(
      'crypto.messageTtlSeconds',
    );

    if (
      !Number.isSafeInteger(messageTtlSeconds) ||
      messageTtlSeconds < 1 ||
      messageTtlSeconds > SECURE_MESSAGE_MAX_TTL_SECONDS
    ) {
      throw new Error('crypto.messageTtlSeconds is invalid.');
    }

    const settings = {
      serverId: this.getRequiredString('crypto.serverId'),
      serverKeyId: this.getRequiredString('crypto.serverKeyId'),
      serverPrivateKeyPath: this.getRequiredString(
        'crypto.serverPrivateKeyPath',
      ),
      gatewayId: this.getRequiredString('crypto.gatewayId'),
      gatewayKeyId: this.getRequiredString('crypto.gatewayKeyId'),
      gatewayPublicKeyPath: this.getRequiredString(
        'crypto.gatewayPublicKeyPath',
      ),
      messageTtlSeconds,
    };

    assertSecureIdentifier(settings.serverId, 'crypto.serverId');
    assertSecureIdentifier(settings.gatewayId, 'crypto.gatewayId');

    if (settings.serverId === settings.gatewayId) {
      throw new Error('crypto.serverId and crypto.gatewayId must differ.');
    }

    return settings;
  }

  private getRequiredString(key: string): string {
    const value = this.config.getOrThrow<string>(key).trim();
    if (!value) {
      throw new Error(`${key} must not be empty.`);
    }
    return value;
  }
}
