import { durationToSeconds, hashOpaque } from './token.service';

describe('token helpers', () => {
  it('converts duration strings to seconds', () => {
    expect(durationToSeconds('15m')).toBe(900);
    expect(durationToSeconds('14d')).toBe(14 * 24 * 60 * 60);
    expect(durationToSeconds('30s')).toBe(30);
  });

  it('hashes opaque tokens with SHA-256 hex', () => {
    const hash = hashOpaque('refresh-token');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashOpaque('refresh-token'));
    expect(hash).not.toBe(hashOpaque('other-token'));
  });
});
