import {
  assertSameOrganization,
  assertSameUser,
  isSameOrganization,
  isSameUser,
} from './ownership';

describe('ownership helpers', () => {
  it('detects same user vs different user', () => {
    expect(isSameUser('user-a', 'user-a')).toBe(true);
    expect(isSameUser('user-a', 'user-b')).toBe(false);
    expect(() => assertSameUser('user-a', 'user-a')).not.toThrow();
    expect(() => assertSameUser('user-a', 'user-b')).toThrow();
  });

  it('detects same org vs different or missing org', () => {
    expect(isSameOrganization('org-a', 'org-a')).toBe(true);
    expect(isSameOrganization('org-a', 'org-b')).toBe(false);
    expect(isSameOrganization(null, 'org-a')).toBe(false);
    expect(isSameOrganization('org-a', null)).toBe(false);
    expect(() => assertSameOrganization('org-a', 'org-a')).not.toThrow();
    expect(() => assertSameOrganization('org-a', 'org-b')).toThrow();
  });
});
