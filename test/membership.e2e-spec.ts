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
import { DEFAULT_MEMBERSHIP_TERMS_VERSION } from './../src/modules/membership/membership.util';

const PHONE_PREFIX = '+91555';
const PASSWORD = 'CorrectHorse1';
const TERMS = DEFAULT_MEMBERSHIP_TERMS_VERSION;
const WEBHOOK_SECRET =
  process.env.IDENTITY_WEBHOOK_SECRET ??
  'test-identity-webhook-secret-min-32chars';

type TokenPairBody = {
  data: {
    accessToken: string;
    user: { id: string; role: string };
  };
};

type MembershipBody = {
  data: {
    status: string | null;
    canJoin: boolean;
    termsVersion: string;
    identityVerified: boolean;
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

describe('HAM membership (e2e)', () => {
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
        await prisma.consentRecord.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.hamMembership.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.verificationRequest.deleteMany({
          where: { userId: { in: userIds } },
        });
      }
      await prisma.webhookEvent.deleteMany({
        where: { providerEventId: { startsWith: 'p8-' } },
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

  it('keeps canJoin false until identity is verified', async () => {
    const session = await registerEmployee(app, sms);
    const server = app.getHttpServer() as Server;

    const before = await request(server)
      .get('/api/v1/membership')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect((before.body as MembershipBody).data).toEqual({
      status: null,
      canJoin: false,
      termsVersion: TERMS,
      identityVerified: false,
    });

    const info = await request(server)
      .get('/api/v1/membership/info')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const infoBody = info.body as {
      data: {
        termsVersion: string;
        copyKeys: string[];
        placeholderNotice: string;
        withdrawEnabled: boolean;
      };
    };
    expect(infoBody.data.termsVersion).toBe(TERMS);
    expect(infoBody.data.withdrawEnabled).toBe(false);
    expect(infoBody.data.copyKeys.length).toBeGreaterThan(0);
    expect(infoBody.data.placeholderNotice).toMatch(/not available yet/i);
    expect(JSON.stringify(info.body)).not.toMatch(/party|election|vote/i);

    const unverifiedJoin = await request(server)
      .post('/api/v1/membership/join')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ termsVersion: TERMS, accepted: true })
      .expect(409);
    expect((unverifiedJoin.body as ErrorEnvelope).error.code).toBe('CONFLICT');
  });

  it('joins with explicit consent and rejects a second join', async () => {
    const session = await registerEmployee(app, sms);
    const server = app.getHttpServer() as Server;
    await completeVerification(server, session.accessToken);

    const ready = await request(server)
      .get('/api/v1/membership')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect((ready.body as MembershipBody).data.canJoin).toBe(true);
    expect((ready.body as MembershipBody).data.identityVerified).toBe(true);

    await request(server)
      .post('/api/v1/membership/join')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ termsVersion: TERMS, accepted: false })
      .expect(400);

    await request(server)
      .post('/api/v1/membership/join')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ termsVersion: 'wrong-version', accepted: true })
      .expect(400);

    const joined = await request(server)
      .post('/api/v1/membership/join')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('User-Agent', 'P8-join-agent')
      .send({ termsVersion: TERMS, accepted: true })
      .expect(200);
    expect((joined.body as MembershipBody).data.status).toBe('JOINED');
    expect((joined.body as MembershipBody).data.canJoin).toBe(false);

    const again = await request(server)
      .post('/api/v1/membership/join')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ termsVersion: TERMS, accepted: true })
      .expect(409);
    expect((again.body as ErrorEnvelope).error.code).toBe('CONFLICT');

    const current = await request(server)
      .get('/api/v1/membership')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect((current.body as MembershipBody).data.status).toBe('JOINED');

    const me = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(
      (
        me.body as {
          data: { onboarding: { hamMembershipStatus: string | null } };
        }
      ).data.onboarding.hamMembershipStatus,
    ).toBe('JOINED');

    const consent = await prisma.consentRecord.findMany({
      where: { userId: session.userId },
    });
    expect(consent).toHaveLength(1);
    expect(consent[0].action).toBe('JOINED');
    expect(consent[0].termsVersion).toBe(TERMS);
    expect(consent[0].occurredAt).toBeInstanceOf(Date);
    expect(consent[0].userAgent).toBe('P8-join-agent');
    expect(consent[0].membershipId).toEqual(expect.any(String));
  });

  it('records decline consent after verification', async () => {
    const session = await registerEmployee(app, sms);
    const server = app.getHttpServer() as Server;
    await completeVerification(server, session.accessToken);

    const declined = await request(server)
      .post('/api/v1/membership/decline')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('User-Agent', 'P8-decline-agent')
      .send({ termsVersion: TERMS })
      .expect(200);
    expect((declined.body as MembershipBody).data.status).toBe('DECLINED');
    expect((declined.body as MembershipBody).data.canJoin).toBe(true);

    const consent = await prisma.consentRecord.findFirst({
      where: { userId: session.userId, action: 'DECLINED' },
    });
    expect(consent).not.toBeNull();
    expect(consent?.termsVersion).toBe(TERMS);
    expect(consent?.userAgent).toBe('P8-decline-agent');
    expect(consent?.occurredAt).toBeInstanceOf(Date);
  });

  it('does not create membership from a verification webhook', async () => {
    const session = await registerEmployee(app, sms);
    const server = app.getHttpServer() as Server;
    const started = await request(server)
      .post('/api/v1/verification/start')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({})
      .expect(201);
    const verificationId = (
      started.body as { data: { verificationId: string } }
    ).data.verificationId;
    const payload = {
      eventId: `p8-${verificationId}`,
      verificationId,
      result: 'SUCCEEDED' as const,
      maskedIdentity: MOCK_MASKED_IDENTITY,
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

    expect(
      await prisma.hamMembership.count({ where: { userId: session.userId } }),
    ).toBe(0);
    expect(
      await prisma.consentRecord.count({ where: { userId: session.userId } }),
    ).toBe(0);

    const membership = await request(server)
      .get('/api/v1/membership')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect((membership.body as MembershipBody).data.status).toBeNull();
    expect((membership.body as MembershipBody).data.canJoin).toBe(true);
    expect((membership.body as MembershipBody).data.identityVerified).toBe(
      true,
    );
  });

  it('returns NOT_ENABLED for withdraw while M9 is unanswered', async () => {
    const session = await registerEmployee(app, sms);
    const denied = await request(app.getHttpServer() as Server)
      .post('/api/v1/membership/withdraw')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ termsVersion: TERMS })
      .expect(409);
    expect((denied.body as ErrorEnvelope).error.code).toBe('NOT_ENABLED');
  });

  it('forbids employers from membership routes', async () => {
    const employer = await registerAndVerifyPhone(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );
    await request(app.getHttpServer() as Server)
      .get('/api/v1/membership')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(403);
  });
});

async function completeVerification(
  server: Server,
  accessToken: string,
): Promise<void> {
  const started = await request(server)
    .post('/api/v1/verification/start')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({})
    .expect(201);
  const verificationId = (started.body as { data: { verificationId: string } })
    .data.verificationId;
  await request(server)
    .post('/api/v1/verification/mock/complete')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ verificationId, result: 'SUCCEEDED' })
    .expect(200);
}

async function registerEmployee(
  app: INestApplication,
  sms: MockSmsProvider,
): Promise<{ accessToken: string; userId: string }> {
  return registerAndVerifyPhone(app, sms, uniquePhone(), 'EMPLOYEE');
}

async function registerAndVerifyPhone(
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
