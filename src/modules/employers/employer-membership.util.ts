export type EmployerProfileCompletenessInput = {
  name?: string | null;
  districtId?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

export function isEmployerProfileComplete(
  organization: EmployerProfileCompletenessInput | null | undefined,
): boolean {
  if (!organization) {
    return false;
  }
  const name = organization.name?.trim() ?? '';
  const hasContact = Boolean(
    organization.contactPhone?.trim() || organization.contactEmail?.trim(),
  );
  return Boolean(name && organization.districtId && hasContact);
}

export function canPayEmployerMembership(input: {
  profileComplete: boolean;
  planActive: boolean;
  status: string;
  razorpayConfigured: boolean;
}): boolean {
  return (
    input.profileComplete &&
    input.planActive &&
    input.status !== 'ACTIVE' &&
    input.razorpayConfigured
  );
}

export function isEmployerMembershipActive(
  status: string | null | undefined,
): boolean {
  return status === 'ACTIVE';
}
