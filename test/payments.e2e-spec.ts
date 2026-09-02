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
import { RAZORPAY_PAYMENT_PROVIDER } from './../src/integrations/payment/razorpay.tokens';
import {
  razorpayCheckoutSignature,
  razorpayWebhookSignature,
} from './../src/integrations/payment/razorpay-signature';
import { ErrorEnvelope } from './../src/common/constants/error-codes';
import { FakeRazorpayPaymentProvider } from './helpers/fake-razorpay.provider';
import { DEFAULT_MEMBERSHIP_TERMS_VERSION } from './../src/modules/membership/membership.util';
import {
  EMPLOYEE_MEMBERSHIP_PLAN_CODE,
  EMPLOYER_MEMBERSHIP_PLAN_CODE,
} from './../src/modules/payments/payments.util';

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
  })
    .overrideProvider(RAZORPAY_PAYMENT_PROVIDER)
    .useValue(new FakeRazorpayPaymentProvider())
    .compile();
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
        await prisma.webhookEvent.deleteMany({
          where: { providerEventId: { startsWith: 'evt_test_' } },
        });
        await prisma.payment.deleteMany({
          where: { userId: { in: userIds } },
        });
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
      where: { id: stored.organizationId as string },
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

  it('initiates employee membership at the plan price and activates once', async () => {
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;
    const plan = await prisma.membershipPlan.findFirstOrThrow({
      where: { code: EMPLOYEE_MEMBERSHIP_PLAN_CODE, isActive: true },
    });
    expect(plan.amountPaise).toBe(9900);

    await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        purpose: 'MEMBERSHIP',
        planId: plan.id,
        termsVersion: DEFAULT_MEMBERSHIP_TERMS_VERSION,
        accepted: true,
        amountPaise: 1,
      })
      .expect(409);

    await completeVerification(server, employee.accessToken);

    const initiated = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        purpose: 'MEMBERSHIP',
        planId: plan.id,
        termsVersion: DEFAULT_MEMBERSHIP_TERMS_VERSION,
        accepted: true,
        amountPaise: 1,
      })
      .expect(201);
    const body = initiated.body as InitiateBody;
    expect(body.data.status).toBe('PENDING');
    expect(body.data.providerPayload).toMatchObject({
      amountPaise: 9900,
      currency: 'INR',
      checkoutMode: 'razorpay',
    });
    expect(body.data.providerPayload.orderId).toEqual(expect.any(String));
    expect(body.data.providerPayload.keyId).toEqual(expect.any(String));

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: body.data.paymentId },
    });
    expect(stored.amountPaise).toBe(9900);
    expect(stored.organizationId).toBeNull();
    expect(stored.purpose).toBe('MEMBERSHIP');

    const reused = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        purpose: 'MEMBERSHIP',
        planId: plan.id,
        termsVersion: DEFAULT_MEMBERSHIP_TERMS_VERSION,
        accepted: true,
      })
      .expect(201);
    expect((reused.body as InitiateBody).data.paymentId).toBe(body.data.paymentId);

    const orderId = String(body.data.providerPayload.orderId);
    const paymentId = 'pay_test_confirm';
    const signature = razorpayCheckoutSignature(
      orderId,
      paymentId,
      process.env.RAZORPAY_KEY_SECRET ?? '',
    );

    await request(server)
      .post('/api/v1/payments/confirm')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: 'deadbeef',
      })
      .expect(401);

    const confirmed = await request(server)
      .post('/api/v1/payments/confirm')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(200);
    expect(
      (confirmed.body as { data: { status: string; membershipStatus: string } })
        .data,
    ).toMatchObject({
      status: 'SUCCEEDED',
      membershipStatus: 'JOINED',
    });

    const replay = await request(server)
      .post('/api/v1/payments/confirm')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(200);
    expect(
      (replay.body as { data: { membershipStatus: string } }).data
        .membershipStatus,
    ).toBe('JOINED');

    expect(
      await prisma.hamMembership.count({
        where: { userId: employee.userId, status: 'JOINED' },
      }),
    ).toBe(1);
    expect(
      await prisma.consentRecord.count({
        where: { userId: employee.userId, action: 'JOINED' },
      }),
    ).toBe(1);

    const captured = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: paymentId, order_id: orderId },
        },
      },
    };
    const capturedRaw = JSON.stringify(captured);
    await request(server)
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set(
        'X-Razorpay-Signature',
        razorpayWebhookSignature(
          Buffer.from(capturedRaw),
          process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
        ),
      )
      .set('X-Razorpay-Event-Id', 'evt_test_captured')
      .send(capturedRaw)
      .expect(200);

    const paid = {
      event: 'order.paid',
      payload: {
        payment: { entity: { id: paymentId, order_id: orderId } },
        order: { entity: { id: orderId } },
      },
    };
    const paidRaw = JSON.stringify(paid);
    await request(server)
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set(
        'X-Razorpay-Signature',
        razorpayWebhookSignature(
          Buffer.from(paidRaw),
          process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
        ),
      )
      .set('X-Razorpay-Event-Id', 'evt_test_order_paid')
      .send(paidRaw)
      .expect(200);

    expect(
      await prisma.hamMembership.count({
        where: { userId: employee.userId, status: 'JOINED' },
      }),
    ).toBe(1);
    expect(
      await prisma.consentRecord.count({
        where: { userId: employee.userId, action: 'JOINED' },
      }),
    ).toBe(1);

    const membership = await request(server)
      .get('/api/v1/membership')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(200);
    expect(
      (
        membership.body as {
          data: { status: string; membershipPaid: boolean; canPay: boolean };
        }
      ).data,
    ).toMatchObject({
      status: 'JOINED',
      membershipPaid: true,
      canPay: false,
      canJoin: false,
    });
  });

  it('does not activate membership on a failed Razorpay webhook', async () => {
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;
    const plan = await prisma.membershipPlan.findFirstOrThrow({
      where: { code: EMPLOYEE_MEMBERSHIP_PLAN_CODE, isActive: true },
    });
    await completeVerification(server, employee.accessToken);
    const initiated = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        purpose: 'MEMBERSHIP',
        planId: plan.id,
        termsVersion: DEFAULT_MEMBERSHIP_TERMS_VERSION,
        accepted: true,
      })
      .expect(201);
    const orderId = String(
      (initiated.body as InitiateBody).data.providerPayload.orderId,
    );
    const failed = {
      event: 'payment.failed',
      payload: {
        payment: { entity: { id: 'pay_fail', order_id: orderId } },
      },
    };
    const raw = JSON.stringify(failed);
    await request(server)
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set(
        'X-Razorpay-Signature',
        razorpayWebhookSignature(
          Buffer.from(raw),
          process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
        ),
      )
      .set('X-Razorpay-Event-Id', 'evt_test_failed')
      .send(raw)
      .expect(200);

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: (initiated.body as InitiateBody).data.paymentId },
    });
    expect(stored.status).toBe('FAILED');
    expect(
      await prisma.hamMembership.count({ where: { userId: employee.userId } }),
    ).toBe(0);

    await request(server)
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'deadbeef')
      .set('X-Razorpay-Event-Id', 'evt_test_bad')
      .send(raw)
      .expect(401);
  });

  it('initiates employer membership at the plan price without verifying the organization', async () => {
    const employer = await employerWithCompleteOrg(app, prisma, sms, 'mem');
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const incomplete = await employerWithOrg(app, sms, 'incomplete');
    const server = app.getHttpServer() as Server;
    const plan = await prisma.membershipPlan.findFirstOrThrow({
      where: { code: EMPLOYER_MEMBERSHIP_PLAN_CODE, isActive: true },
    });
    expect(plan.amountPaise).toBe(9900);

    const beforePay = await request(server)
      .get('/api/v1/employer/membership')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(200);
    expect(
      (
        beforePay.body as {
          data: {
            status: string;
            canPay: boolean;
            profileComplete: boolean;
            verificationState: string;
            plan: { amountPaise: number; code: string };
          };
        }
      ).data,
    ).toMatchObject({
      status: 'INACTIVE',
      canPay: true,
      profileComplete: true,
      verificationState: 'UNVERIFIED',
      plan: { amountPaise: 9900, code: EMPLOYER_MEMBERSHIP_PLAN_CODE },
    });

    await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ purpose: 'EMPLOYER_MEMBERSHIP', planId: plan.id })
      .expect(403);

    await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        purpose: 'MEMBERSHIP',
        planId: plan.id,
        termsVersion: DEFAULT_MEMBERSHIP_TERMS_VERSION,
        accepted: true,
      })
      .expect(403);

    const incompletePay = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${incomplete.accessToken}`)
      .send({ purpose: 'EMPLOYER_MEMBERSHIP', planId: plan.id })
      .expect(409);
    expect((incompletePay.body as ErrorEnvelope).error.code).toBe('CONFLICT');

    const initiated = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        purpose: 'EMPLOYER_MEMBERSHIP',
        planId: plan.id,
        amountPaise: 1,
      })
      .expect(201);
    const body = initiated.body as InitiateBody;
    expect(body.data.status).toBe('PENDING');
    expect(body.data.providerPayload).toMatchObject({
      amountPaise: 9900,
      currency: 'INR',
      checkoutMode: 'razorpay',
    });

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: body.data.paymentId },
    });
    expect(stored.amountPaise).toBe(9900);
    expect(stored.purpose).toBe('EMPLOYER_MEMBERSHIP');
    expect(stored.organizationId).toEqual(expect.any(String));
    expect(stored.membershipId).toBeNull();

    const reused = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ purpose: 'EMPLOYER_MEMBERSHIP', planId: plan.id })
      .expect(201);
    expect((reused.body as InitiateBody).data.paymentId).toBe(body.data.paymentId);

    const orderId = String(body.data.providerPayload.orderId);
    const paymentId = 'pay_employer_confirm';
    const signature = razorpayCheckoutSignature(
      orderId,
      paymentId,
      process.env.RAZORPAY_KEY_SECRET ?? '',
    );

    await request(server)
      .post('/api/v1/payments/confirm')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(404);

    const confirmed = await request(server)
      .post('/api/v1/payments/confirm')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(200);
    expect(
      (confirmed.body as { data: { status: string; membershipStatus: string } })
        .data,
    ).toMatchObject({
      status: 'SUCCEEDED',
      membershipStatus: 'ACTIVE',
    });

    const replay = await request(server)
      .post('/api/v1/payments/confirm')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(200);
    expect(
      (replay.body as { data: { membershipStatus: string } }).data
        .membershipStatus,
    ).toBe('ACTIVE');

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: stored.organizationId as string },
    });
    expect(org.membershipStatus).toBe('ACTIVE');
    expect(org.verificationState).toBe('UNVERIFIED');
    expect(org.activationStatus).toBe('NOT_REQUIRED');
    expect(
      await prisma.hamMembership.count({ where: { userId: employer.userId } }),
    ).toBe(0);

    const captured = {
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: paymentId, order_id: orderId } },
      },
    };
    const capturedRaw = JSON.stringify(captured);
    await request(server)
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set(
        'X-Razorpay-Signature',
        razorpayWebhookSignature(
          Buffer.from(capturedRaw),
          process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
        ),
      )
      .set('X-Razorpay-Event-Id', 'evt_test_employer_captured')
      .send(capturedRaw)
      .expect(200);

    const paid = {
      event: 'order.paid',
      payload: {
        payment: { entity: { id: paymentId, order_id: orderId } },
        order: { entity: { id: orderId } },
      },
    };
    const paidRaw = JSON.stringify(paid);
    await request(server)
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set(
        'X-Razorpay-Signature',
        razorpayWebhookSignature(
          Buffer.from(paidRaw),
          process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
        ),
      )
      .set('X-Razorpay-Event-Id', 'evt_test_employer_order_paid')
      .send(paidRaw)
      .expect(200);

    const afterWebhook = await prisma.organization.findUniqueOrThrow({
      where: { id: stored.organizationId as string },
    });
    expect(afterWebhook.membershipStatus).toBe('ACTIVE');
    expect(afterWebhook.verificationState).toBe('UNVERIFIED');
    expect(afterWebhook.activationStatus).toBe('NOT_REQUIRED');

    const duplicate = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ purpose: 'EMPLOYER_MEMBERSHIP', planId: plan.id })
      .expect(409);
    expect((duplicate.body as ErrorEnvelope).error.code).toBe('CONFLICT');

    const membership = await request(server)
      .get('/api/v1/employer/membership')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(200);
    expect(
      (
        membership.body as {
          data: {
            status: string;
            canPay: boolean;
            verificationState: string;
            paymentStatus: string;
          };
        }
      ).data,
    ).toMatchObject({
      status: 'ACTIVE',
      canPay: false,
      verificationState: 'UNVERIFIED',
      paymentStatus: 'SUCCEEDED',
    });

    await request(server)
      .get('/api/v1/employer/membership')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(403);
  });

  it('does not activate employer membership on a failed Razorpay webhook', async () => {
    const employer = await employerWithCompleteOrg(app, prisma, sms, 'fail');
    const server = app.getHttpServer() as Server;
    const plan = await prisma.membershipPlan.findFirstOrThrow({
      where: { code: EMPLOYER_MEMBERSHIP_PLAN_CODE, isActive: true },
    });
    const initiated = await request(server)
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ purpose: 'EMPLOYER_MEMBERSHIP', planId: plan.id })
      .expect(201);
    const paymentId = (initiated.body as InitiateBody).data.paymentId;
    const orderId = String(
      (initiated.body as InitiateBody).data.providerPayload.orderId,
    );
    const failed = {
      event: 'payment.failed',
      payload: {
        payment: { entity: { id: 'pay_emp_fail', order_id: orderId } },
      },
    };
    const raw = JSON.stringify(failed);
    await request(server)
      .post('/api/v1/payments/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set(
        'X-Razorpay-Signature',
        razorpayWebhookSignature(
          Buffer.from(raw),
          process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
        ),
      )
      .set('X-Razorpay-Event-Id', 'evt_test_employer_failed')
      .send(raw)
      .expect(200);

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(stored.status).toBe('FAILED');
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: stored.organizationId as string },
    });
    expect(org.membershipStatus).toBe('INACTIVE');
    expect(org.verificationState).toBe('UNVERIFIED');
    expect(org.activationStatus).toBe('NOT_REQUIRED');
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

async function employerWithCompleteOrg(
  app: INestApplication,
  prisma: PrismaService,
  sms: MockSmsProvider,
  label: string,
): Promise<{ accessToken: string; userId: string }> {
  const session = await registerAndVerify(app, sms, uniquePhone(), 'EMPLOYER');
  const district = await prisma.district.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  expect(district).not.toBeNull();
  await request(app.getHttpServer() as Server)
    .put('/api/v1/employer/organization')
    .set('Authorization', `Bearer ${session.accessToken}`)
    .send({
      name: `P10-${label}-${session.userId}`,
      districtId: district!.id,
      contactPhone: uniquePhone(),
    })
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
