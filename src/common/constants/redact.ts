/** Default Pino / audit redact keys from SECURITY.md. */
export const DEFAULT_REDACT_KEYS = [
  'password',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'otp',
  'code',
  'aadhaar',
  'uid',
  'secret',
  'clientSecret',
  'cardNumber',
  'cvv',
  'pan',
  'DATABASE_URL',
] as const;
