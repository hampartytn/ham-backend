import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';

export function throwInvalidCredentials(): never {
  throw new UnauthorizedException({
    code: ErrorCode.INVALID_CREDENTIALS,
    message: 'Invalid credentials',
  });
}

export function throwInvalidCode(): never {
  throw new UnauthorizedException({
    code: ErrorCode.INVALID_OR_EXPIRED_CODE,
    message: 'Invalid or expired code',
  });
}

export function throwUnauthorized(): never {
  throw new UnauthorizedException({
    code: ErrorCode.UNAUTHORIZED,
    message: 'Unauthorized',
  });
}

export function throwAccountSuspended(): never {
  throw new ForbiddenException({
    code: ErrorCode.ACCOUNT_SUSPENDED,
    message: 'Account is suspended',
  });
}

export function throwAccountBlocked(): never {
  throw new ForbiddenException({
    code: ErrorCode.ACCOUNT_BLOCKED,
    message: 'Account is blocked',
  });
}

export function throwRegisterConflict(): never {
  throw new ConflictException({
    code: ErrorCode.CONFLICT,
    message: 'Unable to register with this phone',
  });
}
