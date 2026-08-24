import { encodeJobCursor, decodeJobCursor } from './cursor';

describe('job feed cursor', () => {
  it('round-trips publishedAt and id', () => {
    const publishedAt = new Date('2026-08-24T12:00:00.000Z');
    const id = '0199aaaa-bbbb-7000-8000-000000000001';
    const encoded = encodeJobCursor(publishedAt, id);
    expect(decodeJobCursor(encoded)).toEqual({ publishedAt, id });
  });

  it('rejects invalid payloads', () => {
    expect(decodeJobCursor('not-a-cursor')).toBeUndefined();
    expect(decodeJobCursor('')).toBeUndefined();
    expect(
      decodeJobCursor(
        Buffer.from('{"p":"nope","i":"x"}', 'utf8').toString('base64url'),
      ),
    ).toBeUndefined();
  });
});
