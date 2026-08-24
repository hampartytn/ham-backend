import { NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';

export function isSameUser(callerId: string, resourceUserId: string): boolean {
  return callerId === resourceUserId;
}

export function isSameOrganization(
  callerOrganizationId: string | null | undefined,
  resourceOrganizationId: string | null | undefined,
): boolean {
  return (
    typeof callerOrganizationId === 'string' &&
    callerOrganizationId.length > 0 &&
    callerOrganizationId === resourceOrganizationId
  );
}

export function assertSameUser(callerId: string, resourceUserId: string): void {
  if (!isSameUser(callerId, resourceUserId)) {
    throwNotFound();
  }
}

export function assertSameOrganization(
  callerOrganizationId: string | null | undefined,
  resourceOrganizationId: string | null | undefined,
): void {
  if (!isSameOrganization(callerOrganizationId, resourceOrganizationId)) {
    throwNotFound();
  }
}

function throwNotFound(): never {
  throw new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Resource not found',
  });
}
