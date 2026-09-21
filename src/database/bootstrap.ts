import { randomUUID } from 'node:crypto';

import * as argon2 from 'argon2';

type QueryResult<Row> = { rows: Row[] };
type SqlClient = {
  connect(): Promise<void>;
  query<Row = never>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
  end(): Promise<void>;
};
const { Client } = require('pg') as {
  Client: new (options: Record<string, unknown>) => SqlClient;
};

import { DEFAULT_PERMISSIONS } from '../common/constants/permission.constants';
import { ROLES } from '../common/constants/roles.constant';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,149}$/;

const ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: 'Full system administration access',
  DEVELOPER: 'Application development and administration access',
  ADMIN: 'Administrative access',
  MANAGER: 'Management access',
  STAFF: 'Staff access',
  AUDITOR: 'Audit and reporting access',
  SUPPORT: 'Support access',
  USER: 'Standard user access',
};

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required bootstrap variable: ${name}`);
  }

  return value;
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required bootstrap variable: ${name}`);
  }

  return value;
}

function readAdmin(): {
  firstname?: string;
  lastname?: string;
  username: string;
  email: string;
  password?: string;
  passwordHash?: string;
} {
  const admin = {
    firstname: process.env.INITIAL_ADMIN_FIRSTNAME?.trim(),
    lastname: process.env.INITIAL_ADMIN_LASTNAME?.trim(),
    username: required('INITIAL_ADMIN_USERNAME').toLowerCase(),
    email: required('INITIAL_ADMIN_EMAIL').toLowerCase(),
    password: process.env.INITIAL_ADMIN_PASSWORD,
    passwordHash: process.env.INITIAL_ADMIN_PASSWORD_HASH?.trim(),
  };

  if (!USERNAME_PATTERN.test(admin.username)) {
    throw new Error('INITIAL_ADMIN_USERNAME has an invalid format');
  }

  if (admin.password?.startsWith('$argon2')) {
    throw new Error(
      'Use INITIAL_ADMIN_PASSWORD_HASH for an existing Argon2 hash',
    );
  }

  if (
    admin.password &&
    (admin.password.length < 12 || admin.password.length > 256)
  ) {
    throw new Error('INITIAL_ADMIN_PASSWORD must contain 12-256 characters');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
    throw new Error('INITIAL_ADMIN_EMAIL has an invalid format');
  }

  return admin;
}

async function bootstrap(): Promise<void> {
  const admin = readAdmin();
  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USERNAME ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    database: process.env.DATABASE_NAME ?? 'centralized_api',
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
          }
        : false,
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const permissionIds = new Map<string, string>();

    for (const permission of DEFAULT_PERMISSIONS) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO permissions ("name")
         VALUES ($1)
         ON CONFLICT ("name") DO UPDATE SET "updatedAt" = permissions."updatedAt"
         RETURNING "id"`,
        [permission],
      );
      permissionIds.set(permission, result.rows[0].id);
    }

    const roleIds = new Map<string, string>();
    for (const role of Object.values(ROLES)) {
      const name = role.toUpperCase();
      const result = await client.query<{ id: string }>(
        `INSERT INTO roles ("name", "description", "deleteAt")
         VALUES ($1, $2, NULL)
         ON CONFLICT ("name") DO UPDATE
           SET "description" = EXCLUDED."description", "deleteAt" = NULL
         RETURNING "id"`,
        [name, ROLE_DESCRIPTIONS[name] ?? null],
      );
      roleIds.set(name, result.rows[0].id);
    }

    const developerId = roleIds.get(ROLES.DEVELOPER.toUpperCase());
    if (!developerId) {
      throw new Error('Developer role was not created');
    }

    for (const permissionId of permissionIds.values()) {
      await client.query(
        `INSERT INTO roles_permissions ("roleId", "permissionId")
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [developerId, permissionId],
      );
    }

    const existing = await client.query<{
      id: string;
      username: string;
      email: string;
    }>(
      `SELECT "id", "username", "email"
       FROM users
       WHERE "username" = $1 OR "email" = $2`,
      [admin.username, admin.email],
    );

    let userId: string;
    if (existing.rows.length > 1) {
      throw new Error('Bootstrap username and email belong to different users');
    }

    if (existing.rows.length === 1) {
      if (
        existing.rows[0].username !== admin.username ||
        existing.rows[0].email !== admin.email
      ) {
        throw new Error(
          'Bootstrap username or email is already assigned to another user',
        );
      }
      userId = existing.rows[0].id;
    } else {
      const firstname = requiredValue(
        admin.firstname,
        'INITIAL_ADMIN_FIRSTNAME',
      );
      const lastname = requiredValue(admin.lastname, 'INITIAL_ADMIN_LASTNAME');
      const password = admin.passwordHash
        ? admin.passwordHash
        : await argon2.hash(
            requiredValue(admin.password, 'INITIAL_ADMIN_PASSWORD'),
            {
              type: argon2.argon2id,
              memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 65_536),
              timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
              parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
              hashLength: Number(process.env.ARGON2_HASH_LENGTH ?? 32),
            },
          );
      const result = await client.query<{ id: string }>(
        `INSERT INTO users (
           "id", "firstname", "lastname", "username", "email", "password",
           "emailVerifiedAt", "status", "isLocked", "forcePasswordChange"
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'Active', false, false)
         RETURNING "id"`,
        [
          randomUUID(),
          firstname,
          lastname,
          admin.username,
          admin.email,
          password,
        ],
      );
      userId = result.rows[0].id;
    }

    await client.query(
      `INSERT INTO users_roles ("userId", "roleId")
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, developerId],
    );

    await client.query('COMMIT');
    console.log('Database bootstrap completed');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Database bootstrap failed',
  );
  process.exitCode = 1;
});
