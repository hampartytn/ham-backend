import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { setupApp } from './../src/app.setup';
import { MockSmsProvider } from './../src/integrations/messaging/mock-sms.provider';
import { identityWebhookSignature } from './../src/integrations/identity-verification/webhook-signature';
import { MOCK_MASKED_IDENTITY } from './../src/integrations/identity-verification/mask-identity';
import { ErrorEnvelope } from './../src/common/constants/error-codes';

const PHONE_PREFIX = '+91666';
const PASSWORD = 'CorrectHorse1';
const WEBHOOK_SECRET =
  process.env.IDENTITY_WEBHOOK_SECRET ??
  'test-identity-webhook-secret-min-32chars';

type TokenPairBody = {
  data: {
    accessToken: string;
    user: { id: string; role: string; phone: string };
  };
};

type StartBody = {
  data: {
    verificationId: string;
    status: string;
    provider: string;
    nextStep: string;
  };
};

function uniquePhone(): string {
  return `${PHONE_PREFIX}${randomInt(1_000_000, 9_999_999)}`;
}

async function createApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication({ rawBody: true });
  setupApp(app);
  await app.init();
  return app;
}

describe('Onboarding and verification (e2e)', () => {
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

      if (userIds.length > 0) {
        await prisma.verificationRequest.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.hamMembership.deleteMany({
          where: { userId: { in: userIds } },
        });
      }
      await prisma.webhookEvent.deleteMany({
        where: { providerEventId: { startsWith: 'p7-' } },
      });
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

  it('exposes onboarding flags on GET /me without extra PII', async () => {
    const session = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const me = await request(app.getHttpServer() as Server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const body = me.body as {
      data: {
        onboarding: {
          phoneVerified: boolean;
          profileComplete: boolean;
          identityVerified: boolean;
          hamMembershipStatus: string | null;
        };
      };
    };
    expect(body.data.onboarding).toEqual({
      phoneVerified: true,
      profileComplete: false,
      identityVerified: false,
      hamMembershipStatus: null,
    });
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|aadhaar/i);
  });

  it('starts mock verification, completes it, and refuses a second success', async () => {
    const session = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const started = await request(server)
      .post('/api/v1/verification/start')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({})
      .expect(201);
    const startBody = started.body as StartBody;
    expect(startBody.data.provider).toBe('mock');
    expect(startBody.data.status).toBe('PENDING');
    expect(startBody.data.nextStep).toBe('mock_complete');

    const reused = await request(server)
      .post('/api/v1/verification/start')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({})
      .expect(201);
    expect((reused.body as StartBody).data.verificationId).toBe(
      startBody.data.verificationId,
    );

    const completed = await request(server)
      .post('/api/v1/verification/mock/complete')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        verificationId: startBody.data.verificationId,
        result: 'SUCCEEDED',
      })
      .expect(200);
    const completeBody = completed.body as {
      data: { status: string; maskedIdentity: string | null };
    };
    expect(completeBody.data.status).toBe('SUCCEEDED');
    expect(completeBody.data.maskedIdentity).toBe(MOCK_MASKED_IDENTITY);
    expect(completeBody.data.maskedIdentity).not.toMatch(/\d{12}/);

    await request(server)
      .post('/api/v1/verification/start')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({})
      .expect(409);

    const me = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(
      (me.body as { data: { onboarding: { identityVerified: boolean } } }).data
        .onboarding.identityVerified,
    ).toBe(true);

    const stored = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: startBody.data.verificationId },
    });
    expect(stored.maskedIdentity).toBe(MOCK_MASKED_IDENTITY);
    expect(stored.maskedIdentity).not.toMatch(/\d{12}/);
    expect(JSON.stringify(stored.metadata ?? {})).not.toMatch(
      /aadhaar|123412341234/i,
    );

    const memberships = await prisma.hamMembership.count({
      where: { userId: session.userId },
    });
    expect(memberships).toBe(0);
  });

  it('rejects unsigned webhooks and applies signed events once without joining HAM', async () => {
    const session = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;
    const started = await request(server)
      .post('/api/v1/verification/start')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({})
      .expect(201);
    const verificationId = (started.body as StartBody).data.verificationId;
    const eventId = `p7-${verificationId}`;
    const payload = {
      eventId,
      verificationId,
      result: 'SUCCEEDED' as const,
      maskedIdentity: MOCK_MASKED_IDENTITY,
    };
    const raw = JSON.stringify(payload);
    const signature = identityWebhookSignature(
      Buffer.from(raw),
      WEBHOOK_SECRET,
    );

    const unsigned = await request(server)
      .post('/api/v1/verification/webhooks/mock')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
    expect((unsigned.body as ErrorEnvelope).error.code).toBe('UNAUTHORIZED');

    await request(server)
      .post('/api/v1/verification/webhooks/mock')
      .set('Content-Type', 'application/json')
      .set('X-Identity-Signature', 'sha256=deadbeef')
      .send(raw)
      .expect(401);

    const applied = await request(server)
      .post('/api/v1/verification/webhooks/mock')
      .set('Content-Type', 'application/json')
      .set('X-Identity-Signature', signature)
      .send(raw)
      .expect(200);
    expect(applied.body).toEqual({ received: true });

    const replayPayload = {
      ...payload,
      result: 'FAILED' as const,
      failureCode: 'SHOULD_NOT_APPLY',
    };
    const replayRaw = JSON.stringify({ ...replayPayload, eventId });
    const replaySignature = identityWebhookSignature(
      Buffer.from(replayRaw),
      WEBHOOK_SECRET,
    );
    await request(server)
      .post('/api/v1/verification/webhooks/mock')
      .set('Content-Type', 'application/json')
      .set('X-Identity-Signature', replaySignature)
      .send(replayRaw)
      .expect(200);

    const stored = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: verificationId },
    });
    expect(stored.status).toBe('SUCCEEDED');
    expect(stored.failureCode).toBeNull();
    expect(stored.maskedIdentity).not.toMatch(/\d{12}/);
    expect(JSON.stringify(stored.metadata ?? {})).not.toMatch(/\d{12}/);

    const memberships = await prisma.hamMembership.count({
      where: { userId: session.userId },
    });
    expect(memberships).toBe(0);

    const me = await request(server)
      .get('/api/v1/verification/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(JSON.stringify(me.body)).not.toMatch(/metadata/i);
    expect(
      (me.body as { data: { maskedIdentity: string } }).data.maskedIdentity,
    ).toBe(MOCK_MASKED_IDENTITY);
  });

  it('does not store a 12-digit identity from a webhook payload', async () => {
    const session = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;
    const started = await request(server)
      .post('/api/v1/verification/start')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({})
      .expect(201);
    const verificationId = (started.body as StartBody).data.verificationId;
    const payload = {
      eventId: `p7-aadhaar-${verificationId}`,
      verificationId,
      result: 'SUCCEEDED' as const,
      maskedIdentity: '1234-5678-9012',
    };
    const raw = JSON.stringify(payload);
    await request(server)
      .post('/api/v1/verification/webhooks/mock')
      .set('Content-Type', 'application/json')
      .set(
        'X-Identity-Signature',
        identityWebhookSignature(Buffer.from(raw), WEBHOOK_SECRET),
      )
      .send(raw)
      .expect(200);

    const stored = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: verificationId },
    });
    expect(stored.status).toBe('SUCCEEDED');
    expect(stored.maskedIdentity).toBeNull();
    expect(JSON.stringify(stored.metadata ?? {})).not.toMatch(/\d{12}/);
    expect(JSON.stringify(stored.maskedIdentity)).not.toMatch(/\d{12}/);
  });

  it('forbids employers from starting employee verification', async () => {
    const employer = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );
    await request(app.getHttpServer() as Server)
      .post('/api/v1/verification/start')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({})
      .expect(403);
  });
});

async function registerAndVerify(
  app: INestApplication,
  sms: MockSmsProvider,
  phone: string,
  role: 'EMPLOYEE' | 'EMPLOYER',
): Promise<{ accessToken: string; userId: string }> {
  const server = app.getHttpServer() as Server;
  await request(server).post('/api/v1/auth/register').send({
    phone,
    role,
    preferredLanguage: 'ta',
    password: PASSWORD,
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
    userId: body.data.user.id,
  };
}
