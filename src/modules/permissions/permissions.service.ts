import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';

import { PermissionsEntity } from './entity/permissions.entity';
import { NewPermission, UpdatePermission } from './dto/permission.dto';

import {
  DEFAULT_PERMISSIONS,
  PERMISSION_NAME_PATTERN,
} from '../../common/constants/permission.constants';
import { BULK_CREATE_LIMIT } from '../../common/constants/bulk.constant';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(PermissionsEntity)
    private readonly permissionsRepository: Repository<PermissionsEntity>,
  ) {}

  /**
   * Creates a new permission.
   *
   * Permission names are normalized before persistence so the
   * database always stores the canonical lowercase representation.
   *
   * Example:
   *   USERS.READ -> users.read
   */
  async createPermission(dto: NewPermission): Promise<PermissionsEntity> {
    const name = this.normalizeName(dto.name);

    const permission = this.permissionsRepository.create({
      name,
    });

    try {
      return await this.permissionsRepository.save(permission);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PERMISSION_ALREADY_EXISTS',
          message: `Permission "${name}" already exists`,
        });
      }

      throw error;
    }
  }

  async createBulkPermissions(
    payloads: NewPermission[],
  ): Promise<PermissionsEntity[]> {
    if (payloads.length === 0 || payloads.length > BULK_CREATE_LIMIT) {
      throw new BadRequestException(
        `Submit between 1 and ${BULK_CREATE_LIMIT} permissions`,
      );
    }

    const names = payloads.map((payload) => this.normalizeName(payload.name));
    const duplicateNames = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );
    if (duplicateNames.length > 0) {
      throw new ConflictException({
        code: 'DUPLICATE_PERMISSION_NAMES',
        message: `Duplicate permission names: ${[...new Set(duplicateNames)].join(', ')}`,
      });
    }

    try {
      return await this.permissionsRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(PermissionsEntity);
          const existing = await repository.find({
            where: { name: In(names) },
          });
          if (existing.length > 0) {
            throw new ConflictException({
              code: 'PERMISSION_ALREADY_EXISTS',
              message: `Permissions already exist: ${existing.map((item) => item.name).join(', ')}`,
            });
          }
          return repository.save(
            names.map((name) => repository.create({ name })),
          );
        },
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PERMISSION_ALREADY_EXISTS',
          message: 'One or more permissions already exist',
        });
      }
      throw error;
    }
  }

  /**
   * Ensures every application-defined permission exists.
   *
   * Safe to execute:
   * - repeatedly
   * - during deployments
   * - during application startup
   * - from multiple application instances
   *
   * The database unique constraint remains the authoritative
   * protection against duplicate permissions.
   */
  async ensureDefaults(): Promise<void> {
    if (DEFAULT_PERMISSIONS.length === 0) {
      return;
    }

    await this.permissionsRepository
      .createQueryBuilder()
      .insert()
      .into(PermissionsEntity)
      .values(
        DEFAULT_PERMISSIONS.map((name) => ({
          name,
        })),
      )
      .orIgnore()
      .execute();
  }

  /**
   * Returns all permissions ordered by canonical name.
   *
   * Assigned roles are included because administrative permission
   * pages commonly need to display permission usage.
   */
  async findAllPermissions(): Promise<PermissionsEntity[]> {
    return this.permissionsRepository.find({
      relations: {
        roles: true,
      },
      order: {
        name: 'ASC',
      },
    });
  }

  /**
   * Finds a permission by ID.
   *
   * Assigned roles are loaded so callers can safely determine
   * whether the permission is currently in use.
   */
  async findPermissionById(id: string): Promise<PermissionsEntity> {
    const permission = await this.permissionsRepository.findOne({
      where: {
        id,
      },
      relations: {
        roles: true,
      },
    });

    if (!permission) {
      throw new NotFoundException({
        code: 'PERMISSION_NOT_FOUND',
        message: 'Permission was not found',
      });
    }

    return permission;
  }

  /**
   * Finds a permission by its canonical permission name.
   *
   * Returns null when no matching permission exists.
   */
  async findPermissionByName(name: string): Promise<PermissionsEntity | null> {
    const normalizedName = this.normalizeName(name);

    return this.permissionsRepository.findOne({
      where: {
        name: normalizedName,
      },
    });
  }

  /**
   * Updates a permission.
   *
   * Permission names should generally be treated as stable
   * identifiers, therefore renaming them should be relatively rare.
   */
  async updatePermission(
    id: string,
    dto: UpdatePermission,
  ): Promise<PermissionsEntity> {
    if (dto.name === undefined) {
      throw new BadRequestException({
        code: 'EMPTY_PERMISSION_UPDATE',
        message: 'At least one permission field must be provided',
      });
    }

    const permission = await this.findPermissionById(id);

    const name = this.normalizeName(dto.name);

    if (permission.name === name) {
      return permission;
    }

    permission.name = name;

    try {
      return await this.permissionsRepository.save(permission);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PERMISSION_ALREADY_EXISTS',
          message: `Permission "${name}" already exists`,
        });
      }

      throw error;
    }
  }

  /**
   * Deletes a permission.
   *
   * Permissions assigned to one or more roles cannot be deleted
   * until those relationships have explicitly been removed.
   */
  async deletePermission(id: string): Promise<void> {
    const permission = await this.findPermissionById(id);

    if (permission.roles?.length > 0) {
      throw new ConflictException({
        code: 'PERMISSION_IN_USE',
        message:
          'Permission cannot be deleted while it is assigned to one or more roles',
      });
    }

    try {
      await this.permissionsRepository.remove(permission);
    } catch (error: unknown) {
      /*
       * Protect against a race condition where another transaction
       * assigns the permission to a role after the relation check
       * but before the DELETE reaches PostgreSQL.
       */
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException({
          code: 'PERMISSION_IN_USE',
          message:
            'Permission cannot be deleted while it is assigned to one or more roles',
        });
      }

      throw error;
    }
  }

  /**
   * Converts permission identifiers into their canonical form.
   *
   * Service-level validation is intentional even when DTOs also
   * validate incoming HTTP requests because this service may be
   * called from:
   *
   * - controllers
   * - seeders
   * - background jobs
   * - CLI commands
   * - tests
   * - other application modules
   */
  private normalizeName(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION_NAME',
        message: 'Permission name must be a string',
      });
    }

    const normalized = value.trim().toLowerCase();

    if (
      normalized.length < 3 ||
      normalized.length > 100 ||
      !PERMISSION_NAME_PATTERN.test(normalized)
    ) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION_NAME',
        message:
          'Permission name must use lowercase dot notation such as users.read',
      });
    }

    return normalized;
  }

  /**
   * PostgreSQL:
   * 23505 = unique_violation
   */
  private isUniqueViolation(error: unknown): boolean {
    return this.getPostgresErrorCode(error) === '23505';
  }

  /**
   * PostgreSQL:
   * 23503 = foreign_key_violation
   */
  private isForeignKeyViolation(error: unknown): boolean {
    return this.getPostgresErrorCode(error) === '23503';
  }

  /**
   * Extracts a PostgreSQL driver error code from TypeORM without
   * relying on unsafe `any` access.
   */
  private getPostgresErrorCode(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) {
      return undefined;
    }

    const driverError = error.driverError as {
      code?: unknown;
    };

    return typeof driverError.code === 'string' ? driverError.code : undefined;
  }
}
