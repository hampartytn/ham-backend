import { createHash, randomInt } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

loadEnv({ path: resolve(__dirname, '../.env'), quiet: true });

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = 'CorrectHorse1';
const phone = `+91870${randomInt(1_000_000, 9_999_999)}`;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function recoverOtp(phoneNumber: string): Promise<string> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone: phoneNumber, purpose: 'REGISTER', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) {
    throw new Error('No REGISTER OTP row');
  }
  for (let i = 0; i < 1_000_000; i += 1) {
    const code = i.toString().padStart(6, '0');
    if (sha256(code) === challenge.codeHash) {
      return code;
    }
  }
  throw new Error('Could not recover OTP');
}

async function call(
  title: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: unknown = await response.json();
  console.log(`\n=== ${title} → HTTP ${response.status} ===`);
  console.log(JSON.stringify(json, null, 2));
  return { status: response.status, json };
}

async function cleanup(userId: string | undefined) {
  await prisma.otpChallenge.deleteMany({ where: { phone } });
  if (!userId) {
    return;
  }
  await prisma.authEvent.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.employeeProfile.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

async function main() {
  console.log(`Against: ${BASE}`);
  console.log(`Phone: ${phone}`);
  console.log(
    'expiresIn: 300 = OTP lifetime in seconds (5 minutes). Not an error. The JSON never includes the 6-digit code.',
  );

  let userId: string | undefined;
  try {
    const first = await call('1. Register (first)', 'POST', '/api/v1/auth/register', {
      phone,
      role: 'EMPLOYEE',
      preferredLanguage: 'ta',
      password: PASSWORD,
    });
    userId = (first.json as { data?: { userId?: string } }).data?.userId;

    await call('2. Register (same phone)', 'POST', '/api/v1/auth/register', {
      phone,
      role: 'EMPLOYEE',
      preferredLanguage: 'ta',
      password: PASSWORD,
    });

    await call('3. Login before phone verify', 'POST', '/api/v1/auth/login', {
      phone,
      password: PASSWORD,
    });

    await call('4. OTP request REGISTER', 'POST', '/api/v1/auth/otp/request', {
      phone,
      purpose: 'REGISTER',
    });

    const code = await recoverOtp(phone);
    console.log(
      `\nOTP was not in the HTTP body. Recovered from the hashed challenge for this demo: ${code}`,
    );

    const verify = await call(
      '5. OTP verify REGISTER',
      'POST',
      '/api/v1/auth/otp/verify',
      { phone, purpose: 'REGISTER', code },
    );
    const verifyData = (verify.json as { data?: { user?: unknown; accessToken?: string } })
      .data;
    console.log(
      `accountStatus=${JSON.stringify((verifyData as { user?: { accountStatus?: string } })?.user?.accountStatus)} tokens=${Boolean(verifyData?.accessToken)}`,
    );

    const login = await call('6. Login after ACTIVE', 'POST', '/api/v1/auth/login', {
      phone,
      password: PASSWORD,
    });
    const loginData = (login.json as { data?: { accessToken?: string } }).data;
    console.log(`login tokens=${Boolean(loginData?.accessToken)}`);
  } finally {
    await cleanup(userId);
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
