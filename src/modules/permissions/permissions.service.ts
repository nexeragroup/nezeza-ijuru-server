import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
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
export class PermissionsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(PermissionsEntity)
    private readonly permissionsRepository: Repository<PermissionsEntity>,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return this.ensureDefaults();
  }

  /**
   * Creates a permission.
   */
  async createPermission(dto: NewPermission): Promise<PermissionsEntity> {
    const name = this.normalizeName(dto.name);
    const permission = this.permissionsRepository.create({
      name,
    });
    try {
      return await this.permissionsRepository.save(permission);
    } catch (error) {
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
          const existing = await repository.find({ where: { name: In(names) } });
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
   * Ensures application-defined permissions exist.
   *
   * This operation is safe to execute repeatedly and from
   * multiple application instances.
   */
  async ensureDefaults(): Promise<void> {
    await this.permissionsRepository
      .createQueryBuilder()
      .insert()
      .into(PermissionsEntity)
      .values(
        DEFAULT_PERMISSIONS.map((name) => ({
          name,
        })),
      )
      /*
       * PostgreSQL ON CONFLICT DO NOTHING.
       *
       * The database UNIQUE constraint remains the source
       * of truth for concurrent application instances.
       */
      .orIgnore()
      .execute();
  }

  /**
   * Returns permissions ordered by their canonical name.
   */
  findAllPermissions(): Promise<PermissionsEntity[]> {
    return this.permissionsRepository.find({
      relations: { roles: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Returns a permission including assigned roles.
   */
  async findPermissionById(id: string): Promise<PermissionsEntity> {
    const permission = await this.permissionsRepository.findOne({
      where: { id },
      relations: { roles: true },
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
   * Finds a permission using its canonical permission name.
   */
  async findPermissionByName(name: string): Promise<PermissionsEntity | null> {
    return this.permissionsRepository.findOne({
      where: { name: this.normalizeName(name) },
    });
  }

  /**
   * Renames a permission.
   *
   * Permission names are identifiers, so renaming should be
   * relatively rare.
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
    } catch (error) {
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
   * Deletes an unused permission.
   *
   * Permissions assigned to roles cannot be deleted until
   * those relationships are removed explicitly.
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
    } catch (error) {
      /*
       * Protect against the race where another transaction
       * attaches this permission to a role after our relation
       * check but before DELETE executes.
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
   * Canonical permission normalization.
   *
   * Service-level validation is deliberate even though DTOs
   * validate HTTP requests because services may also be called
   * by seeders, jobs, tests, CLI commands, or other modules.
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
          'Permission name must use lowercase dot notation such as storage.upload',
      });
    }
    return normalized;
  }

  private isUniqueViolation(error: unknown): boolean {
    return this.getPostgresErrorCode(error) === '23505';
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return this.getPostgresErrorCode(error) === '23503';
  }

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
