import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

export interface PasswordVerificationResult {
  readonly valid: boolean;
  readonly needsRehash: boolean;
}

const DEFAULT_MEMORY_COST = 65_536;
const DEFAULT_TIME_COST = 3;
const DEFAULT_PARALLELISM = 1;
const DEFAULT_HASH_LENGTH = 32;

const DEFAULT_MAX_PASSWORD_BYTES = 4_096;

@Injectable()
export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;
  private readonly hashLength: number;
  private readonly maxPasswordBytes: number;

  constructor(private readonly config: ConfigService) {
    this.memoryCost = this.config.get<number>(
      'auth.password.memoryCost',
      DEFAULT_MEMORY_COST,
    );

    this.timeCost = this.config.get<number>(
      'auth.password.timeCost',
      DEFAULT_TIME_COST,
    );

    this.parallelism = this.config.get<number>(
      'auth.password.parallelism',
      DEFAULT_PARALLELISM,
    );

    this.hashLength = this.config.get<number>(
      'auth.password.hashLength',
      DEFAULT_HASH_LENGTH,
    );

    this.maxPasswordBytes = this.config.get<number>(
      'auth.password.maxPasswordBytes',
      DEFAULT_MAX_PASSWORD_BYTES,
    );

    this.validateConfiguration();
  }

  async hash(password: string): Promise<string> {
    this.assertPassword(password);

    return argon2.hash(password, {
      type: argon2.argon2id,

      memoryCost: this.memoryCost,

      timeCost: this.timeCost,

      parallelism: this.parallelism,

      hashLength: this.hashLength,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    if (!this.isValidHashInput(hash) || !this.isValidPasswordInput(password)) {
      return false;
    }

    try {
      return await argon2.verify(hash, password);
    } catch {
      /*
       * Do not distinguish between:
       *
       * - malformed hash
       * - unsupported hash
       * - wrong password
       *
       * at this service boundary.
       */
      return false;
    }
  }

  async verifyWithRehashStatus(
    hash: string,
    password: string,
  ): Promise<PasswordVerificationResult> {
    const valid = await this.verify(hash, password);

    if (!valid) {
      return {
        valid: false,
        needsRehash: false,
      };
    }

    return {
      valid: true,
      needsRehash: this.needsRehash(hash),
    };
  }

  needsRehash(hash: string): boolean {
    if (!this.isValidHashInput(hash)) {
      return false;
    }

    try {
      return argon2.needsRehash(hash, {
        memoryCost: this.memoryCost,

        timeCost: this.timeCost,

        parallelism: this.parallelism,
      });
    } catch {
      return false;
    }
  }

  private assertPassword(password: string): void {
    if (typeof password !== 'string' || password.length === 0) {
      throw new TypeError('Password must be a non-empty string');
    }

    const size = Buffer.byteLength(password, 'utf8');

    if (size > this.maxPasswordBytes) {
      throw new RangeError(
        `Password exceeds the maximum supported size of ${this.maxPasswordBytes} bytes`,
      );
    }
  }

  private isValidPasswordInput(password: string): boolean {
    if (typeof password !== 'string' || password.length === 0) {
      return false;
    }

    return Buffer.byteLength(password, 'utf8') <= this.maxPasswordBytes;
  }

  private isValidHashInput(hash: string): boolean {
    return typeof hash === 'string' && hash.length > 0 && hash.length <= 2_048;
  }

  private validateConfiguration(): void {
    this.assertIntegerRange(
      this.memoryCost,
      'auth.password.memoryCost',
      19_456,
      1_048_576,
    );

    this.assertIntegerRange(this.timeCost, 'auth.password.timeCost', 2, 20);

    this.assertIntegerRange(
      this.parallelism,
      'auth.password.parallelism',
      1,
      16,
    );

    this.assertIntegerRange(
      this.hashLength,
      'auth.password.hashLength',
      32,
      128,
    );

    this.assertIntegerRange(
      this.maxPasswordBytes,
      'auth.password.maxPasswordBytes',
      64,
      65_536,
    );
  }

  private assertIntegerRange(
    value: number,
    name: string,
    minimum: number,
    maximum: number,
  ): void {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new Error(
        `${name} must be an integer between ${minimum} and ${maximum}`,
      );
    }
  }
}
