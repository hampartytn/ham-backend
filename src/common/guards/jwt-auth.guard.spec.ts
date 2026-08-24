import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function httpContext(headers: Record<string, string>): ExecutionContext {
  const request = {
    header: (name: string) => headers[name.toLowerCase()],
    headers,
  };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('allows @Public routes without a token', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY),
    };
    const jwtService = { verify: jest.fn() };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwtService as unknown as JwtService,
    );

    expect(guard.canActivate(httpContext({}))).toBe(true);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('rejects missing Bearer tokens on protected routes', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      { verify: jest.fn() } as unknown as JwtService,
    );

    expect(() => guard.canActivate(httpContext({}))).toThrow(
      UnauthorizedException,
    );
  });
});
