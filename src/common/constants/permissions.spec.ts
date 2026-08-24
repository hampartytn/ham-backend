import { Permission, permissionsToSeedForRole } from './permissions';

describe('permissionsToSeedForRole', () => {
  it('assigns assignable admin permissions only to ADMIN', () => {
    const grants = permissionsToSeedForRole('ADMIN');
    expect(grants).toEqual(
      expect.arrayContaining([
        Permission.USERS_READ,
        Permission.USERS_BLOCK,
        Permission.JOBS_MODERATE,
      ]),
    );
    expect(grants).not.toContain(Permission.ADMINS_MANAGE);
  });

  it('does not insert permission rows for SUPER_ADMIN', () => {
    expect(permissionsToSeedForRole('SUPER_ADMIN')).toEqual([]);
  });

  it('does not insert permission rows for employee or employer', () => {
    expect(permissionsToSeedForRole('EMPLOYEE')).toEqual([]);
    expect(permissionsToSeedForRole('EMPLOYER')).toEqual([]);
  });
});
