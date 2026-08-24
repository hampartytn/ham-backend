import { canJoinMembership, truncateConsentField } from './membership.util';

describe('membership helpers', () => {
  it('allows join only when verified and not already JOINED', () => {
    expect(canJoinMembership(false, null)).toBe(false);
    expect(canJoinMembership(true, null)).toBe(true);
    expect(canJoinMembership(true, 'DECLINED')).toBe(true);
    expect(canJoinMembership(true, 'JOINED')).toBe(false);
    expect(canJoinMembership(false, 'DECLINED')).toBe(false);
  });

  it('truncates consent ip and user-agent', () => {
    expect(truncateConsentField('127.0.0.1', 45)).toBe('127.0.0.1');
    expect(truncateConsentField('x'.repeat(300), 255)).toHaveLength(255);
    expect(truncateConsentField('', 255)).toBeNull();
    expect(truncateConsentField(undefined, 45)).toBeNull();
  });
});
