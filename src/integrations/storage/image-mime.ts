export const PROFILE_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ProfileImageMime = (typeof PROFILE_IMAGE_MIMES)[number];

export function detectProfileImageMime(
  contents: Buffer,
): ProfileImageMime | undefined {
  if (
    contents.length >= 3 &&
    contents[0] === 0xff &&
    contents[1] === 0xd8 &&
    contents[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    contents.length >= 8 &&
    contents[0] === 0x89 &&
    contents[1] === 0x50 &&
    contents[2] === 0x4e &&
    contents[3] === 0x47 &&
    contents[4] === 0x0d &&
    contents[5] === 0x0a &&
    contents[6] === 0x1a &&
    contents[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    contents.length >= 12 &&
    contents.toString('ascii', 0, 4) === 'RIFF' &&
    contents.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

export function extensionForMime(mime: ProfileImageMime): string {
  if (mime === 'image/jpeg') {
    return 'jpg';
  }
  if (mime === 'image/png') {
    return 'png';
  }
  return 'webp';
}
