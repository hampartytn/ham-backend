import { resolveSwaggerEnabled } from '../open-api/swagger.policy';

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '14d',
    refreshCookieEnabled: process.env.JWT_REFRESH_COOKIE_ENABLED === 'true',
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  swagger: {
    enabled: resolveSwaggerEnabled(
      process.env.NODE_ENV ?? 'development',
      process.env.SWAGGER_ENABLED,
    ),
    path: process.env.SWAGGER_PATH ?? 'docs',
    user: process.env.SWAGGER_USER,
    password: process.env.SWAGGER_PASSWORD,
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: process.env.LOG_REDACT ?? '',
  },
  throttle: {
    ttlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
    limit: Number(process.env.THROTTLE_LIMIT ?? 100),
    authTtlMs: Number(process.env.THROTTLE_AUTH_TTL_MS ?? 60_000),
    authLimit: Number(process.env.THROTTLE_AUTH_LIMIT ?? 10),
  },
  fileStorage: {
    provider: process.env.FILE_STORAGE_PROVIDER ?? 'local',
    localDir: process.env.FILE_STORAGE_LOCAL_DIR ?? './storage',
    maxBytes: Number(process.env.FILE_MAX_BYTES ?? 2_097_152),
  },
  identity: {
    provider: process.env.IDENTITY_PROVIDER ?? 'mock',
    webhookSecret:
      process.env.IDENTITY_WEBHOOK_SECRET ??
      'replace-with-identity-webhook-secret-min-32chars',
  },
  membership: {
    termsVersion:
      process.env.HAM_MEMBERSHIP_TERMS_VERSION ?? 'ham-membership-2026-08',
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER ?? 'stub',
    stubEnabled: process.env.PAYMENT_STUB_ENABLED !== 'false',
    webhookSecret:
      process.env.PAYMENT_WEBHOOK_SECRET ??
      'replace-with-payment-webhook-secret-min-32chars',
    employerActivationPaise: Number(
      process.env.PAYMENT_EMPLOYER_ACTIVATION_PAISE ?? 1,
    ),
  },
});
