import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { setupApp } from './../src/app.setup';
import { MockSmsProvider } from './../src/integrations/messaging/mock-sms.provider';
import { ErrorEnvelope } from './../src/common/constants/error-codes';

const PHONE_PREFIX = '+91999';
const PASSWORD = 'CorrectHorse1';
const NEW_PASSWORD = 'CorrectHorse2';

type TokenPairBody = {
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
    user: {
      id: string;
      role: string;
      phone: string;
      preferredLanguage: string;
      accountStatus: string;
    };
  };
};

function uniquePhone(): string {
  return `${PHONE_PREFIX}${randomInt(1_000_000, 9_999_999)}`;
}

function jwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) {
    throw new Error('invalid jwt');
  }
  return JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

async function createApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

describe('Authentication (e2e)', () => {
  let app!: INestApplication;
  let prisma!: PrismaService;
  let sms!: MockSmsProvider;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    sms = app.get(MockSmsProvider);
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.user.findMany({
        where: { phone: { startsWith: PHONE_PREFIX } },
        select: { id: true },
      });
      const userIds = users.map((user) => user.id);
      await prisma.otpChallenge.deleteMany({
        where: { phone: { startsWith: PHONE_PREFIX } },
      });
      await prisma.authEvent.deleteMany({
        where: {
          OR: [
            { phone: { startsWith: PHONE_PREFIX } },
            ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
          ],
        },
      });
      await prisma.user.deleteMany({
        where: { phone: { startsWith: PHONE_PREFIX } },
      });
    }
    await app?.close();
  });

  it('registers employee/employer, rejects ADMIN, and never returns passwordHash', async () => {
    const phone = uniquePhone();
    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone,
        role: 'EMPLOYEE',
        preferredLanguage: 'ta',
        password: PASSWORD,
      })
      .expect(201);

    expect(response.body).toEqual({
      data: {
        userId: expect.any(String) as string,
        phone,
        accountStatus: 'PENDING_PHONE',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/i);

    const profile = await prisma.employeeProfile.findUnique({
      where: {
        userId: (response.body as { data: { userId: string } }).data.userId,
      },
    });
    expect(profile).not.toBeNull();

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone,
        role: 'EMPLOYEE',
        preferredLanguage: 'ta',
        password: PASSWORD,
      })
      .expect(409)
      .expect((res) => {
        expect((res.body as ErrorEnvelope).error.code).toBe('CONFLICT');
      });

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone: uniquePhone(),
        role: 'ADMIN',
        preferredLanguage: 'en',
        password: PASSWORD,
      })
      .expect(400);

    const employerPhone = uniquePhone();
    const employer = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone: employerPhone,
        role: 'EMPLOYER',
        preferredLanguage: 'en',
      })
      .expect(201);
    const employerProfile = await prisma.employerProfile.findUnique({
      where: {
        userId: (employer.body as { data: { userId: string } }).data.userId,
      },
    });
    expect(employerProfile).not.toBeNull();
  });

  it('defaults preferredLanguage to hi when omitted on register', async () => {
    const phone = uniquePhone();
    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone,
        role: 'EMPLOYEE',
        password: PASSWORD,
      })
      .expect(201);

    const userId = (response.body as { data: { userId: string } }).data.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.preferredLanguage).toBe('hi');
  });

  it('verifies register OTP, issues tokens, and protects /auth/session', async () => {
    const phone = uniquePhone();
    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone,
        role: 'EMPLOYEE',
        preferredLanguage: 'ta',
        password: PASSWORD,
      })
      .expect(201);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/session')
      .expect(401);

    const otpRequest = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'REGISTER' })
      .expect(200);
    expect(otpRequest.body).toEqual({ data: { expiresIn: 300 } });

    const code = sms.peek(phone, 'REGISTER');
    expect(code).toMatch(/^\d{6}$/);

    const verified = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, purpose: 'REGISTER', code })
      .expect(200);

    const body = verified.body as TokenPairBody;
    expect(body.data.tokenType).toBe('Bearer');
    expect(body.data.expiresIn).toBe(900);
    expect(body.data.user).toMatchObject({
      phone,
      role: 'EMPLOYEE',
      accountStatus: 'ACTIVE',
    });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash/i);

    const payload = jwtPayload(body.data.accessToken);
    expect(payload.sub).toBe(body.data.user.id);
    expect(payload.role).toBe('EMPLOYEE');
    expect(payload.phone).toBeUndefined();

    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          data: {
            id: body.data.user.id,
            role: 'EMPLOYEE',
            phone,
            preferredLanguage: 'ta',
            accountStatus: 'ACTIVE',
          },
        });
      });
  });

  it('does not reveal account existence on LOGIN OTP request', async () => {
    const unknown = uniquePhone();
    const known = uniquePhone();
    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone: known,
        role: 'EMPLOYEE',
        preferredLanguage: 'ta',
        password: PASSWORD,
      });

    const missing = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/request')
      .send({ phone: unknown, purpose: 'LOGIN' })
      .expect(200);
    const pending = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/request')
      .send({ phone: known, purpose: 'LOGIN' })
      .expect(200);

    expect(missing.body).toEqual({ data: { expiresIn: 300 } });
    expect(pending.body).toEqual({ data: { expiresIn: 300 } });
    expect(sms.peek(unknown, 'LOGIN')).toBeUndefined();
    expect(sms.peek(known, 'LOGIN')).toBeUndefined();
  });

  it('returns a generic error for wrong or expired OTP', async () => {
    const phone = uniquePhone();
    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/register')
      .send({
        phone,
        role: 'EMPLOYEE',
        preferredLanguage: 'ta',
      });
    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'REGISTER' });

    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, purpose: 'REGISTER', code: '000000' })
      .expect(401);

    expect((response.body as ErrorEnvelope).error.code).toBe(
      'INVALID_OR_EXPIRED_CODE',
    );
  });

  it('logs in with password using generic INVALID_CREDENTIALS', async () => {
    const phone = uniquePhone();
    await registerAndVerify(app, sms, phone, PASSWORD);

    const success = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone, password: PASSWORD })
      .expect(200);
    expect((success.body as TokenPairBody).data.user.phone).toBe(phone);

    const unknown = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone: uniquePhone(), password: PASSWORD })
      .expect(401);
    const wrong = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone, password: 'WrongPassword1' })
      .expect(401);

    expect((unknown.body as ErrorEnvelope).error.code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect((wrong.body as ErrorEnvelope).error.code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect((unknown.body as ErrorEnvelope).error.message).toBe(
      (wrong.body as ErrorEnvelope).error.message,
    );
  });

  it('logs in with LOGIN OTP after the account is active', async () => {
    const phone = uniquePhone();
    await registerAndVerify(app, sms, phone, PASSWORD);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'LOGIN' })
      .expect(200);
    const code = sms.peek(phone, 'LOGIN');
    expect(code).toMatch(/^\d{6}$/);

    const verified = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, purpose: 'LOGIN', code })
      .expect(200);
    expect((verified.body as TokenPairBody).data.user.accountStatus).toBe(
      'ACTIVE',
    );
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const phone = uniquePhone();
    const first = await registerAndVerify(app, sms, phone, PASSWORD);
    const rotated = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);

    const next = rotated.body as TokenPairBody;
    expect(next.data.refreshToken).not.toBe(first.refreshToken);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: next.data.refreshToken })
      .expect(401);

    const reuseEvent = await prisma.authEvent.findFirst({
      where: { userId: first.userId, type: 'REFRESH_REUSE' },
    });
    expect(reuseEvent).not.toBeNull();
  });

  it('logs out so refresh fails while access still works', async () => {
    const phone = uniquePhone();
    const session = await registerAndVerify(app, sms, phone, PASSWORD);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: session.refreshToken })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ data: { success: true } });
      });

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
  });

  it('rejects a suspended account with ACCOUNT_SUSPENDED', async () => {
    const phone = uniquePhone();
    const session = await registerAndVerify(app, sms, phone, PASSWORD);
    await prisma.user.update({
      where: { id: session.userId },
      data: { accountStatus: 'SUSPENDED' },
    });

    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
    expect((response.body as ErrorEnvelope).error.code).toBe(
      'ACCOUNT_SUSPENDED',
    );

    const login = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone, password: PASSWORD })
      .expect(403);
    expect((login.body as ErrorEnvelope).error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('sets and resets passwords without auto-login on reset', async () => {
    const phone = uniquePhone();
    const session = await registerAndVerify(app, sms, phone, PASSWORD);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/password/set')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ password: NEW_PASSWORD })
      .expect(400);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/password/set')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ password: NEW_PASSWORD, currentPassword: PASSWORD })
      .expect(200);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone, password: NEW_PASSWORD })
      .expect(200);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/request')
      .send({ phone, purpose: 'PASSWORD_RESET' })
      .expect(200);
    const otp = sms.peek(phone, 'PASSWORD_RESET');
    const verify = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/otp/verify')
      .send({ phone, purpose: 'PASSWORD_RESET', code: otp })
      .expect(200);

    const resetToken = (verify.body as { data: { resetToken: string } }).data
      .resetToken;
    expect(resetToken).toEqual(expect.any(String));
    expect(
      (verify.body as { data: Record<string, unknown> }).data.accessToken,
    ).toBeUndefined();

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/password/reset')
      .send({ phone, resetToken, newPassword: 'CorrectHorse3' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ data: { success: true } });
      });

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/password/reset')
      .send({ phone, resetToken, newPassword: 'CorrectHorse4' })
      .expect(401);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone, password: 'CorrectHorse3' })
      .expect(200);
  });

  it('keeps health public after JWT is global', async () => {
    await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200);
    await request(app.getHttpServer() as Server)
      .get('/ready')
      .expect(200);
  });
});

describe('Auth throttling (e2e)', () => {
  let app: INestApplication;
  const previous = process.env.THROTTLE_AUTH_LIMIT;

  beforeAll(async () => {
    process.env.THROTTLE_AUTH_LIMIT = '2';
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    if (previous === undefined) {
      delete process.env.THROTTLE_AUTH_LIMIT;
    } else {
      process.env.THROTTLE_AUTH_LIMIT = previous;
    }
  });

  it('returns 429 RATE_LIMITED after a login burst', async () => {
    const server = app.getHttpServer() as Server;
    const payload = { phone: uniquePhone(), password: PASSWORD };
    await request(server).post('/api/v1/auth/login').send(payload);
    await request(server).post('/api/v1/auth/login').send(payload);
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send(payload)
      .expect(429);

    expect((response.body as ErrorEnvelope).error.code).toBe('RATE_LIMITED');
  });
});

async function registerAndVerify(
  app: INestApplication,
  sms: MockSmsProvider,
  phone: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const server = app.getHttpServer() as Server;
  await request(server).post('/api/v1/auth/register').send({
    phone,
    role: 'EMPLOYEE',
    preferredLanguage: 'ta',
    password,
  });
  await request(server)
    .post('/api/v1/auth/otp/request')
    .send({ phone, purpose: 'REGISTER' });
  const code = sms.peek(phone, 'REGISTER');
  const verified = await request(server)
    .post('/api/v1/auth/otp/verify')
    .send({ phone, purpose: 'REGISTER', code })
    .expect(200);
  const body = verified.body as TokenPairBody;
  return {
    accessToken: body.data.accessToken,
    refreshToken: body.data.refreshToken,
    userId: body.data.user.id,
  };
}
