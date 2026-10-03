import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import { CsrfMiddleware } from './csrf.middleware';

describe('CsrfMiddleware', () => {
  const secret = 'a'.repeat(32);

  function request(path: string): Request {
    return {
      method: 'POST',
      path,
      sessionID: 'session-id',
      cookies: {},
      get: jest.fn(),
    } as unknown as Request;
  }

  it('exempts login while protecting refresh', () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService;
    const middleware = new CsrfMiddleware(config);
    const next = jest.fn() as unknown as NextFunction;

    middleware.use(request('/api/v1/auth/login'), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(config.getOrThrow).not.toHaveBeenCalled();
    expect(() =>
      middleware.use(request('/api/v1/auth/refresh'), {} as Response, next),
    ).toThrow(ForbiddenException);
  });
});
