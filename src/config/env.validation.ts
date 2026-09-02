import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

const EXAMPLE_SECRET_FRAGMENTS = [
  'replace-with-long-random',
  'replace-with-different-long-random',
  'replace-with-identity-webhook',
  'replace-with-payment-webhook',
  'USER:PASSWORD@HOST',
];

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  API_PREFIX = 'api';

  @IsString()
  @IsNotEmpty()
  API_VERSION = '1';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN = '14d';

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  JWT_REFRESH_COOKIE_ENABLED = false;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS = 'http://localhost:3001';

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  @IsNotEmpty()
  SWAGGER_PATH = 'docs';

  @IsOptional()
  @IsString()
  SWAGGER_USER?: string;

  @IsOptional()
  @IsString()
  SWAGGER_PASSWORD?: string;

  @IsString()
  @IsNotEmpty()
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  LOG_REDACT =
    'password,passwordHash,accessToken,refreshToken,authorization,aadhaar,otp,secret,cardNumber';

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS = 60_000;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 100;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_TTL_MS = 60_000;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT = 10;

  @IsString()
  @IsNotEmpty()
  IDENTITY_PROVIDER = 'mock';

  @IsString()
  @MinLength(32)
  IDENTITY_WEBHOOK_SECRET = 'replace-with-identity-webhook-secret-min-32chars';

  @IsString()
  @IsNotEmpty()
  HAM_MEMBERSHIP_TERMS_VERSION = 'ham-membership-2026-08';

  @IsString()
  @IsNotEmpty()
  SMS_PROVIDER = 'mock';

  @IsString()
  @IsNotEmpty()
  EMAIL_PROVIDER = 'stub';

  @IsString()
  @IsNotEmpty()
  PAYMENT_PROVIDER = 'stub';

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  PAYMENT_STUB_ENABLED = true;

  @IsString()
  @MinLength(32)
  PAYMENT_WEBHOOK_SECRET = 'replace-with-payment-webhook-secret-min-32chars';

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  PAYMENT_EMPLOYER_ACTIVATION_PAISE = 1;

  @IsOptional()
  @IsString()
  RAZORPAY_KEY_ID?: string;

  @IsOptional()
  @IsString()
  RAZORPAY_KEY_SECRET?: string;

  @IsOptional()
  @IsString()
  RAZORPAY_WEBHOOK_SECRET?: string;

  @IsString()
  @IsNotEmpty()
  FILE_STORAGE_PROVIDER = 'local';

  @IsString()
  @IsNotEmpty()
  FILE_STORAGE_LOCAL_DIR = './storage';

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  FILE_MAX_BYTES = 2_097_152;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  SEED_DEV_ADMIN = false;

  @IsOptional()
  @IsString()
  SEED_DEV_ADMIN_PHONE?: string;

  @IsOptional()
  @IsString()
  SEED_DEV_ADMIN_PASSWORD?: string;
}

export function assertProductionSecrets(env: EnvironmentVariables): void {
  if (env.NODE_ENV !== NodeEnv.Production) {
    return;
  }

  const haystack = `${env.JWT_ACCESS_SECRET} ${env.JWT_REFRESH_SECRET} ${env.DATABASE_URL} ${env.IDENTITY_WEBHOOK_SECRET} ${env.PAYMENT_WEBHOOK_SECRET}`;
  const usesExampleValue = EXAMPLE_SECRET_FRAGMENTS.some((fragment) =>
    haystack.includes(fragment),
  );

  if (usesExampleValue) {
    throw new Error(
      'Refusing to boot: production DATABASE_URL or JWT secrets must not use example placeholder values',
    );
  }

  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
    throw new Error(
      'Refusing to boot: production CORS_ORIGINS must be an explicit allowlist and must not include *',
    );
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .filter((message) => message.length > 0)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${messages}`);
  }

  assertProductionSecrets(validated);
  return validated;
}
