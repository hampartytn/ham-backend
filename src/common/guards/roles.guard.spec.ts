import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, roleAllowed } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

function httpContext(user?: Partial<AuthenticatedUser>): ExecutionContext {
  const request = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows SUPER_ADMIN on ADMIN routes and rejects EMPLOYEE', () => {
    expect(roleAllowed('SUPER_ADMIN', ['ADMIN'])).toBe(true);
    expect(roleAllowed('EMPLOYEE', ['ADMIN'])).toBe(false);
    expect(roleAllowed('EMPLOYER', ['ADMIN'])).toBe(false);
  });

  it('rejects an employee on an ADMIN route', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === ROLES_KEY) {
          return ['ADMIN'];
        }
        return false;
      }),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() =>
      guard.canActivate(
        httpContext({
          id: 'u1',
          role: 'EMPLOYEE',
          accountStatus: 'ACTIVE',
          phone: '+919900000001',
          preferredLanguage: 'en',
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
