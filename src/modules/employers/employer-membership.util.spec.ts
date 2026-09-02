import {
  canPayEmployerMembership,
  isEmployerMembershipActive,
  isEmployerProfileComplete,
} from './employer-membership.util';

describe('isEmployerProfileComplete', () => {
  it('requires name, district, and a contact phone or email', () => {
    expect(isEmployerProfileComplete(null)).toBe(false);
    expect(
      isEmployerProfileComplete({
        name: 'Acme',
        districtId: 'district-1',
        contactPhone: null,
        contactEmail: null,
      }),
    ).toBe(false);
    expect(
      isEmployerProfileComplete({
        name: 'Acme',
        districtId: null,
        contactPhone: '+919876543210',
        contactEmail: null,
      }),
    ).toBe(false);
    expect(
      isEmployerProfileComplete({
        name: 'Acme',
        districtId: 'district-1',
        contactPhone: '+919876543210',
        contactEmail: null,
      }),
    ).toBe(true);
    expect(
      isEmployerProfileComplete({
        name: 'Acme',
        districtId: 'district-1',
        contactPhone: null,
        contactEmail: 'ops@example.com',
      }),
    ).toBe(true);
  });
});

describe('canPayEmployerMembership', () => {
  it('requires a complete profile, active plan, inactive membership, and Razorpay', () => {
    expect(
      canPayEmployerMembership({
        profileComplete: true,
        planActive: true,
        status: 'INACTIVE',
        razorpayConfigured: true,
      }),
    ).toBe(true);
    expect(
      canPayEmployerMembership({
        profileComplete: false,
        planActive: true,
        status: 'INACTIVE',
        razorpayConfigured: true,
      }),
    ).toBe(false);
    expect(
      canPayEmployerMembership({
        profileComplete: true,
        planActive: true,
        status: 'ACTIVE',
        razorpayConfigured: true,
      }),
    ).toBe(false);
    expect(
      canPayEmployerMembership({
        profileComplete: true,
        planActive: true,
        status: 'INACTIVE',
        razorpayConfigured: false,
      }),
    ).toBe(false);
  });
});

describe('isEmployerMembershipActive', () => {
  it('is true only for ACTIVE organization membership', () => {
    expect(isEmployerMembershipActive('ACTIVE')).toBe(true);
    expect(isEmployerMembershipActive('INACTIVE')).toBe(false);
    expect(isEmployerMembershipActive(null)).toBe(false);
    expect(isEmployerMembershipActive(undefined)).toBe(false);
  });
});
