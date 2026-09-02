import {
  canJoinMembership,
  canPayMembership,
  truncateConsentField,
} from './membership.util';

describe('membership helpers', () => {
  it('allows join only when verified, paid, and not already JOINED', () => {
    expect(canJoinMembership(false, null, false)).toBe(false);
    expect(canJoinMembership(true, null, false)).toBe(false);
    expect(canJoinMembership(true, null, true)).toBe(true);
    expect(canJoinMembership(true, 'DECLINED', true)).toBe(true);
    expect(canJoinMembership(true, 'JOINED', true)).toBe(false);
    expect(canJoinMembership(false, 'DECLINED', true)).toBe(false);
  });

  it('allows pay only when verified, unpaid, and a plan is active', () => {
    expect(canPayMembership(true, null, false, true)).toBe(true);
    expect(canPayMembership(false, null, false, true)).toBe(false);
    expect(canPayMembership(true, 'JOINED', false, true)).toBe(false);
    expect(canPayMembership(true, null, true, true)).toBe(false);
    expect(canPayMembership(true, null, false, false)).toBe(false);
  });

  it('truncates consent ip and user-agent', () => {
    expect(truncateConsentField('127.0.0.1', 45)).toBe('127.0.0.1');
    expect(truncateConsentField('x'.repeat(300), 255)).toHaveLength(255);
    expect(truncateConsentField('', 255)).toBeNull();
    expect(truncateConsentField(undefined, 45)).toBeNull();
  });
});
