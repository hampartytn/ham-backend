import { hashPassword, needsRehash, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashes with Argon2id and verifies the original password', async () => {
    const hash = await hashPassword('CorrectHorse1');
    expect(hash).not.toContain('CorrectHorse1');
    expect(await verifyPassword(hash, 'CorrectHorse1')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });
});
