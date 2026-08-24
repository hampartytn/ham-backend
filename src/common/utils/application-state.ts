import type { ApplicationStatus } from '../../generated/prisma/enums';

export const EMPLOYER_APPLICATION_STATUSES = [
  'VIEWED',
  'SHORTLISTED',
  'REJECTED',
  'HIRED',
] as const;

export type EmployerApplicationStatus =
  (typeof EMPLOYER_APPLICATION_STATUSES)[number];

export function canEmployeeWithdraw(status: ApplicationStatus): boolean {
  return status !== 'HIRED' && status !== 'WITHDRAWN';
}

export function canEmployerSetStatus(
  current: ApplicationStatus,
  next: ApplicationStatus,
): boolean {
  if (
    next !== 'VIEWED' &&
    next !== 'SHORTLISTED' &&
    next !== 'REJECTED' &&
    next !== 'HIRED'
  ) {
    return false;
  }
  if (current === 'WITHDRAWN' || current === 'HIRED') {
    return false;
  }
  return true;
}
