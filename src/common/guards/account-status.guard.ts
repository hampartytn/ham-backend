import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ErrorCode } from '../constants/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../types/authenticated-user';

@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload | AuthenticatedUser }>();
    const payload = request.user;
    const userId =
      payload && 'sub' in payload
        ? payload.sub
        : payload && 'id' in payload
          ? payload.id
          : undefined;

    if (!userId) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt || user.accountStatus === 'PENDING_PHONE') {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }

    if (user.accountStatus === 'SUSPENDED') {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message: 'Account is suspended',
      });
    }

    if (user.accountStatus === 'BLOCKED') {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_BLOCKED,
        message: 'Account is blocked',
      });
    }

    request.user = {
      id: user.id,
      role: user.role,
      accountStatus: user.accountStatus,
      phone: user.phone,
      preferredLanguage: user.preferredLanguage,
    };
    return true;
  }
}
