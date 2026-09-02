export const DEFAULT_MEMBERSHIP_TERMS_VERSION = 'ham-membership-2026-08';
export const MAX_CONSENT_IP_LENGTH = 45;
export const MAX_CONSENT_UA_LENGTH = 255;

export const MEMBERSHIP_INFO_COPY_KEYS = [
  'membership.info.title',
  'membership.info.body',
] as const;

export function canJoinMembership(
  identityVerified: boolean,
  status: string | null,
  membershipPaid: boolean,
): boolean {
  return identityVerified && membershipPaid && status !== 'JOINED';
}

export function canPayMembership(
  identityVerified: boolean,
  status: string | null,
  membershipPaid: boolean,
  planActive: boolean,
): boolean {
  return (
    identityVerified &&
    planActive &&
    !membershipPaid &&
    status !== 'JOINED'
  );
}

export function truncateConsentField(
  value: string | null | undefined,
  max: number,
): string | null {
  if (value == null || value.length === 0) {
    return null;
  }
  return value.length <= max ? value : value.slice(0, max);
}
