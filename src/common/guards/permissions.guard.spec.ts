import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { Permission } from '../constants/permissions';
import { PrismaService } from '../../database/prisma.service';

function httpContext(user: { id: string; role: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === PERMISSIONS_KEY) {
        return [Permission.USERS_READ];
      }
      return false;
    }),
  };

  it('allows SUPER_ADMIN without permission rows', async () => {
    const guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      {
        adminUserPermission: { findMany: jest.fn() },
      } as unknown as PrismaService,
    );
    await expect(
      guard.canActivate(httpContext({ id: 'super', role: 'SUPER_ADMIN' })),
    ).resolves.toBe(true);
  });

  it('rejects ADMIN missing the required permission', async () => {
    const guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      {
        adminUserPermission: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService,
    );
    await expect(
      guard.canActivate(httpContext({ id: 'admin', role: 'ADMIN' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
