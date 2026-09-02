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
import { Permission } from './../src/common/constants/permissions';
import { hashPassword } from './../src/modules/auth/password.util';

const PHONE_PREFIX = '+91222';
const PASSWORD = 'CorrectHorse1';

type TokenPairBody = {
  data: {
    accessToken: string;
    user: { id: string; role: string };
  };
};

function uniquePhone(): string {
  return `${PHONE_PREFIX}${randomInt(1_000_000, 9_999_999)}`;
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

describe('Admin APIs (e2e)', () => {
  let app!: INestApplication;
  let prisma!: PrismaService;
  let sms!: MockSmsProvider;
  let districtId!: string;
  let skillId!: string;
  let advocateId!: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    sms = app.get(MockSmsProvider);
    const district = await prisma.district.findFirst({
      where: { code: 'CHENNAI' },
    });
    const skill = await prisma.skill.findFirst({ where: { code: 'mason' } });
    const advocate = await prisma.supportProviderCategory.findFirst({
      where: { code: 'advocate' },
    });
    expect(district && skill && advocate).toBeTruthy();
    districtId = district!.id;
    skillId = skill!.id;
    advocateId = advocate!.id;
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
        await prisma.auditLog.deleteMany({
          where: { actorUserId: { in: userIds } },
        });
        await prisma.adminUserPermission.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.verificationRequest.deleteMany({
          where: { userId: { in: userIds } },
        });
      }
      await prisma.supportProvider.deleteMany({
        where: { name: { startsWith: 'P11-' } },
      });
      if (organizationIds.length > 0) {
        const jobs = await prisma.job.findMany({
          where: { organizationId: { in: organizationIds } },
          select: { id: true },
        });
        const jobIds = jobs.map((job) => job.id);
        if (jobIds.length > 0) {
          await prisma.jobApplication.deleteMany({
            where: { jobId: { in: jobIds } },
          });
          await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
        }
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

  it('lists users with phone, hides hashes, and forbids employers', async () => {
    const reader = await staff(app, prisma, 'ADMIN', [Permission.USERS_READ]);
    const employer = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );
    const server = app.getHttpServer() as Server;

    await request(server)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(403);

    const listed = await request(server)
      .get('/api/v1/admin/users')
      .query({ q: reader.phone, limit: 20 })
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    const rows = (listed.body as { data: Array<Record<string, unknown>> }).data;
    expect(rows.some((row) => row.phone === reader.phone)).toBe(true);
    expect(JSON.stringify(listed.body)).not.toMatch(/passwordHash|tokenHash/i);

    const detail = await request(server)
      .get(`/api/v1/admin/users/${reader.userId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    const detailData = detail.body as {
      data: { phone: string; verification: unknown };
    };
    expect(detailData.data.phone).toBe(reader.phone);
    expect(JSON.stringify(detail.body)).not.toMatch(/passwordHash|tokenHash/i);
  });

  it('blocks and suspends accounts and protects SUPER_ADMIN', async () => {
    const blocker = await staff(app, prisma, 'ADMIN', [Permission.USERS_BLOCK]);
    const superAdmin = await staff(app, prisma, 'SUPER_ADMIN', []);
    const worker = await registerAndVerify(app, sms, uniquePhone(), 'EMPLOYEE');
    const server = app.getHttpServer() as Server;

    await request(server)
      .post(`/api/v1/admin/users/${superAdmin.userId}/status`)
      .set('Authorization', `Bearer ${blocker.token}`)
      .send({ accountStatus: 'BLOCKED', reason: 'nope' })
      .expect(403);

    await request(server)
      .post(`/api/v1/admin/users/${worker.userId}/status`)
      .set('Authorization', `Bearer ${blocker.token}`)
      .send({ accountStatus: 'BLOCKED', reason: 'abuse' })
      .expect(200);

    const blocked = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${worker.accessToken}`)
      .expect(403);
    expect((blocked.body as ErrorEnvelope).error.code).toBe('ACCOUNT_BLOCKED');

    const other = await registerAndVerify(app, sms, uniquePhone(), 'EMPLOYEE');
    await request(server)
      .post(`/api/v1/admin/users/${other.userId}/status`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ accountStatus: 'SUSPENDED' })
      .expect(200);
    const suspended = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(403);
    expect((suspended.body as ErrorEnvelope).error.code).toBe(
      'ACCOUNT_SUSPENDED',
    );
  });

  it('unpublishes jobs so they leave the public feed', async () => {
    const moderator = await staff(app, prisma, 'ADMIN', [
      Permission.JOBS_MODERATE,
    ]);
    const employer = await employerWithOrg(app, sms);
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const created = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        title: 'P11-moderation-job',
        description: 'Admin moderation fixture',
        jobType: 'DAILY_WAGE',
        districtId,
        vacancies: 1,
        skillIds: [skillId],
        status: 'PUBLISHED',
      })
      .expect(201);
    const jobId = (created.body as { data: { id: string } }).data.id;

    const before = await request(server)
      .get('/api/v1/jobs')
      .query({ districtId, limit: 50 })
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(200);
    expect(
      (before.body as { data: Array<{ id: string }> }).data.some(
        (job) => job.id === jobId,
      ),
    ).toBe(true);

    await request(server)
      .post(`/api/v1/admin/jobs/${jobId}/unpublish`)
      .set('Authorization', `Bearer ${moderator.token}`)
      .expect(200);

    const after = await request(server)
      .get('/api/v1/jobs')
      .query({ districtId, limit: 50 })
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(200);
    expect(
      (after.body as { data: Array<{ id: string }> }).data.some(
        (job) => job.id === jobId,
      ),
    ).toBe(false);
  });

  it('keeps unapproved legal providers out of the employee directory', async () => {
    const legalAdmin = await staff(app, prisma, 'ADMIN', [
      Permission.LEGAL_MANAGE,
    ]);
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const created = await request(server)
      .post('/api/v1/admin/legal-support/providers')
      .set('Authorization', `Bearer ${legalAdmin.token}`)
      .send({
        categoryId: advocateId,
        name: 'P11-Draft-Advocate',
        trustLevel: 'PUBLIC_LISTING',
        phone: '+912220000001',
        coverages: [{ districtId }],
      })
      .expect(201);
    const providerId = (created.body as { data: { id: string } }).data.id;
    expect(
      (created.body as { data: { approvalStatus: string } }).data
        .approvalStatus,
    ).toBe('DRAFT');

    const hidden = await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ districtId, limit: 50 })
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(200);
    expect(names(hidden.body)).not.toContain('P11-Draft-Advocate');

    await request(server)
      .post(`/api/v1/admin/legal-support/providers/${providerId}/approve`)
      .set('Authorization', `Bearer ${legalAdmin.token}`)
      .expect(200);

    const visible = await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ districtId, limit: 50 })
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(200);
    expect(names(visible.body)).toContain('P11-Draft-Advocate');
  });

  it('returns metrics counts without user PII arrays', async () => {
    const metricsAdmin = await staff(app, prisma, 'ADMIN', [
      Permission.METRICS_READ,
    ]);
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const metrics = await request(server)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${metricsAdmin.token}`)
      .expect(200);
    const data = (
      metrics.body as {
        data: {
          users: { byRole: Record<string, number> };
          jobs: { byStatus: Record<string, number> };
          applications: { last7Days: number; last30Days: number };
        };
      }
    ).data;
    expect(typeof data.users.byRole.EMPLOYEE).toBe('number');
    expect(typeof data.jobs.byStatus.PUBLISHED).toBe('number');
    expect(typeof data.applications.last7Days).toBe('number');
    expect(JSON.stringify(metrics.body)).not.toContain(employee.userId);
    expect(JSON.stringify(metrics.body)).not.toMatch(/\+91222\d{7}/);
  });

  it('reads redacted audit logs and forbids employees', async () => {
    const auditor = await staff(app, prisma, 'ADMIN', [
      Permission.AUDIT_READ,
      Permission.USERS_BLOCK,
    ]);
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const target = await registerAndVerify(app, sms, uniquePhone(), 'EMPLOYEE');
    const server = app.getHttpServer() as Server;

    await request(server)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(403);

    await request(server)
      .post(`/api/v1/admin/users/${target.userId}/status`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ accountStatus: 'SUSPENDED', reason: 'review' })
      .expect(200);

    const logs = await request(server)
      .get('/api/v1/admin/audit-logs')
      .query({ actorUserId: auditor.userId, action: 'user.status' })
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);
    const entries = (
      logs.body as { data: Array<{ action: string; metadata: unknown }> }
    ).data;
    expect(entries.some((row) => row.action === 'user.status')).toBe(true);
    expect(JSON.stringify(logs.body)).not.toMatch(
      /passwordHash|CorrectHorse1|aadhaar/i,
    );
  });

  it('lets SUPER_ADMIN create admins and denies ADMIN without admins.manage', async () => {
    const superAdmin = await staff(app, prisma, 'SUPER_ADMIN', []);
    const limited = await staff(app, prisma, 'ADMIN', [Permission.USERS_READ]);
    const server = app.getHttpServer() as Server;
    const newPhone = uniquePhone();

    await request(server)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${limited.token}`)
      .send({
        phone: newPhone,
        password: PASSWORD,
        permissions: [Permission.USERS_READ],
      })
      .expect(403);

    await request(server)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        phone: newPhone,
        password: PASSWORD,
        permissions: [Permission.ADMINS_MANAGE],
      })
      .expect(400);

    const created = await request(server)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({
        phone: newPhone,
        password: PASSWORD,
        permissions: [Permission.USERS_READ],
      })
      .expect(201);
    const createdId = (created.body as { data: { id: string } }).data.id;
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash/i);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone: newPhone, password: PASSWORD })
      .expect(200);
    const token = (login.body as TokenPairBody).data.accessToken;
    await request(server)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(server)
      .patch(`/api/v1/admin/admins/${createdId}/permissions`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ permissions: [Permission.METRICS_READ] })
      .expect(200);

    await request(server)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(server)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});

function names(body: unknown): string[] {
  return (body as { data: Array<{ name: string }> }).data.map(
    (row) => row.name,
  );
}

async function staff(
  app: INestApplication,
  prisma: PrismaService,
  role: 'ADMIN' | 'SUPER_ADMIN',
  permissions: Permission[],
): Promise<{ token: string; userId: string; phone: string }> {
  const phone = uniquePhone();
  const user = await prisma.user.create({
    data: {
      role,
      phone,
      passwordHash: await hashPassword(PASSWORD),
      accountStatus: 'ACTIVE',
      preferredLanguage: 'en',
      phoneVerifiedAt: new Date(),
    },
  });
  if (role === 'ADMIN' && permissions.length > 0) {
    await prisma.adminUserPermission.createMany({
      data: permissions.map((permission) => ({
        userId: user.id,
        permission,
      })),
    });
  }
  const login = await request(app.getHttpServer() as Server)
    .post('/api/v1/auth/login')
    .send({ phone, password: PASSWORD })
    .expect(200);
  return {
    token: (login.body as TokenPairBody).data.accessToken,
    userId: user.id,
    phone,
  };
}

async function employerWithOrg(
  app: INestApplication,
  sms: MockSmsProvider,
): Promise<{ accessToken: string; userId: string }> {
  const session = await registerAndVerify(app, sms, uniquePhone(), 'EMPLOYER');
  await request(app.getHttpServer() as Server)
    .put('/api/v1/employer/organization')
    .set('Authorization', `Bearer ${session.accessToken}`)
    .send({ name: `P11-org-${session.userId}` })
    .expect(200);
  const prisma = app.get(PrismaService);
  const profile = await prisma.employerProfile.findUnique({
    where: { userId: session.userId },
    select: { organizationId: true },
  });
  expect(profile?.organizationId).toBeTruthy();
  await prisma.organization.update({
    where: { id: profile!.organizationId! },
    data: {
      membershipStatus: 'ACTIVE',
      membershipActivatedAt: new Date(),
    },
  });
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
