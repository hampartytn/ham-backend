import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountStatusGuard } from './account-status.guard';
import { PrismaService } from '../../database/prisma.service';
import { ErrorCode } from '../constants/error-codes';

function httpContext(user: { sub: string }): ExecutionContext {
  const request = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AccountStatusGuard', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };

  it('rejects suspended accounts with ACCOUNT_SUSPENDED', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'EMPLOYEE',
          accountStatus: 'SUSPENDED',
          phone: '+919900000003',
          preferredLanguage: 'ta',
          deletedAt: null,
        }),
      },
    };
    const guard = new AccountStatusGuard(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(httpContext({ sub: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      guard.canActivate(httpContext({ sub: 'user-1' })),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.ACCOUNT_SUSPENDED },
    });
  });

  it('rejects deleted accounts as unauthenticated', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          deletedAt: new Date(),
          accountStatus: 'ACTIVE',
        }),
      },
    };
    const guard = new AccountStatusGuard(
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
    );

    await expect(
      guard.canActivate(httpContext({ sub: 'user-1' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
