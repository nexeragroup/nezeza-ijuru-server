import { UnauthorizedException } from '@nestjs/common';
import { UpdatesService } from './updates.service';

describe('UpdatesService', () => {
  const service = new UpdatesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const authenticatedUserId = service as unknown as {
    authenticatedUserId: (user: { sub: string }) => string;
  };

  it('uses the authenticated UUID as the update actor ID', () => {
    expect(
      authenticatedUserId.authenticatedUserId({
        sub: '7a16e39b-616b-4681-978f-51ba2a03e379',
      }),
    ).toBe('7a16e39b-616b-4681-978f-51ba2a03e379');
    expect(() => authenticatedUserId.authenticatedUserId({ sub: '7' })).toThrow(
      UnauthorizedException,
    );
  });
});
