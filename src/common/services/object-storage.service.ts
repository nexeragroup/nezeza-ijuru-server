import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

const MAX_OBJECT_KEY_BYTES = 1_024;

const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 900;
const MAX_PRESIGNED_EXPIRY_SECONDS = 604_800;

@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private readonly logger = new Logger(ObjectStorageService.name);

  private readonly client: S3Client;
  private readonly enabled: boolean;
  private readonly bucketName: string | null;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('storage.enabled', false);

    this.bucketName = this.normalizeOptionalString(
      this.config.get<string>('storage.bucket', ''),
    );

    this.validateConfiguration();

    const accessKeyId = this.normalizeOptionalString(
      this.config.get<string>('storage.accessKeyId', ''),
    );

    const secretAccessKey = this.normalizeOptionalString(
      this.config.get<string>('storage.secretAccessKey', ''),
    );

    const sessionToken = this.normalizeOptionalString(
      this.config.get<string>('storage.sessionToken', ''),
    );

    const credentials =
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,

            ...(sessionToken
              ? {
                  sessionToken,
                }
              : {}),
          }
        : undefined;

    this.client = new S3Client({
      region: this.config.get<string>('storage.region', 'us-east-1'),

      endpoint:
        this.normalizeOptionalString(
          this.config.get<string>('storage.endpoint', ''),
        ) ?? undefined,

      forcePathStyle: this.config.get<boolean>('storage.forcePathStyle', false),

      /*
       * Leave undefined when explicit static credentials
       * are not configured.
       *
       * The AWS SDK can then use its normal credential
       * provider chain, such as IAM roles.
       */
      credentials,

      maxAttempts: this.getPositiveInteger('storage.maxAttempts', 3),
    });
  }

  async upload(
    key: string,
    body: Readable | Uint8Array | string,
    contentType?: string,
  ): Promise<void> {
    this.requireEnabled();

    const objectKey = this.safeKey(key);

    const normalizedContentType = this.normalizeContentType(contentType);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.requireBucket(),

          Key: objectKey,

          Body: body,

          ContentType: normalizedContentType,
        }),
      );
    } catch (error) {
      this.throwStorageError('upload', objectKey, error);
    }
  }

  async download(key: string): Promise<Readable> {
    this.requireEnabled();

    const objectKey = this.safeKey(key);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.requireBucket(),

          Key: objectKey,
        }),
      );

      const body = response.Body;

      if (!body || typeof (body as Readable).pipe !== 'function') {
        throw new Error('Object storage returned an unsupported response body');
      }

      return body as Readable;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        throw new NotFoundException({
          code: 'OBJECT_NOT_FOUND',

          message: 'The requested object was not found',
        });
      }

      this.throwStorageError('download', objectKey, error);
    }
  }

  async delete(key: string): Promise<void> {
    this.requireEnabled();

    const objectKey = this.safeKey(key);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.requireBucket(),

          Key: objectKey,
        }),
      );
    } catch (error) {
      this.throwStorageError('delete', objectKey, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    this.requireEnabled();

    const objectKey = this.safeKey(key);

    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.requireBucket(),

          Key: objectKey,
        }),
      );

      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }

      this.throwStorageError('head', objectKey, error);
    }
  }

  async presignedUpload(key: string, contentType?: string): Promise<string> {
    this.requireEnabled();

    const objectKey = this.safeKey(key);

    const normalizedContentType = this.normalizeContentType(contentType);

    try {
      return await getSignedUrl(
        this.client,

        new PutObjectCommand({
          Bucket: this.requireBucket(),

          Key: objectKey,

          ContentType: normalizedContentType,
        }),

        {
          expiresIn: this.getPresignedExpiry(),
        },
      );
    } catch (error) {
      this.throwStorageError('create-presigned-upload', objectKey, error);
    }
  }

  async presignedDownload(key: string): Promise<string> {
    this.requireEnabled();

    const objectKey = this.safeKey(key);

    try {
      return await getSignedUrl(
        this.client,

        new GetObjectCommand({
          Bucket: this.requireBucket(),

          Key: objectKey,
        }),

        {
          expiresIn: this.getPresignedExpiry(),
        },
      );
    } catch (error) {
      this.throwStorageError('create-presigned-download', objectKey, error);
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  private validateConfiguration(): void {
    if (!this.enabled) {
      return;
    }

    if (!this.bucketName) {
      throw new Error(
        'storage.bucket is required when object storage is enabled',
      );
    }

    const accessKeyId = this.normalizeOptionalString(
      this.config.get<string>('storage.accessKeyId', ''),
    );

    const secretAccessKey = this.normalizeOptionalString(
      this.config.get<string>('storage.secretAccessKey', ''),
    );

    /*
     * Either provide both explicit credentials
     * or neither.
     *
     * Supplying neither allows AWS IAM / environment
     * credential providers to be used.
     */
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      throw new Error(
        'storage.accessKeyId and storage.secretAccessKey must either both be configured or both be omitted',
      );
    }

    this.getPresignedExpiry();
  }

  private requireBucket(): string {
    if (!this.bucketName) {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_NOT_CONFIGURED',

        message: 'Object storage is not configured',
      });
    }

    return this.bucketName;
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_DISABLED',

        message: 'Object storage is unavailable',
      });
    }
  }

  private safeKey(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_OBJECT_KEY',

        message: 'Invalid object key',
      });
    }

    const key = value.trim();

    if (
      !key ||
      key.startsWith('/') ||
      key.startsWith('\\') ||
      key.includes('\\') ||
      // oxlint-disable-next-line no-control-regex -- reject control characters in storage keys.
      /[\u0000-\u001F\u007F]/.test(key) ||
      Buffer.byteLength(key, 'utf8') > MAX_OBJECT_KEY_BYTES
    ) {
      throw new BadRequestException({
        code: 'INVALID_OBJECT_KEY',

        message: 'Invalid object key',
      });
    }

    const segments = key.split('/');

    if (
      segments.some(
        (segment) => !segment || segment === '.' || segment === '..',
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_OBJECT_KEY',

        message: 'Invalid object key',
      });
    }

    return key;
  }

  private normalizeContentType(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim();

    if (!normalized || normalized.length > 255 || /[\r\n]/.test(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_CONTENT_TYPE',

        message: 'Invalid content type',
      });
    }

    return normalized;
  }

  private getPresignedExpiry(): number {
    const value = this.config.get<number>(
      'storage.presignedExpirySeconds',
      DEFAULT_PRESIGNED_EXPIRY_SECONDS,
    );

    if (
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > MAX_PRESIGNED_EXPIRY_SECONDS
    ) {
      throw new Error(
        `storage.presignedExpirySeconds must be between 1 and ${MAX_PRESIGNED_EXPIRY_SECONDS}`,
      );
    }

    return value;
  }

  private isNotFoundError(error: unknown): boolean {
    if (error instanceof S3ServiceException) {
      return (
        error.$metadata.httpStatusCode === 404 ||
        error.name === 'NoSuchKey' ||
        error.name === 'NotFound'
      );
    }

    if (typeof error === 'object' && error !== null && '$metadata' in error) {
      const metadata = (
        error as {
          $metadata?: {
            httpStatusCode?: number;
          };
        }
      ).$metadata;

      return metadata?.httpStatusCode === 404;
    }

    return false;
  }

  private throwStorageError(
    operation: string,
    key: string,
    error: unknown,
  ): never {
    const message = error instanceof Error ? error.message : String(error);

    this.logger.error(
      `Object storage ${operation} failed for key "${key}": ${message}`,
      error instanceof Error ? error.stack : undefined,
    );

    throw new ServiceUnavailableException({
      code: 'OBJECT_STORAGE_UNAVAILABLE',

      message: 'Object storage is temporarily unavailable',
    });
  }

  private getPositiveInteger(key: string, fallback: number): number {
    const value = this.config.get<number>(key, fallback);

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer`);
    }

    return value;
  }

  private normalizeOptionalString(value: string | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  }
}
