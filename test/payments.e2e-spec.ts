import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { setupApp } from './../src/app.setup';
import { MockSmsProvider } from './../src/integrations/messaging/mock-sms.provider';
import { paymentWebhookSignature } from './../src/integrations/payment/webhook-signature';
import { ErrorEnvelope } from './../src/common/constants/error-codes';

const PHONE_PREFIX = '+91333';
const PASSWORD = 'CorrectHorse1';
const WEBHOOK_SECRET =
  process.env.PAYMENT_WEBHOOK_SECRET ??
  'test-payment-webhook-secret-min-32chars!!';

type TokenPairBody = {
  data: {
    accessToken: string;
    user: { id: string; role: string };
  };
};

type InitiateBody = {
  data: {
    paymentId: string;
    status: string;
    providerPayload: Record<string, unknown>;
  };
};

type PaymentBody = {
  data: {
    paymentId: string;
    status: string;
    amountPaise: number;
    currency: string;
    purpose: string;
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

describe('Payments (e2e)', () => {
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
        select: {
          id: true,
          employerProfile: { select: { organizationId: true } },
        },
      });
      const userIds = users.map((user) => user.id);
      const organizationIds = users
        .map((user) => user.employerProfile?.organizationId)
        .filter((id): id is string => Boolean(id));

      if (userIds.length > 0) {
        const payments = await prisma.payment.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const paymentIds = payments.map((payment) => payment.id);
        if (paymentIds.length > 0) {
          await prisma.webhookEvent.deleteMany({
            where: { paymentId: { in: paymentIds } },
          });
        }
        await prisma.webhookEvent.deleteMany({
          where: { providerEventId: { startsWith: 'p10-' } },
        });
        await prisma.payment.deleteMany({
          where: { userId: { in: userIds } },
        });
      }
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
      if (organizationIds.length > 0) {
        await prisma.organization.deleteMany({
          where: { id: { in: organizationIds } },
        });
      }
    }
    await app?.close();
  });

  it('initiates a stub payment, ignores client success, and applies signed webhooks idempotently', async () => {
    const employer = await employerWithOrg(app, sms, 'payer');
    const other = await employerWithOrg(app, sms, 'other');
    const server = app.getHttpServer() as Server;

    const initiated = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ purpose: 'EMPLOYER_ACTIVATION', amountPaise: 99999 })
      .expect(201);
    const body = initiated.body as InitiateBody;
    expect(body.data.status).toBe('PENDING');
    expect(body.data.providerPayload).toMatchObject({
      provider: 'stub',
      checkoutMode: 'stub',
      amountPaise: 1,
      currency: 'INR',
    });
    expect(JSON.stringify(body.data.providerPayload)).not.toMatch(
      /card|pan|cvv/i,
    );

    const pending = await request(server)
      .get(`/api/v1/payments/${body.data.paymentId}`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(200);
    const pendingBody = pending.body as PaymentBody;
    expect(pendingBody.data.status).toBe('PENDING');
    expect(pendingBody.data.amountPaise).toBe(1);
    expect(pendingBody.data.currency).toBe('INR');

    await request(server)
      .get(`/api/v1/payments/${body.data.paymentId}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);

    await request(server)
      .post(`/api/v1/payments/${body.data.paymentId}/complete`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ status: 'SUCCEEDED' })
      .expect(404);

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: body.data.paymentId },
    });
    const payload = {
      eventId: `p10-${stored.id}`,
      providerOrderId: stored.providerOrderId,
      status: 'SUCCEEDED' as const,
    };
    const raw = JSON.stringify(payload);
    await request(server)
      .post('/api/v1/payments/webhooks/stub')
      .set('Content-Type', 'application/json')
      .set(
        'X-Payment-Signature',
        paymentWebhookSignature(Buffer.from(raw), WEBHOOK_SECRET),
      )
      .send(raw)
      .expect(200);

    const succeeded = await request(server)
      .get(`/api/v1/payments/${body.data.paymentId}`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(200);
    expect((succeeded.body as PaymentBody).data.status).toBe('SUCCEEDED');

    const replayPayload = {
      ...payload,
      status: 'FAILED' as const,
    };
    const replayRaw = JSON.stringify(replayPayload);
    await request(server)
      .post('/api/v1/payments/webhooks/stub')
      .set('Content-Type', 'application/json')
      .set(
        'X-Payment-Signature',
        paymentWebhookSignature(Buffer.from(replayRaw), WEBHOOK_SECRET),
      )
      .send(replayRaw)
      .expect(200);

    const afterReplay = await prisma.payment.findUniqueOrThrow({
      where: { id: body.data.paymentId },
    });
    expect(afterReplay.status).toBe('SUCCEEDED');

    const laterRaw = JSON.stringify({
      eventId: `p10-later-${stored.id}`,
      providerOrderId: stored.providerOrderId,
      status: 'FAILED',
    });
    await request(server)
      .post('/api/v1/payments/webhooks/stub')
      .set('Content-Type', 'application/json')
      .set(
        'X-Payment-Signature',
        paymentWebhookSignature(Buffer.from(laterRaw), WEBHOOK_SECRET),
      )
      .send(laterRaw)
      .expect(200);

    const afterLater = await prisma.payment.findUniqueOrThrow({
      where: { id: body.data.paymentId },
    });
    expect(afterLater.status).toBe('SUCCEEDED');

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: stored.organizationId },
    });
    expect(org.activationStatus).toBe('NOT_REQUIRED');
  });

  it('rejects bad webhook signatures and employer-only initiate rules', async () => {
    const employer = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const noOrg = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ purpose: 'EMPLOYER_ACTIVATION' })
      .expect(409);
    expect((noOrg.body as ErrorEnvelope).error.code).toBe('CONFLICT');

    await request(server)
      .put('/api/v1/employer/organization')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ name: `P10-org-${employer.userId}` })
      .expect(200);

    await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ purpose: 'EMPLOYER_ACTIVATION' })
      .expect(403);

    await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        purpose: 'EMPLOYER_ACTIVATION',
        cardNumber: '4111111111111111',
      })
      .expect(400);

    const bad = await request(server)
      .post('/api/v1/payments/webhooks/stub')
      .set('Content-Type', 'application/json')
      .set('X-Payment-Signature', 'sha256=deadbeef')
      .send(
        JSON.stringify({
          eventId: 'p10-bad',
          providerOrderId: 'missing',
          status: 'SUCCEEDED',
        }),
      )
      .expect(401);
    expect((bad.body as ErrorEnvelope).error.code).toBe('UNAUTHORIZED');
  });
});

async function employerWithOrg(
  app: INestApplication,
  sms: MockSmsProvider,
  label: string,
): Promise<{ accessToken: string; userId: string }> {
  const session = await registerAndVerify(app, sms, uniquePhone(), 'EMPLOYER');
  await request(app.getHttpServer() as Server)
    .put('/api/v1/employer/organization')
    .set('Authorization', `Bearer ${session.accessToken}`)
    .send({ name: `P10-${label}-${session.userId}` })
    .expect(200);
  return session;
}

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
