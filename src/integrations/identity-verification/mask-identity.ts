const FULL_AADHAAR_DIGITS = /^\d{12}$/;

export function looksLikeFullAadhaar(value: string): boolean {
  return FULL_AADHAAR_DIGITS.test(value.replace(/\D/g, ''));
}

export function sanitizeMaskedIdentity(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (looksLikeFullAadhaar(trimmed)) {
    return null;
  }
  return trimmed.slice(0, 32);
}

export const MOCK_MASKED_IDENTITY = 'XXXX-XXXX-1234';
