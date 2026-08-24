import { detectProfileImageMime } from './image-mime';

describe('detectProfileImageMime', () => {
  it('detects jpeg, png, and webp magic bytes', () => {
    expect(detectProfileImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      'image/jpeg',
    );
    expect(
      detectProfileImageMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    const webp = Buffer.alloc(12);
    webp.write('RIFF', 0);
    webp.write('WEBP', 8);
    expect(detectProfileImageMime(webp)).toBe('image/webp');
    expect(detectProfileImageMime(Buffer.from('not-an-image'))).toBeUndefined();
  });
});
