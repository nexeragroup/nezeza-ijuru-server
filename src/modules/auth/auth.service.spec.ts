import { Status } from '../../common/enums/status.enum';
import { UsersEntity } from '../users/entity/users.entity';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('authenticates through the password-selecting username-or-email lookup', async () => {
    const user = {
      id: 'user-id',
      password: 'stored-password-hash',
      status: Status.ACTIVE,
      isLocked: false,
      forcePasswordChange: false,
      emailVerifiedAt: new Date(),
    } as UsersEntity;
    const users = {
      findUserByLoginIdentifier: jest
        .fn()
        .mockResolvedValue(user),
    };
    const passwords = {
      verify: jest
        .fn()
        .mockResolvedValue(true),
    };
    const service = new AuthService(
      users as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      passwords as any,
      {} as any,
    );

    await expect(
      service.validateUser('Ada@example.test', 'correct-password'),
    ).resolves.toBe(user);
    expect(users.findUserByLoginIdentifier).toHaveBeenCalledWith(
      'Ada@example.test',
    );
    expect(passwords.verify).toHaveBeenCalledWith(
      'stored-password-hash',
      'correct-password',
    );
  });
});
