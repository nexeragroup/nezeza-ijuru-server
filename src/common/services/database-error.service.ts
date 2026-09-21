import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Injectable()
export class DatabaseErrorService {
  constructor() {}

  isUniqueViolation(error: unknown): boolean {
    return this.getDriverCode(error) === '23505';
  }

  isForeignKeyViolation(error: unknown): boolean {
    return this.getDriverCode(error) === '23503';
  }

  rethrow(
    action: string,
    error: unknown,
    options: {
      duplicateMessage?: string;
      foreignKeyMessage?: string;
      context?: string;
      metadata?: unknown;
    } = {},
  ): never {
    if (error instanceof HttpException) throw error;
    if (this.isUniqueViolation(error)) {
      throw new ConflictException(
        options.duplicateMessage ?? 'A record with these values already exists',
      );
    }
    if (this.isForeignKeyViolation(error)) {
      throw new ConflictException(
        options.foreignKeyMessage ??
          'This record is still referenced by another resource',
      );
    }
    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private getDriverCode(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) return undefined;
    const driverError = error.driverError as { code?: unknown };
    return typeof driverError.code === 'string' ? driverError.code : undefined;
  }
}
