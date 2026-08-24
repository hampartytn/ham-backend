import {
  looksLikeFullAadhaar,
  MOCK_MASKED_IDENTITY,
  sanitizeMaskedIdentity,
} from './mask-identity';

describe('sanitizeMaskedIdentity', () => {
  it('keeps a masked value and refuses a 12-digit Aadhaar', () => {
    expect(sanitizeMaskedIdentity(MOCK_MASKED_IDENTITY)).toBe(
      MOCK_MASKED_IDENTITY,
    );
    expect(looksLikeFullAadhaar('123412341234')).toBe(true);
    expect(sanitizeMaskedIdentity('1234-1234-1234')).toBeNull();
    expect(sanitizeMaskedIdentity('123412341234')).toBeNull();
  });
});
