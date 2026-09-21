import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import {
  ROLE_BULK_LIMIT,
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_NAME_PATTERN,
  ROLE_PERMISSION_LIMIT,
} from '../../common/constants/roles.constant';
import { PermissionsEntity } from '../permissions/entity/permissions.entity';
import { NewRole, UpdateRole } from './dto/role.dto';
import { RolesEntity } from './entity/roles.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RolesEntity)
    private readonly rolesRepository: Repository<RolesEntity>,
  ) {}

  /**
   * Creates one role.
   */
  async createRole(dto: NewRole): Promise<RolesEntity> {
    const name = this.normalizeRoleName(dto.name);
    const permissionIds = this.normalizePermissionIds(dto.permissionIds);
    try {
      return await this.rolesRepository.manager.transaction(async (manager) => {
        const roleRepository = manager.getRepository(RolesEntity);
        const permissions = await this.loadPermissions(manager, permissionIds);
        const role = roleRepository.create({
          name,
          description: this.normalizeRoleDescription(dto.description),
          permissions,
        });
        return roleRepository.save(role);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'ROLE_ALREADY_EXISTS',
          message: `Role "${name}" already exists`,
        });
      }
      throw error;
    }
  }

  /**
   * Creates multiple roles atomically.
   *
   * If any role is invalid, no role is created.
   */
  async createBulkRoles(payloads: NewRole[]): Promise<RolesEntity[]> {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      throw new BadRequestException({
        code: 'ROLES_REQUIRED',
        message: 'At least one role is required',
      });
    }
    if (payloads.length > ROLE_BULK_LIMIT) {
      throw new BadRequestException({
        code: 'ROLE_BULK_LIMIT_EXCEEDED',
        message: `A maximum of ${ROLE_BULK_LIMIT} roles can be created in one request`,
      });
    }

    const normalizedPayloads = payloads.map((payload) => ({
      name: this.normalizeRoleName(payload.name),
      description: this.normalizeRoleDescription(payload.description),
      permissionIds: this.normalizePermissionIds(payload.permissionIds),
    }));
    const duplicateNames = this.findDuplicates(
      normalizedPayloads.map((role) => role.name),
    );
    if (duplicateNames.length > 0) {
      throw new ConflictException({
        code: 'DUPLICATE_ROLE_NAMES',
        message: `Duplicate role names in request: ${duplicateNames.join(', ')}`,
      });
    }
    try {
      return await this.rolesRepository.manager.transaction(async (manager) => {
        const roleRepository = manager.getRepository(RolesEntity);
        const submittedNames = normalizedPayloads.map((role) => role.name);
        /*
         * Include deleted rows because the unique role-name
         * constraint also includes soft-deleted records.
         */
        const existingRoles = await roleRepository.find({
          where: { name: In(submittedNames) },
          withDeleted: true,
        });

        if (existingRoles.length > 0) {
          throw new ConflictException({
            code: 'ROLE_ALREADY_EXISTS',
            message: `Roles already exist: ${existingRoles
              .map((role) => role.name)
              .join(', ')}`,
          });
        }

        /*
         * Load every referenced permission in one query.
         */
        const allPermissionIds = [
          ...new Set(normalizedPayloads.flatMap((role) => role.permissionIds)),
        ];
        const permissions = await this.loadPermissions(
          manager,
          allPermissionIds,
        );
        const permissionMap = new Map(
          permissions.map((permission) => [permission.id, permission]),
        );
        const roles = normalizedPayloads.map((payload) =>
          roleRepository.create({
            name: payload.name,
            description: payload.description,
            permissions: payload.permissionIds.map((permissionId) => {
              const permission = permissionMap.get(permissionId);
              if (!permission) {
                /*
                 * Should be impossible because
                 * loadPermissions() already checks
                 * missing IDs.
                 */
                throw new NotFoundException({
                  code: 'PERMISSION_NOT_FOUND',
                  message: `Permission "${permissionId}" was not found`,
                });
              }
              return permission;
            }),
          }),
        );
        return roleRepository.save(roles);
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'ROLE_ALREADY_EXISTS',
          message: 'One or more role names already exist',
        });
      }
      throw error;
    }
  }

  /**
   * Returns active roles.
   */
  findAllRoles(): Promise<RolesEntity[]> {
    return this.rolesRepository.find({
      relations: { permissions: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Returns active and soft-deleted roles.
   */
  findAllRolesWithDeleted(): Promise<RolesEntity[]> {
    return this.rolesRepository.find({
      withDeleted: true,
      relations: { permissions: true },
      order: {
        name: 'ASC',
      },
    });
  }

  /**
   * Finds an active role by ID.
   */
  async findRoleById(id: string, withDeleted = false): Promise<RolesEntity> {
    const role = await this.rolesRepository.findOne({
      where: { id },
      withDeleted,
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role was not found',
      });
    }

    return role;
  }

  /**
   * Finds a role by canonical role name.
   */
  async findRoleByName(
    name: string,
    withDeleted = false,
  ): Promise<RolesEntity | null> {
    return this.rolesRepository.findOne({
      where: { name: this.normalizeRoleName(name) },
      withDeleted,
      relations: { permissions: true },
    });
  }

  /**
   * Updates an active role.
   */
  async updateRole(id: string, dto: UpdateRole): Promise<RolesEntity> {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.permissionIds === undefined
    ) {
      throw new BadRequestException({
        code: 'EMPTY_ROLE_UPDATE',
        message: 'At least one role field must be provided',
      });
    }

    try {
      return await this.rolesRepository.manager.transaction(async (manager) => {
        const role = await this.findRoleByIdWithManager(manager, id, false);
        if (dto.name !== undefined) {
          role.name = this.normalizeRoleName(dto.name);
        }
        if (dto.description !== undefined) {
          role.description = this.normalizeRoleDescription(dto.description);
        }
        if (dto.permissionIds !== undefined) {
          role.permissions = await this.loadPermissions(
            manager,
            this.normalizePermissionIds(dto.permissionIds),
          );
        }
        return manager.getRepository(RolesEntity).save(role);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'ROLE_ALREADY_EXISTS',
          message: 'A role with that name already exists',
        });
      }
      throw error;
    }
  }

  /**
   * Adds permissions to an active role.
   *
   * Existing assignments are preserved and duplicates are
   * ignored.
   */
  async assignPermissionsToRole(
    roleId: string,
    permissionIds: string[],
  ): Promise<RolesEntity> {
    const normalizedIds = this.normalizePermissionIds(permissionIds, true);
    return this.rolesRepository.manager.transaction(async (manager) => {
      const role = await this.findRoleByIdWithManager(manager, roleId, false);
      const permissions = await this.loadPermissions(manager, normalizedIds);
      const existingIds = new Set(
        role.permissions.map((permission) => permission.id),
      );
      role.permissions = [
        ...role.permissions,
        ...permissions.filter((permission) => !existingIds.has(permission.id)),
      ];
      await manager.getRepository(RolesEntity).save(role);
      return this.findRoleByIdWithManager(manager, roleId, false);
    });
  }

  /**
   * Removes permissions from an active role.
   *
   * Removing a permission that is not currently assigned is
   * treated as an idempotent operation.
   */
  async removePermissionsFromRole(
    roleId: string,
    permissionIds: string[],
  ): Promise<RolesEntity> {
    const normalizedIds = this.normalizePermissionIds(permissionIds, true);
    return this.rolesRepository.manager.transaction(async (manager) => {
      const role = await this.findRoleByIdWithManager(manager, roleId, false);
      /*
       * Validate that every supplied permission actually
       * exists. This catches incorrect IDs instead of
       * silently ignoring them.
       */
      await this.loadPermissions(manager, normalizedIds);
      const idsToRemove = new Set(normalizedIds);
      role.permissions = role.permissions.filter(
        (permission) => !idsToRemove.has(permission.id),
      );
      await manager.getRepository(RolesEntity).save(role);
      return this.findRoleByIdWithManager(manager, roleId, false);
    });
  }

  /**
   * Soft-deletes an active role.
   *
   * Roles assigned to users cannot be deleted because doing
   * so could silently alter authorization behavior.
   */
  async softDeleteRole(id: string): Promise<void> {
    await this.rolesRepository.manager.transaction(async (manager) => {
      const role = await this.findRoleByIdWithManager(manager, id, true, true);
      if (role.deletedAt) {
        throw new ConflictException({
          code: 'ROLE_ALREADY_DELETED',
          message: 'Role is already deleted',
        });
      }

      if (role.users.length > 0) {
        throw new ConflictException({
          code: 'ROLE_IN_USE',
          message:
            'Role cannot be deleted while it is assigned to one or more users',
        });
      }
      const result = await manager.getRepository(RolesEntity).softDelete(id);
      if (result.affected !== 1) {
        throw new NotFoundException({
          code: 'ROLE_NOT_FOUND',
          message: 'Role was not found',
        });
      }
    });
  }

  /**
   * Restores a soft-deleted role.
   *
   * TypeORM preserves many-to-many junction rows during
   * soft deletion, so restored roles recover their existing
   * permission assignments.
   */
  async restoreRole(id: string): Promise<void> {
    await this.rolesRepository.manager.transaction(async (manager) => {
      const role = await this.findRoleByIdWithManager(manager, id, true);
      if (!role.deletedAt) {
        throw new ConflictException({
          code: 'ROLE_NOT_DELETED',
          message: 'Role is not deleted',
        });
      }
      const result = await manager.getRepository(RolesEntity).restore(id);
      if (result.affected !== 1) {
        throw new NotFoundException({
          code: 'ROLE_NOT_FOUND',
          message: 'Role was not found',
        });
      }
    });
  }

  /**
   * Permanently deletes a role.
   *
   * The operation is rejected while the role is assigned
   * to users.
   */
  async forceDeleteRole(id: string): Promise<void> {
    await this.rolesRepository.manager.transaction(async (manager) => {
      const role = await this.findRoleByIdWithManager(manager, id, true, true);
      if (role.users.length > 0) {
        throw new ConflictException({
          code: 'ROLE_IN_USE',
          message:
            'Role cannot be permanently deleted while it is assigned to one or more users',
        });
      }
      /*
       * Explicitly remove permission junction rows before
       * deleting the role.
       */
      if (role.permissions.length > 0) {
        await manager
          .createQueryBuilder()
          .relation(RolesEntity, 'permissions')
          .of(role.id)
          .remove(role.permissions.map((permission) => permission.id));
      }
      const result = await manager.getRepository(RolesEntity).delete(id);
      if (result.affected !== 1) {
        throw new NotFoundException({
          code: 'ROLE_NOT_FOUND',

          message: 'Role was not found',
        });
      }
    });
  }

  private async findRoleByIdWithManager(
    manager: EntityManager,
    id: string,
    withDeleted: boolean,
    includeUsers = false,
  ): Promise<RolesEntity> {
    const roleRepository = manager.getRepository(RolesEntity);
    const role = await roleRepository.findOne({
      where: { id },
      withDeleted,
      relations: includeUsers
        ? {
            permissions: true,
            users: true,
          }
        : {
            permissions: true,
          },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'Role was not found',
      });
    }
    return role;
  }

  /**
   * Loads permissions in a single query and validates that
   * all supplied IDs exist.
   */
  private async loadPermissions(
    manager: EntityManager,
    permissionIds: string[],
  ): Promise<PermissionsEntity[]> {
    if (permissionIds.length === 0) {
      return [];
    }
    const permissions = await manager.getRepository(PermissionsEntity).find({
      where: {
        id: In(permissionIds),
      },
      order: {
        name: 'ASC',
      },
    });
    const foundIds = new Set(permissions.map((permission) => permission.id));
    const missingIds = permissionIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException({
        code: 'PERMISSION_NOT_FOUND',
        message: `Permissions were not found: ${missingIds.join(', ')}`,
      });
    }
    return permissions;
  }

  private normalizeRoleName(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_ROLE_NAME',
        message: 'Role name must be a string',
      });
    }
    const normalized = value.trim().replace(/\s+/g, '_').toUpperCase();
    if (!ROLE_NAME_PATTERN.test(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_NAME',
        message:
          'Role name must use uppercase letters, numbers, and underscores such as SALES_MANAGER',
      });
    }
    return normalized;
  }

  private normalizeRoleDescription(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return null;
    }
    if (normalized.length > ROLE_DESCRIPTION_MAX_LENGTH) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_DESCRIPTION',
        message: `Role description cannot exceed ${ROLE_DESCRIPTION_MAX_LENGTH} characters`,
      });
    }
    return normalized;
  }

  private normalizePermissionIds(
    values: readonly string[] | undefined,
    requireAtLeastOne = false,
  ): string[] {
    const permissionIds = values ? [...values] : [];
    if (requireAtLeastOne && permissionIds.length === 0) {
      throw new BadRequestException({
        code: 'PERMISSION_IDS_REQUIRED',
        message: 'At least one permission ID is required',
      });
    }
    if (permissionIds.length > ROLE_PERMISSION_LIMIT) {
      throw new BadRequestException({
        code: 'ROLE_PERMISSION_LIMIT_EXCEEDED',
        message: `A role cannot contain more than ${ROLE_PERMISSION_LIMIT} permissions`,
      });
    }
    const duplicates = this.findDuplicates(permissionIds);
    if (duplicates.length > 0) {
      throw new BadRequestException({
        code: 'DUPLICATE_PERMISSION_IDS',
        message: 'Duplicate permission IDs are not allowed',
      });
    }
    return permissionIds;
  }

  private findDuplicates<T>(values: readonly T[]): T[] {
    const seen = new Set<T>();
    const duplicates = new Set<T>();
    for (const value of values) {
      if (seen.has(value)) {
        duplicates.add(value);
      }
      seen.add(value);
    }
    return [...duplicates];
  }

  private isUniqueViolation(error: unknown): boolean {
    return this.getPostgresErrorCode(error) === '23505';
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
