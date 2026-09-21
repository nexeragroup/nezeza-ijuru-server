import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

const publicContext = {
  getHandler: () => function handler() {},
  getClass: () => class Controller {},
} as unknown as ExecutionContext;

describe('public authorization routes', () => {
  it('bypasses role checks for public handlers', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;

    expect(new RolesGuard(reflector).canActivate(publicContext)).toBe(true);
  });

  it('bypasses permission checks for public handlers', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;

    expect(new PermissionsGuard(reflector).canActivate(publicContext)).toBe(
      true,
    );
  });
});
