import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { normalizePagination } from '../../common/utils/pagination.util';
import { Status } from '../../common/enums/status.enum';
import { ROLES } from '../../common/constants/roles.constant';
import { PasswordService } from '../../common/services/password.service';
import { TransactionService } from '../../common/services/transaction.service';
import { AuthSessionEntity } from '../auth/entity/auth-session.entity';
import { AuthTokenEntity } from '../auth/entity/auth-token.entity';
import { MailsService } from '../mails/mails.service';
import { RolesEntity } from '../roles/entity/roles.entity';
import { ListUsersQuery, NewUser, UpdateUser } from './dto/user.dto';
import { UpdateProfile } from './dto/profile.dto';
import { UsersEntity } from './entity/users.entity';

interface UserMutationResult {
  readonly revokeSessions?: boolean;
}
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const MAX_USER_ROLES = 100;
const ADMINISTRATOR_ROLE_NAMES = [
  ROLES.ADMIN,
  ROLES.DEVELOPER,
  ROLES.SUPER_ADMIN,
].map((role) => role.toUpperCase());

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UsersEntity)
    private readonly usersRepository: Repository<UsersEntity>,
    private readonly mailsService: MailsService,
    private readonly transactionService: TransactionService,
    private readonly passwordService: PasswordService,
  ) {}

  /*
   * ----------------------------------------------------------------
   * Create
   * ----------------------------------------------------------------
   */

  async createUser(dto: NewUser): Promise<UsersEntity> {
    if (dto.password !== dto.confirm) {
      throw new BadRequestException({
        code: 'PASSWORD_CONFIRMATION_MISMATCH',
        message: 'Passwords do not match',
      });
    }

    const userId = await this.withUserConflictHandling(() =>
      this.transactionService.run(async (manager) => {
        const repository = manager.getRepository(UsersEntity);
        const email = this.normalizeEmail(dto.email);
        const username = this.normalizeUsername(dto.username);
        /*
         * Friendly pre-check.
         *
         * The database UNIQUE constraints remain the real
         * concurrency guarantee.
         */
        const existing = await repository.findOne({
          where: [{ email }, { username }],
        });
        if (existing) {
          throw new ConflictException({
            code: 'USER_ALREADY_EXISTS',
            message: 'Username or email already exists',
          });
        }
        const roles = await this.loadRoles(manager, dto.roles ?? []);
        const user = repository.create({
          firstname: this.normalizeName(dto.firstname),
          lastname: this.normalizeName(dto.lastname),
          username,
          email,
          emailVerifiedAt: null,
          pendingEmail: null,
          phone: null,
          reference: this.normalizeReference(dto.reference),
          password: await this.passwordService.hash(dto.password),
          roles,
          status: Status.INACTIVE,
          isLocked: false,
          failedLoginAttempts: 0,
          forcePasswordChange: false,
          tokenVersion: 0,
        });
        const saved = await repository.save(user);
        await this.issueEmailVerification(manager, saved);
        return saved.id;
      }),
    );
    return this.findUserById(userId);
  }

  /*
   * ----------------------------------------------------------------
   * Find
   * ----------------------------------------------------------------
   */

  findAllUsers(query: ListUsersQuery = {}): Promise<UsersEntity[]> {
    const pagination = normalizePagination(query, 100);
    return this.usersRepository.find({
      relations: { roles: { permissions: true } },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  async findUserById(id: string, includeSecrets = false): Promise<UsersEntity> {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .where('user.id = :id', {
        id,
      })
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission');

    if (includeSecrets) {
      query.addSelect([
        'user.password',
        'user.refreshTokenHash',
        'user.twoFactorSecret',
      ]);
    }
    const user = await query.getOne();
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User was not found',
      });
    }
    return user;
  }

  /**
   * Finds a user specifically by username.
   */
  findUserByUsername(username: string): Promise<UsersEntity | null> {
    return this.usersRepository.findOne({
      where: { username: this.normalizeUsername(username) },
      relations: {
        roles: { permissions: true },
      },
    });
  }

  /**
   * Finds a user specifically by email.
   */
  findUserByEmail(email: string): Promise<UsersEntity | null> {
    return this.usersRepository.findOne({
      where: { email: this.normalizeEmail(email) },
      relations: {
        roles: { permissions: true },
      },
    });
  }

  /**
   * Authentication lookup supporting either username or email.
   *
   * Authentication code that accepts either identifier should use
   * this method instead of overloading findUserByUsername().
   */
  findUserByLoginIdentifier(value: string): Promise<UsersEntity | null> {
    const identifier = value.trim().toLowerCase();
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .addSelect('user.password')
      .where('user.email = :identifier OR user.username = :identifier', {
        identifier,
      })
      .getOne();
  }

  /**
   * Loads the current authorization state for an authenticated user.
   *
   * Password hashes, refresh-token hashes, and MFA secrets remain
   * excluded because their entity columns use select:false.
   */
  findUserForAuthorization(id: string): Promise<UsersEntity | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.id = :id', {
        id,
      })
      .getOne();
  }

  /*
   * ----------------------------------------------------------------
   * Update
   * ----------------------------------------------------------------
   */

  updateUser(id: string, dto: UpdateUser): Promise<UsersEntity> {
    if (
      dto.firstname === undefined &&
      dto.lastname === undefined &&
      dto.email === undefined &&
      dto.phone === undefined &&
      dto.username === undefined &&
      dto.roles === undefined
    ) {
      throw new BadRequestException({
        code: 'EMPTY_USER_UPDATE',
        message: 'At least one user field must be provided',
      });
    }

    return this.mutateUser(id, async (manager, user) => {
      let revokeSessions = false;
      if (dto.firstname !== undefined) {
        user.firstname = this.normalizeName(dto.firstname);
      }
      if (dto.lastname !== undefined) {
        user.lastname = this.normalizeName(dto.lastname);
      }
      if (dto.phone !== undefined) {
        user.phone = this.normalizeOptionalText(dto.phone);
      }
      if (dto.username !== undefined) {
        const username = this.normalizeUsername(dto.username);
        if (username !== user.username) {
          user.username = username;
          revokeSessions = true;
        }
      }
      if (dto.roles !== undefined) {
        user.roles = await this.loadRoles(manager, dto.roles);
        revokeSessions = true;
      }
      if (dto.email !== undefined) {
        const email = this.normalizeEmail(dto.email);
        if (email !== user.email) {
          user.email = email;
          user.emailVerifiedAt = null;
          user.pendingEmail = null;
          revokeSessions = true;
          /*
           * Consume any outstanding authentication/security
           * tokens before issuing a new verification token.
           */
          await manager
            .getRepository(AuthTokenEntity)
            .update({ userId: user.id }, { consumedAt: new Date() });
          await this.issueEmailVerification(manager, user);
        }
      }
      return {
        revokeSessions,
      };
    });
  }

  updateProfile(id: string, dto: UpdateProfile): Promise<UsersEntity> {
    if (
      dto.firstname === undefined &&
      dto.lastname === undefined &&
      dto.email === undefined &&
      dto.phone === undefined
    ) {
      throw new BadRequestException({
        code: 'EMPTY_PROFILE_UPDATE',
        message: 'At least one profile field must be provided',
      });
    }
    return this.mutateUser(id, async (manager, user) => {
      let revokeSessions = false;

      if (dto.firstname !== undefined) {
        user.firstname = this.normalizeName(dto.firstname);
      }

      if (dto.lastname !== undefined) {
        user.lastname = this.normalizeName(dto.lastname);
      }

      if (dto.phone !== undefined) {
        user.phone = this.normalizeOptionalText(dto.phone);
      }
      if (dto.email !== undefined) {
        const email = this.normalizeEmail(dto.email);
        if (email !== user.email) {
          user.email = email;
          user.emailVerifiedAt = null;
          revokeSessions = true;
          await manager
            .getRepository(AuthTokenEntity)
            .update({ userId: user.id }, { consumedAt: new Date() });
          await this.issueEmailVerification(manager, user);
        }
      }
      return {
        revokeSessions,
      };
    });
  }

  /*
   * ----------------------------------------------------------------
   * Roles
   * ----------------------------------------------------------------
   */

  assignRolesToUser(id: string, roleIds: string[]): Promise<UsersEntity> {
    return this.mutateUser(id, async (manager, user) => {
      const requestedRoles = await this.loadRoles(manager, roleIds);
      const existingIds = new Set(user.roles.map((role) => role.id));
      user.roles = [
        ...user.roles,
        ...requestedRoles.filter((role) => !existingIds.has(role.id)),
      ];
      return {
        revokeSessions: true,
      };
    });
  }

  removeRolesFromUser(id: string, roleIds: string[]): Promise<UsersEntity> {
    return this.mutateUser(id, async (manager, user) => {
      /*
       * Validate IDs instead of silently ignoring bad role IDs.
       */
      await this.loadRoles(manager, roleIds);
      const idsToRemove = new Set(roleIds);
      user.roles = user.roles.filter((role) => !idsToRemove.has(role.id));
      return {
        revokeSessions: true,
      };
    });
  }

  /*
   * ----------------------------------------------------------------
   * Account state
   * ----------------------------------------------------------------
   */

  verifyUser(id: string): Promise<UsersEntity> {
    return this.mutateUser(id, async (manager, user) => {
      if (user.emailVerifiedAt) return;

      const now = new Date();
      user.emailVerifiedAt = now;
      user.status = Status.ACTIVE;
      await manager.getRepository(AuthTokenEntity).update(
        {
          userId: user.id,
          purpose: 'EMAIL_VERIFICATION',
          consumedAt: IsNull(),
        },
        { consumedAt: now },
      );

      return { revokeSessions: true };
    });
  }

  lockUser(id: string): Promise<UsersEntity> {
    return this.mutateUser(id, async (_manager, user) => {
      user.isLocked = true;
      user.lockedAt = new Date();
      /*
       * null means administratively locked rather than
       * temporarily locked after failed login attempts.
       */
      user.lockExpiresAt = null;
      return {
        revokeSessions: true,
      };
    });
  }

  unlockUser(id: string): Promise<UsersEntity> {
    return this.mutateUser(id, async (_manager, user) => {
      user.isLocked = false;
      user.lockedAt = null;
      user.lockExpiresAt = null;
      user.failedLoginAttempts = 0;
      user.lastFailedLoginAt = null;
      return {
        revokeSessions: true,
      };
    });
  }

  activateUser(id: string): Promise<UsersEntity> {
    return this.mutateUser(id, async (_manager, user) => {
      user.status = Status.ACTIVE;
      return {
        revokeSessions: true,
      };
    });
  }

  deactivateUser(id: string): Promise<UsersEntity> {
    return this.mutateUser(id, async (_manager, user) => {
      user.status = Status.INACTIVE;
      return { revokeSessions: true };
    });
  }

  suspendUser(id: string): Promise<UsersEntity> {
    return this.mutateUser(id, async (_manager, user) => {
      user.status = Status.SUSPENDED;
      return { revokeSessions: true };
    });
  }

  forcePasswordReset(id: string): Promise<UsersEntity> {
    return this.mutateUser(id, async (_manager, user) => {
      user.forcePasswordChange = true;
      user.refreshTokenHash = null;
      return {
        revokeSessions: true,
      };
    });
  }

  /*
   * ----------------------------------------------------------------
   * Failed login tracking
   * ----------------------------------------------------------------
   */

  async recordFailedLogin(
    id: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<UsersEntity> {
    this.assertPositiveInteger(maxAttempts, 'maxAttempts');
    this.assertPositiveInteger(lockMinutes, 'lockMinutes');
    return this.transactionService.run(async (manager) => {
      const repository = manager.getRepository(UsersEntity);
      const user = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'User was not found',
        });
      }
      const now = new Date();
      if (user.lockExpiresAt && user.lockExpiresAt <= now) {
        user.isLocked = false;
        user.lockedAt = null;
        user.lockExpiresAt = null;
        user.failedLoginAttempts = 0;
      }
      user.failedLoginAttempts += 1;
      user.lastFailedLoginAt = now;
      if (user.failedLoginAttempts >= maxAttempts) {
        user.isLocked = true;
        user.lockedAt = now;
        user.lockExpiresAt = new Date(now.getTime() + lockMinutes * 60_000);
      }
      return repository.save(user);
    });
  }

  /*
   * ----------------------------------------------------------------
   * Delete
   * ----------------------------------------------------------------
   */

  async deleteUser(id: string): Promise<void> {
    await this.mutateUser(id, async () => ({ revokeSessions: true }), true);
  }

  /*
   * ----------------------------------------------------------------
   * Internal mutation boundary
   * ----------------------------------------------------------------
   */

  private async mutateUser(
    id: string,
    work: (
      manager: EntityManager,
      user: UsersEntity,
    ) => Promise<UserMutationResult | void>,
    deleting = false,
  ): Promise<UsersEntity> {
    return this.withUserConflictHandling(() =>
      this.transactionService.run(async (manager) => {
        /*
         * Serializes administrative authorization mutations
         * across instances so concurrent requests cannot each
         * remove one of the final administrators.
         */
        await manager.query('SELECT pg_advisory_xact_lock(82401601)');
        const repository = manager.getRepository(UsersEntity);

        /*
         * Lock the base user row first.
         */
        const user = await repository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!user) {
          throw new NotFoundException({
            code: 'USER_NOT_FOUND',
            message: 'User was not found',
          });
        }
        /*
         * Load role state separately after locking the user.
         */
        const userWithRoles = await repository.findOne({
          where: { id },
          relations: { roles: { permissions: true } },
        });

        if (!userWithRoles) {
          throw new NotFoundException({
            code: 'USER_NOT_FOUND',
            message: 'User was not found',
          });
        }

        user.roles = userWithRoles.roles;
        const wasUsableAdmin = this.isUsableAdministrator(user);
        const mutation = await work(manager, user);

        if (wasUsableAdmin && (deleting || !this.isUsableAdministrator(user))) {
          await this.ensureAnotherUsableAdministrator(manager, user.id);
        }

        if (mutation?.revokeSessions) {
          await this.revokeUserAuthenticationState(manager, user);
        }

        if (deleting) {
          /*
           * Remove the role junction records explicitly.
           */
          if (user.roles.length > 0) {
            await manager
              .createQueryBuilder()
              .relation(UsersEntity, 'roles')
              .of(user.id)
              .remove(user.roles.map((role) => role.id));
          }
          await repository.delete(user.id);
          return user;
        }
        return repository.save(user);
      }),
    );
  }

  private async revokeUserAuthenticationState(
    manager: EntityManager,
    user: UsersEntity,
  ): Promise<void> {
    user.tokenVersion += 1;
    user.refreshTokenHash = null;
    const now = new Date();
    await manager
      .getRepository(AuthSessionEntity)
      .update(
        { userId: user.id, revokedAt: IsNull() },
        { revokedAt: now, revokeReason: 'ACCOUNT_UPDATED' },
      );
    await manager
      .getRepository(AuthTokenEntity)
      .update({ userId: user.id, purpose: 'MFA_LOGIN' }, { consumedAt: now });
  }

  /*
   * ----------------------------------------------------------------
   * Last-administrator protection
   * ----------------------------------------------------------------
   */

  private isUsableAdministrator(user: UsersEntity): boolean {
    return (
      user.status === Status.ACTIVE &&
      !user.isLocked &&
      !user.forcePasswordChange &&
      Boolean(user.emailVerifiedAt) &&
      user.roles.some((role) => ADMINISTRATOR_ROLE_NAMES.includes(role.name))
    );
  }

  private async ensureAnotherUsableAdministrator(
    manager: EntityManager,
    excludedUserId: string,
  ): Promise<void> {
    const repository = manager.getRepository(UsersEntity);
    const count = await repository
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('user.id != :excludedUserId', {
        excludedUserId,
      })
      .andWhere('user.status = :status', {
        status: Status.ACTIVE,
      })
      .andWhere('user.isLocked = false')
      .andWhere('user.forcePasswordChange = false')
      .andWhere('user.emailVerifiedAt IS NOT NULL')
      .andWhere('role.name IN (:...roleNames)', {
        roleNames: ADMINISTRATOR_ROLE_NAMES,
      })
      .getCount();

    if (count === 0) {
      throw new ConflictException({
        code: 'LAST_ADMINISTRATOR_REQUIRED',
        message: 'Cannot remove access for the last active administrator',
      });
    }
  }

  /*
   * ----------------------------------------------------------------
   * Role loading
   * ----------------------------------------------------------------
   */

  private async loadRoles(
    manager: EntityManager,
    roleIds: readonly string[],
  ): Promise<RolesEntity[]> {
    if (roleIds.length > MAX_USER_ROLES) {
      throw new BadRequestException({
        code: 'USER_ROLE_LIMIT_EXCEEDED',
        message: `A user cannot have more than ${MAX_USER_ROLES} roles`,
      });
    }
    const uniqueIds = [...new Set(roleIds)];
    if (uniqueIds.length === 0) {
      return [];
    }
    const roles = await manager.getRepository(RolesEntity).find({
      where: { id: In(uniqueIds) },
      order: { name: 'ASC' },
    });
    const foundIds = new Set(roles.map((role) => role.id));
    const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Roles were not found: ${missingIds.join(', ')}`,
      });
    }
    return roles;
  }

  /*
   * ----------------------------------------------------------------
   * Email verification
   * ----------------------------------------------------------------
   */

  private async issueEmailVerification(
    manager: EntityManager,
    user: UsersEntity,
  ): Promise<void> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    /*
     * Invalidate earlier outstanding verification tokens.
     */
    await manager.getRepository(AuthTokenEntity).update(
      {
        userId: user.id,
        purpose: 'EMAIL_VERIFICATION',
        consumedAt: IsNull(),
      },
      { consumedAt: new Date() },
    );

    await manager.getRepository(AuthTokenEntity).save({
      userId: user.id,
      tokenHash,
      purpose: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 86_400_000),
      consumedAt: null,
    });

    /*
     * Important:
     *
     * MailsService should enqueue/stage the email transactionally
     * through your outbox infrastructure rather than making a live
     * SMTP call while this database transaction is open.
     */
    await this.mailsService.sendSecurityToken(
      user.email,
      user.firstname,
      rawToken,
      'EMAIL_VERIFICATION',
      manager,
    );
  }

  /*
   * ----------------------------------------------------------------
   * Conflict handling
   * ----------------------------------------------------------------
   */

  private async withUserConflictHandling<T>(
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const details = this.getPostgresErrorDetails(error);
      if (details.code !== '23505') {
        throw error;
      }
      switch (details.constraint) {
        case 'uq_users_username':
          throw new ConflictException({
            code: 'USERNAME_ALREADY_EXISTS',
            message: 'Username already exists',
          });

        case 'uq_users_email':
          throw new ConflictException({
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'Email already exists',
          });

        case 'uq_users_pending_email':
          throw new ConflictException({
            code: 'EMAIL_ALREADY_PENDING',
            message: 'Email is already pending for another account',
          });

        default:
          throw new ConflictException({
            code: 'USER_ALREADY_EXISTS',
            message: 'Username or email already exists',
          });
      }
    }
  }

  private getPostgresErrorDetails(error: unknown): {
    code?: string;
    constraint?: string;
  } {
    if (!(error instanceof QueryFailedError)) {
      return {};
    }
    const driverError = error.driverError as {
      code?: unknown;
      constraint?: unknown;
    };
    return {
      code: typeof driverError.code === 'string' ? driverError.code : undefined,
      constraint:
        typeof driverError.constraint === 'string'
          ? driverError.constraint
          : undefined,
    };
  }

  /*
   * ----------------------------------------------------------------
   * Normalization
   * ----------------------------------------------------------------
   */

  private normalizeName(value: string): string {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      throw new BadRequestException({
        code: 'INVALID_USER_NAME',
        message: 'Name cannot be empty',
      });
    }
    return normalized;
  }

  private normalizeUsername(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeOptionalText(
    value: string | undefined | null,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = value.trim();
    return normalized || null;
  }

  private normalizeReference(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_USER_REFERENCE',
        message: 'Reference must be a positive integer',
      });
    }
    const reference = BigInt(normalized);
    if (reference > POSTGRES_BIGINT_MAX) {
      throw new BadRequestException({
        code: 'INVALID_USER_REFERENCE',
        message: 'Reference exceeds the PostgreSQL bigint range',
      });
    }
    return reference.toString();
  }

  private assertPositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive integer`);
    }
  }
}
