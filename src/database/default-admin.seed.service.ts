import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { PasswordService } from '../common/services/password.service';
import { ROLES } from '../common/constants/roles.constant';
import { DEFAULT_PERMISSIONS } from '../common/constants/permission.constants';
import { Status } from '../common/enums/status.enum';
import { PermissionsEntity } from '../modules/permissions/entity/permissions.entity';
import { RolesEntity } from '../modules/roles/entity/roles.entity';
import { UsersEntity } from '../modules/users/entity/users.entity';

const DEFAULT_ROLE_NAMES = [ROLES.ADMIN, ROLES.DEVELOPER].map((role) =>
  role.toUpperCase(),
);
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,149}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DefaultAdminSeedInput {
  readonly firstname: string;
  readonly lastname: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

export function readDefaultAdminSeedInput(
  environment: NodeJS.ProcessEnv = process.env,
): DefaultAdminSeedInput {
  const username = normalizeUsername(
    environment.DEFAULT_ADMIN_USERNAME ?? 'admin',
  );

  return {
    firstname: normalizeName(environment.DEFAULT_ADMIN_FIRST_NAME ?? 'Admin'),
    lastname: normalizeName(environment.DEFAULT_ADMIN_LAST_NAME ?? 'User'),
    username,
    email: normalizeEmail(
      requiredEnvironmentValue(environment, 'DEFAULT_ADMIN_EMAIL'),
    ),
    password: normalizePassword(
      requiredEnvironmentValue(environment, 'DEFAULT_ADMIN_PASSWORD'),
    ),
  };
}

@Injectable()
export class DefaultAdminSeedService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  async run(input: DefaultAdminSeedInput): Promise<void> {
    const passwordHash = await this.passwords.hash(input.password);

    await this.dataSource.transaction(async (manager) => {
      const permissions = await this.ensurePermissions(manager);
      const roles = await this.ensureRoles(manager, permissions);
      await this.ensureUser(manager, input, passwordHash, roles);
    });
  }

  private async ensurePermissions(
    manager: EntityManager,
  ): Promise<PermissionsEntity[]> {
    const repository = manager.getRepository(PermissionsEntity);

    await repository
      .createQueryBuilder()
      .insert()
      .into(PermissionsEntity)
      .values(DEFAULT_PERMISSIONS.map((name) => ({ name })))
      .orIgnore()
      .execute();

    return repository.find({ order: { name: 'ASC' } });
  }

  private async ensureRoles(
    manager: EntityManager,
    permissions: PermissionsEntity[],
  ): Promise<RolesEntity[]> {
    const repository = manager.getRepository(RolesEntity);

    await repository
      .createQueryBuilder()
      .insert()
      .into(RolesEntity)
      .values(
        DEFAULT_ROLE_NAMES.map((name) => ({
          name,
          description: 'Default administrator role',
        })),
      )
      .orIgnore()
      .execute();

    const roles = await repository.find({
      where: { name: In(DEFAULT_ROLE_NAMES) },
      withDeleted: true,
      order: { name: 'ASC' },
    });

    if (roles.length !== DEFAULT_ROLE_NAMES.length) {
      throw new Error('Default administrator roles could not be created');
    }

    for (const role of roles) {
      if (role.deletedAt) {
        await repository.recover(role);
      }

      role.permissions = permissions;
    }

    return repository.save(roles);
  }

  private async ensureUser(
    manager: EntityManager,
    input: DefaultAdminSeedInput,
    passwordHash: string,
    roles: RolesEntity[],
  ): Promise<void> {
    const repository = manager.getRepository(UsersEntity);
    const users = await repository.find({
      where: [{ email: input.email }, { username: input.username }],
      relations: { roles: true },
    });

    if (users.length > 1) {
      throw new Error(
        'DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_USERNAME belong to different users',
      );
    }

    const existing = users[0];

    if (existing) {
      if (
        existing.email !== input.email ||
        existing.username !== input.username
      ) {
        throw new Error(
          'DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_USERNAME must identify the same user',
        );
      }

      existing.roles = roles;
      await repository.save(existing);
      return;
    }

    await repository.save(
      repository.create({
        firstname: input.firstname,
        lastname: input.lastname,
        username: input.username,
        email: input.email,
        emailVerifiedAt: new Date(),
        pendingEmail: null,
        phone: null,
        password: passwordHash,
        reference: null,
        roles,
        status: Status.ACTIVE,
        isLocked: false,
        failedLoginAttempts: 0,
        forcePasswordChange: false,
        tokenVersion: 0,
      }),
    );
  }
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function normalizeName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');

  if (!normalized || normalized.length > 150) {
    throw new Error('Default administrator names must be 1 to 150 characters');
  }

  return normalized;
}

function normalizeUsername(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error('DEFAULT_ADMIN_USERNAME is invalid');
  }

  return normalized;
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    throw new Error('DEFAULT_ADMIN_EMAIL is invalid');
  }

  return normalized;
}

function normalizePassword(value: string): string {
  if (value.length < 12 || value.length > 256) {
    throw new Error('DEFAULT_ADMIN_PASSWORD must be 12 to 256 characters');
  }

  return value;
}
