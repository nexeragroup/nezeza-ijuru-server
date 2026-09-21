import Joi, { type ValidationOptions } from 'joi';

export const SECURE_MESSAGE_VERSION = 1 as const;
export const SECURE_MESSAGE_MAX_TTL_SECONDS = 120;
export const SECURE_MESSAGE_CLOCK_SKEW_SECONDS = 10;

const MAX_IDENTIFIER_LENGTH = 100;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_DATA_DEPTH = 32;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const unsafeObjectKeys = new Set(['__proto__', 'prototype', 'constructor']);

const validationOptions = {
  abortEarly: true,
  convert: false,
  stripUnknown: false,
} satisfies ValidationOptions;

export type SecureMessageKind = 'request' | 'response';

export interface SecureMessage {
  readonly version: typeof SECURE_MESSAGE_VERSION;
  readonly kind: SecureMessageKind;
  readonly requestId: string | null;
  readonly sender: string;
  readonly recipient: string;
  readonly operation: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly idempotencyKey?: string;
  readonly data: Record<string, unknown>;
}

export interface ExpectedSecureMessage {
  readonly kind: SecureMessageKind;
  readonly sender: string;
  readonly recipient: string;
  readonly operation: string;
  readonly requestId?: string;
  readonly requireIdempotencyKey?: boolean;
}

export class InvalidSecureMessageError extends Error {
  readonly code = 'INVALID_SECURE_MESSAGE';

  constructor(options?: ErrorOptions) {
    super('Invalid secure message.', options);
    this.name = 'InvalidSecureMessageError';
  }
}

const identifierSchema = Joi.string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .pattern(identifierPattern)
  .required();

const secureMessageSchema = Joi.object<SecureMessage>({
  version: Joi.number().integer().valid(SECURE_MESSAGE_VERSION).required(),
  kind: Joi.string().valid('request', 'response').required(),
  requestId: Joi.string().uuid().allow(null).required(),
  sender: identifierSchema,
  recipient: identifierSchema,
  operation: identifierSchema,
  issuedAt: Joi.number().integer().min(0).required(),
  expiresAt: Joi.number().integer().min(0).required(),
  idempotencyKey: Joi.string()
    .min(8)
    .max(MAX_IDEMPOTENCY_KEY_LENGTH)
    .pattern(idempotencyKeyPattern)
    .optional(),
  data: Joi.object().unknown(true).required(),
})
  .unknown(false)
  .required();

export function validateSecureMessage(
  value: unknown,
  expected: ExpectedSecureMessage,
  now = currentUnixTimestamp(),
): SecureMessage {
  const { error, value: validatedValue } = secureMessageSchema.validate(
    value,
    validationOptions,
  );

  if (error) {
    throw new InvalidSecureMessageError({ cause: error });
  }

  const message = validatedValue;

  try {
    assertExpectedMessage(message, expected);
    assertMessageLifetime(message, now);
    assertSafeObject(message.data, 0);
    return message;
  } catch (error) {
    if (error instanceof InvalidSecureMessageError) {
      throw error;
    }

    throw new InvalidSecureMessageError({ cause: error });
  }
}

export function assertSecureIdentifier(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    !identifierPattern.test(value) ||
    value.length > MAX_IDENTIFIER_LENGTH
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
}

function assertExpectedMessage(
  message: SecureMessage,
  expected: ExpectedSecureMessage,
): void {
  if (
    message.kind !== expected.kind ||
    message.sender !== expected.sender ||
    message.recipient !== expected.recipient ||
    message.operation !== expected.operation ||
    (message.kind === 'request' && message.requestId === null) ||
    (expected.requestId !== undefined &&
      message.requestId !== expected.requestId) ||
    (expected.requireIdempotencyKey && message.idempotencyKey === undefined)
  ) {
    throw new Error('Unexpected secure message context.');
  }
}

function assertMessageLifetime(message: SecureMessage, now: number): void {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    message.issuedAt > now + SECURE_MESSAGE_CLOCK_SKEW_SECONDS ||
    message.expiresAt <= now ||
    message.expiresAt <= message.issuedAt ||
    message.expiresAt - message.issuedAt > SECURE_MESSAGE_MAX_TTL_SECONDS
  ) {
    throw new Error('Invalid secure message lifetime.');
  }
}

function assertSafeObject(value: unknown, depth: number): void {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (depth > MAX_DATA_DEPTH) {
    throw new Error('Secure message data exceeds maximum nesting depth.');
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeObject(item, depth + 1);
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (unsafeObjectKeys.has(key)) {
      throw new Error('Secure message data contains unsafe property.');
    }
    assertSafeObject(nestedValue, depth + 1);
  }
}

function currentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1_000);
}
