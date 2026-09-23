import { UsersService } from './users.service';
import { UsersEntity } from './entity/users.entity';
import { RolesEntity } from '../roles/entity/roles.entity';
import { NewUser, UpdateUser, ListUsersQuery } from './dto/user.dto';
import { UpdateProfile } from './dto/profile.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryFailedError } from 'typeorm';
import { Status } from '../../common/enums/status.enum';

function setup() {
  const repo = {
    findOne: jest
      .fn()
      .mockResolvedValue(null),
    create: jest.fn((v: any) => v),
    save: jest
      .fn()
      .mockImplementation(async (v: any) => ({ ...v, id: 'new-user' })),
  };
  const roleRepo = {
    find: jest.fn().mockResolvedValue([]),
  };
  const tokenRepo = {
    save: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: (entity: unknown) =>
      entity === UsersEntity
        ? repo
        : entity === RolesEntity
          ? roleRepo
          : tokenRepo,
  };
  const transactions = {
    run: jest
      .fn()
      .mockImplementation(async (work: (value: any) => any) => work(manager)),
  };
  const passwords = {
    hash: jest
      .fn()
      .mockResolvedValue('argon2-hash'),
  };
  const mails = {
    sendSecurityToken: jest
      .fn()
      .mockResolvedValue({ queued: true }),
  };
  const service = new UsersService(
    {} as any,
    mails as any,
    transactions as any,
    passwords as any,
  );
  jest.spyOn(service, 'findUserById').mockResolvedValue({
    id: 'new-user',
    email: 'yves@example.com',
  } as UsersEntity);
  const dto: NewUser = {
    firstname: ' Yves ',
    lastname: ' Ndar ',
    username: 'YVES',
    email: 'YVES@example.com',
    password: 'long-password',
    confirm: 'long-password',
  };
  return {
    service,
    repo,
    roleRepo,
    tokenRepo,
    manager,
    transactions,
    passwords,
    mails,
    dto,
  };
}
describe('UsersService', () => {
  it('rejects mismatched passwords before opening a transaction', async () => {
    const { service, transactions, dto } = setup();
    await expect(
      service.createUser({ ...dto, confirm: 'different' }),
    ).rejects.toThrow('Passwords do not match');
    expect(transactions.run).not.toHaveBeenCalled();
  });
  it('normalizes credentials and queues verification using the same transaction', async () => {
    const { service, repo, manager, passwords, mails, dto } = setup();
    await service.createUser(dto);
    expect(passwords.hash).toHaveBeenCalledWith(dto.password);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'yves',
        email: 'yves@example.com',
        password: 'argon2-hash',
        status: Status.INACTIVE,
      }),
    );
    expect(repo.create.mock.calls[0][0]).not.toHaveProperty('confirm');
    expect(mails.sendSecurityToken).toHaveBeenCalledWith(
      'yves@example.com',
      'Yves',
      expect.any(String),
      'EMAIL_VERIFICATION',
      manager,
    );
  });
  it('does not save a user with nonexistent roles', async () => {
    const { service, repo, dto } = setup();
    await expect(
      service.createUser({ ...dto, roles: ['missing'] }),
    ).rejects.toThrow('Roles were not found: missing');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('translates a database uniqueness race into conflict', async () => {
    const { service, repo, dto } = setup();
    repo.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], { code: '23505' } as unknown as Error),
    );
    await expect(service.createUser(dto)).rejects.toThrow(
      'Username or email already exists',
    );
  });
  it('rejects null profile fields, blank names, and excessive pagination', async () => {
    expect(
      await validate(plainToInstance(UpdateUser, { firstname: null })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(UpdateUser, { firstname: '   ' })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(UpdateProfile, { lastname: null })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(UpdateUser, { roles: null })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(UpdateUser, { phone: null })),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(ListUsersQuery, { limit: '101' })),
    ).not.toHaveLength(0);
  });
  it('recognizes persisted administrator role names', () => {
    const { service } = setup();
    const user = {
      status: Status.ACTIVE,
      isLocked: false,
      forcePasswordChange: false,
      emailVerifiedAt: new Date(),
      roles: [{ name: 'ADMIN' }],
    } as UsersEntity;

    expect(
      (
        service as unknown as {
          isUsableAdministrator(candidate: UsersEntity): boolean;
        }
      ).isUsableAdministrator(user),
    ).toBe(true);
  });

  it('verifies an unverified user and consumes pending verification tokens', async () => {
    const { service, repo, tokenRepo } = setup();
    const user = {
      id: 'user-1',
      emailVerifiedAt: null,
      status: Status.INACTIVE,
      isLocked: false,
      forcePasswordChange: false,
      tokenVersion: 0,
      refreshTokenHash: 'refresh-token',
      roles: [],
    } as unknown as UsersEntity;
    repo.findOne.mockResolvedValue(user);

    await service.verifyUser(user.id);

    expect(user.emailVerifiedAt).toEqual(expect.any(Date));
    expect(tokenRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        purpose: 'EMAIL_VERIFICATION',
        consumedAt: expect.anything(),
      }),
      { consumedAt: expect.any(Date) },
    );
    expect(repo.save).toHaveBeenCalledWith(user);
    expect(user.status).toBe(Status.ACTIVE);
  });

  it('deactivates a user and revokes active authentication state', async () => {
    const { service, repo } = setup();
    const user = {
      id: 'user-1',
      emailVerifiedAt: new Date(),
      status: Status.ACTIVE,
      isLocked: false,
      forcePasswordChange: false,
      tokenVersion: 0,
      refreshTokenHash: 'refresh-token',
      roles: [],
    } as unknown as UsersEntity;
    repo.findOne.mockResolvedValue(user);

    await service.deactivateUser(user.id);

    expect(user.status).toBe(Status.INACTIVE);
    expect(user.tokenVersion).toBe(1);
    expect(user.refreshTokenHash).toBeNull();
    expect(repo.save).toHaveBeenCalledWith(user);
  });
});
