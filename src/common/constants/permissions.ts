import { Role } from '../../generated/prisma/enums';

export const Permission = {
  USERS_READ: 'users.read',
  USERS_BLOCK: 'users.block',
  JOBS_MODERATE: 'jobs.moderate',
  LEGAL_MANAGE: 'legal.manage',
  METRICS_READ: 'metrics.read',
  AUDIT_READ: 'audit.read',
  ADMINS_MANAGE: 'admins.manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_ADMIN_PERMISSIONS: Permission[] = Object.values(Permission);

/** Permissions an ADMIN user may be assigned. `admins.manage` is SUPER_ADMIN only. */
export const ASSIGNABLE_ADMIN_PERMISSIONS: Permission[] =
  ALL_ADMIN_PERMISSIONS.filter(
    (permission) => permission !== Permission.ADMINS_MANAGE,
  );

export function permissionsToSeedForRole(role: Role): Permission[] {
  if (role === 'ADMIN') {
    return [...ASSIGNABLE_ADMIN_PERMISSIONS];
  }
  return [];
}
