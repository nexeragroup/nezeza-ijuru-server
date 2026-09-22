import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Status } from '../../../common/enums/status.enum';
import { UsersEntity } from '../entity/users.entity';

export class UserPermissionResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class UserRoleResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description!: string | null;

  @ApiProperty({ type: () => [UserPermissionResponse] })
  permissions!: UserPermissionResponse[];
}

export class UserResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  firstname!: string;

  @ApiProperty()
  lastname!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  emailVerifiedAt!: Date | null;

  @ApiPropertyOptional()
  pendingEmail!: string | null;

  @ApiPropertyOptional()
  phone!: string | null;

  @ApiPropertyOptional({
    type: String,
  })
  reference!: string | null;

  @ApiProperty({ type: () => [UserRoleResponse] })
  roles!: UserRoleResponse[];

  @ApiProperty()
  status!: Status;

  @ApiProperty()
  isLocked!: boolean;

  @ApiPropertyOptional()
  lockedAt!: Date | null;

  @ApiPropertyOptional()
  lockExpiresAt!: Date | null;

  @ApiProperty()
  failedLoginAttempts!: number;

  @ApiPropertyOptional()
  lastFailedLoginAt!: Date | null;

  @ApiPropertyOptional()
  lastLoginAt!: Date | null;

  @ApiProperty()
  isTwoFactorEnabled!: boolean;

  @ApiPropertyOptional()
  passwordChangedAt!: Date | null;

  @ApiProperty()
  forcePasswordChange!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export function toUserResponse(user: UsersEntity): UserResponse {
  return {
    id: user.id,
    firstname: user.firstname,
    lastname: user.lastname,
    username: user.username,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    pendingEmail: user.pendingEmail ?? null,
    phone: user.phone ?? null,
    reference: user.reference ?? null,
    roles: (user.roles ?? []).map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description ?? null,
      permissions: (role.permissions ?? []).map((permission) => ({
        id: permission.id,
        name: permission.name,
      })),
    })),
    status: user.status,
    isLocked: user.isLocked,
    lockedAt: user.lockedAt ?? null,
    lockExpiresAt: user.lockExpiresAt ?? null,
    failedLoginAttempts: user.failedLoginAttempts,
    lastFailedLoginAt: user.lastFailedLoginAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
    passwordChangedAt: user.passwordChangedAt ?? null,
    forcePasswordChange: user.forcePasswordChange,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
