import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.PORT ??= '3000';
process.env.API_PREFIX ??= 'api';
process.env.API_VERSION ??= '1';
process.env.DATABASE_URL ??=
  'postgresql://USER:PASSWORD@HOST:5432/ham_backend_test?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-32-characters!!';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-characters!';
process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
process.env.JWT_REFRESH_EXPIRES_IN ??= '14d';
process.env.CORS_ORIGINS ??= 'http://localhost:3001';
process.env.SWAGGER_ENABLED = 'true';
process.env.LOG_LEVEL = 'silent';
process.env.THROTTLE_TTL_MS ??= '60000';
process.env.THROTTLE_LIMIT ??= '100';
process.env.THROTTLE_AUTH_TTL_MS ??= '60000';
process.env.THROTTLE_AUTH_LIMIT = '1000';
process.env.FILE_STORAGE_PROVIDER ??= 'local';
process.env.FILE_STORAGE_LOCAL_DIR ??= './storage/test';
process.env.FILE_MAX_BYTES ??= '2097152';
process.env.IDENTITY_PROVIDER ??= 'mock';
process.env.IDENTITY_WEBHOOK_SECRET ??=
  'test-identity-webhook-secret-min-32chars';
process.env.HAM_MEMBERSHIP_TERMS_VERSION ??= 'ham-membership-2026-08';
process.env.PAYMENT_PROVIDER ??= 'stub';
process.env.PAYMENT_STUB_ENABLED ??= 'true';
process.env.PAYMENT_WEBHOOK_SECRET ??=
  'test-payment-webhook-secret-min-32chars!!';
process.env.PAYMENT_EMPLOYER_ACTIVATION_PAISE ??= '1';
if (!process.env.RAZORPAY_KEY_ID) {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_ham_e2e_placeholder';
}
if (!process.env.RAZORPAY_KEY_SECRET) {
  process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-key-secret-min-32chars!!';
}
if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
  process.env.RAZORPAY_WEBHOOK_SECRET =
    'test-razorpay-webhook-secret-min-32chars';
}
