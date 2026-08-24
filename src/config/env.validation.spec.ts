import { NodeEnv, validateEnv } from './env.validation';

const validBase = {
  NODE_ENV: NodeEnv.Development,
  PORT: '3000',
  API_PREFIX: 'api',
  API_VERSION: '1',
  DATABASE_URL:
    'postgresql://USER:PASSWORD@HOST:5432/ham_backend?schema=public',
  JWT_ACCESS_SECRET: 'replace-with-long-random-access-secret-min-32-chars',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'replace-with-different-long-random-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '14d',
  CORS_ORIGINS: 'http://localhost:3001',
};

describe('validateEnv', () => {
  it('accepts development configuration with placeholders', () => {
    const env = validateEnv(validBase);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() =>
      validateEnv({
        ...validBase,
        DATABASE_URL: '',
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('rejects a short JWT secret', () => {
    expect(() =>
      validateEnv({
        ...validBase,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('refuses production boot with example secrets', () => {
    expect(() =>
      validateEnv({
        ...validBase,
        NODE_ENV: NodeEnv.Production,
      }),
    ).toThrow(/example placeholder values/);
  });

  it('accepts production when secrets are not placeholders', () => {
    const env = validateEnv({
      ...validBase,
      NODE_ENV: NodeEnv.Production,
      DATABASE_URL:
        'postgresql://ham:strong-password@db.internal:5432/ham_backend',
      JWT_ACCESS_SECRET: 'production-access-secret-value-32chars',
      JWT_REFRESH_SECRET: 'production-refresh-secret-value-32char',
      IDENTITY_WEBHOOK_SECRET: 'production-identity-webhook-secret-32ch',
      PAYMENT_WEBHOOK_SECRET: 'production-payment-webhook-secret-32chars',
    });
    expect(env.NODE_ENV).toBe(NodeEnv.Production);
  });

  it('refuses production boot when CORS is *', () => {
    expect(() =>
      validateEnv({
        ...validBase,
        NODE_ENV: NodeEnv.Production,
        DATABASE_URL:
          'postgresql://ham:strong-password@db.internal:5432/ham_backend',
        JWT_ACCESS_SECRET: 'production-access-secret-value-32chars',
        JWT_REFRESH_SECRET: 'production-refresh-secret-value-32char',
        IDENTITY_WEBHOOK_SECRET: 'production-identity-webhook-secret-32ch',
        PAYMENT_WEBHOOK_SECRET: 'production-payment-webhook-secret-32chars',
        CORS_ORIGINS: '*',
      }),
    ).toThrow(/CORS_ORIGINS/);
  });
});
