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

const PHONE_PREFIX = '+91777';
const PASSWORD = 'CorrectHorse1';

type TokenPairBody = {
  data: {
    accessToken: string;
    user: { id: string; role: string; phone: string };
  };
};

type JobBody = {
  data: {
    id: string;
    status: string;
    title: string;
    organization: { id: string; name: string };
  };
};

type ApplicationBody = {
  data: {
    id: string;
    status: string;
    jobId: string;
    employee?: { phone?: string; dateOfBirth?: string };
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

describe('Jobs and applications (e2e)', () => {
  let app!: INestApplication;
  let prisma!: PrismaService;
  let sms!: MockSmsProvider;
  let districtId!: string;
  let skillId!: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    sms = app.get(MockSmsProvider);
    const district = await prisma.district.findFirst({
      where: { code: 'CHENNAI' },
    });
    const skill = await prisma.skill.findFirst({ where: { code: 'mason' } });
    expect(district).not.toBeNull();
    expect(skill).not.toBeNull();
    districtId = district!.id;
    skillId = skill!.id;
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

      const jobs =
        organizationIds.length > 0
          ? await prisma.job.findMany({
              where: { organizationId: { in: organizationIds } },
              select: { id: true },
            })
          : [];
      const jobIds = jobs.map((job) => job.id);

      const applicationOr: Array<{
        jobId?: { in: string[] };
        employeeProfile?: { userId: { in: string[] } };
      }> = [];
      if (jobIds.length > 0) {
        applicationOr.push({ jobId: { in: jobIds } });
      }
      if (userIds.length > 0) {
        applicationOr.push({ employeeProfile: { userId: { in: userIds } } });
      }
      if (applicationOr.length > 0) {
        await prisma.jobApplication.deleteMany({
          where: { OR: applicationOr },
        });
      }
      if (jobIds.length > 0) {
        await prisma.job.deleteMany({
          where: { id: { in: jobIds } },
        });
      }
      if (userIds.length > 0) {
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

  it('requires organization and active membership to create or publish a job', async () => {
    const employer = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );
    const server = app.getHttpServer() as Server;

    const noOrg = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send(jobPayload(districtId, skillId, 'Mason draft'))
      .expect(409);
    expect((noOrg.body as ErrorEnvelope).error.code).toBe('CONFLICT');

    await request(server)
      .put('/api/v1/employer/organization')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ name: `P6-org-${employer.userId}` })
      .expect(200);

    const inactive = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send(jobPayload(districtId, skillId, 'Mason draft'))
      .expect(403);
    expect((inactive.body as ErrorEnvelope).error.code).toBe(
      'MEMBERSHIP_REQUIRED',
    );

    await activateEmployerMembership(prisma, employer.userId);

    await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, 'Forbidden org'),
        organizationId: '0199aaaa-bbbb-7000-8000-000000000099',
      })
      .expect(400);

    const created = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send(jobPayload(districtId, skillId, 'Mason draft'))
      .expect(201);
    const job = created.body as JobBody;
    expect(job.data.status).toBe('DRAFT');

    await prisma.organization.update({
      where: { id: job.data.organization.id },
      data: { membershipStatus: 'INACTIVE', membershipActivatedAt: null },
    });
    const blockedPublish = await request(server)
      .post(`/api/v1/employer/jobs/${job.data.id}/publish`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(403);
    expect((blockedPublish.body as ErrorEnvelope).error.code).toBe(
      'MEMBERSHIP_REQUIRED',
    );
    await activateEmployerMembership(prisma, employer.userId);

    const published = await request(server)
      .post(`/api/v1/employer/jobs/${job.data.id}/publish`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(200);
    expect((published.body as JobBody).data.status).toBe('PUBLISHED');
  });

  it('enforces job ownership across employers', async () => {
    const employerA = await employerWithOrg(app, sms, 'A');
    const employerB = await employerWithOrg(app, sms, 'B');
    const server = app.getHttpServer() as Server;

    const created = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .send(jobPayload(districtId, skillId, 'Owned by A'))
      .expect(201);
    const jobId = (created.body as JobBody).data.id;

    const hidden = await request(server)
      .get(`/api/v1/employer/jobs/${jobId}`)
      .set('Authorization', `Bearer ${employerB.accessToken}`)
      .expect(404);
    expect((hidden.body as ErrorEnvelope).error.code).toBe('NOT_FOUND');

    await request(server)
      .post(`/api/v1/employer/jobs/${jobId}/publish`)
      .set('Authorization', `Bearer ${employerB.accessToken}`)
      .expect(404);

    await request(server)
      .patch(`/api/v1/employer/jobs/${jobId}`)
      .set('Authorization', `Bearer ${employerB.accessToken}`)
      .send({ title: 'Hijack' })
      .expect(404);

    const own = await request(server)
      .get(`/api/v1/employer/jobs/${jobId}`)
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .expect(200);
    expect((own.body as JobBody).data.title).toBe('Owned by A');
  });

  it('hides unpublished jobs from the public feed and rejects invalid feed queries', async () => {
    const employer = await employerWithOrg(app, sms, 'feed');
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const draft = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send(jobPayload(districtId, skillId, 'Hidden draft'))
      .expect(201);
    const draftId = (draft.body as JobBody).data.id;

    const published = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, 'Visible published'),
        status: 'PUBLISHED',
      })
      .expect(201);
    const publishedId = (published.body as JobBody).data.id;

    const feed = await request(server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .query({ districtId, skillId, limit: 50 })
      .expect(200);
    const feedBody = feed.body as {
      data: Array<{ id: string; status: string }>;
      meta: { nextCursor: string | null; limit: number };
    };
    expect(feedBody.meta.limit).toBe(50);
    expect(feedBody.data.some((job) => job.id === publishedId)).toBe(true);
    expect(feedBody.data.some((job) => job.id === draftId)).toBe(false);
    expect(feedBody.data.every((job) => job.status === 'PUBLISHED')).toBe(true);
    expect(feedBody.data.every((job) => !('description' in job))).toBe(true);

    await request(server)
      .get(`/api/v1/jobs/${draftId}`)
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(404);

    await request(server)
      .get(`/api/v1/jobs/${draftId}`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(404);

    const publishedDetail = await request(server)
      .get(`/api/v1/jobs/${publishedId}`)
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(200);
    expect(
      (publishedDetail.body as { data: { description: string } }).data
        .description,
    ).toEqual(expect.any(String));

    await request(server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .query({ sort: 'title' })
      .expect(400);

    await request(server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .query({ limit: 51 })
      .expect(400);
  });

  it('paginates the public feed with an opaque publishedAt cursor', async () => {
    const employer = await employerWithOrg(app, sms, 'cursor');
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;
    const titlePrefix = `Cursor-${employer.userId}`;

    await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, `${titlePrefix}-1`),
        status: 'PUBLISHED',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, `${titlePrefix}-2`),
        status: 'PUBLISHED',
      })
      .expect(201);

    const page1 = await request(server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .query({ limit: 1 })
      .expect(200);
    const first = page1.body as {
      data: Array<{ id: string }>;
      meta: { nextCursor: string | null; limit: number };
    };
    expect(first.data).toHaveLength(1);
    expect(first.meta.nextCursor).toEqual(expect.any(String));

    const page2 = await request(server)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .query({ limit: 1, cursor: first.meta.nextCursor })
      .expect(200);
    const second = page2.body as { data: Array<{ id: string }> };
    expect(second.data).toHaveLength(1);
    expect(second.data[0].id).not.toBe(first.data[0].id);
  });

  it('applies once to published jobs and blocks draft, closed, missing, and duplicates', async () => {
    const employer = await employerWithOrg(app, sms, 'apply');
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const draft = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send(jobPayload(districtId, skillId, 'Apply draft'))
      .expect(201);
    const published = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, 'Apply published'),
        status: 'PUBLISHED',
      })
      .expect(201);
    const closable = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, 'Apply closed'),
        status: 'PUBLISHED',
      })
      .expect(201);
    await request(server)
      .post(`/api/v1/employer/jobs/${(closable.body as JobBody).data.id}/close`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(200);

    const draftId = (draft.body as JobBody).data.id;
    const publishedId = (published.body as JobBody).data.id;
    const closedId = (closable.body as JobBody).data.id;

    await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ jobId: '0199aaaa-bbbb-7000-8000-000000000001' })
      .expect(404);

    const draftDenied = await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ jobId: draftId })
      .expect(409);
    expect((draftDenied.body as ErrorEnvelope).error.code).toBe('CONFLICT');

    await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ jobId: closedId })
      .expect(409);

    const applied = await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ jobId: publishedId, coverNote: 'Ready to work' })
      .expect(201);
    const application = applied.body as ApplicationBody;
    expect(application.data.status).toBe('SUBMITTED');
    expect(application.data.jobId).toBe(publishedId);

    const duplicate = await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ jobId: publishedId })
      .expect(409);
    expect((duplicate.body as ErrorEnvelope).error.code).toBe('CONFLICT');

    const withdrawn = await request(server)
      .post(`/api/v1/applications/${application.data.id}/withdraw`)
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(200);
    expect((withdrawn.body as ApplicationBody).data.status).toBe('WITHDRAWN');

    await request(server)
      .post(`/api/v1/applications/${application.data.id}/withdraw`)
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(409);
  });

  it('keeps employee applications private and blocks withdraw after hire', async () => {
    const employer = await employerWithOrg(app, sms, 'apps');
    const employeeA = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const employeeB = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const published = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, 'Privacy job'),
        status: 'PUBLISHED',
      })
      .expect(201);
    const jobId = (published.body as JobBody).data.id;

    const applied = await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${employeeA.accessToken}`)
      .send({ jobId })
      .expect(201);
    const applicationId = (applied.body as ApplicationBody).data.id;

    await request(server)
      .get(`/api/v1/applications/${applicationId}`)
      .set('Authorization', `Bearer ${employeeB.accessToken}`)
      .expect(404);

    await request(server)
      .post(`/api/v1/applications/${applicationId}/withdraw`)
      .set('Authorization', `Bearer ${employeeB.accessToken}`)
      .expect(404);

    const mine = await request(server)
      .get(`/api/v1/applications/${applicationId}`)
      .set('Authorization', `Bearer ${employeeA.accessToken}`)
      .expect(200);
    expect((mine.body as ApplicationBody).data.id).toBe(applicationId);

    await request(server)
      .patch(`/api/v1/employer/jobs/${jobId}/applications/${applicationId}`)
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .send({ status: 'HIRED' })
      .expect(200);

    const hiredWithdraw = await request(server)
      .post(`/api/v1/applications/${applicationId}/withdraw`)
      .set('Authorization', `Bearer ${employeeA.accessToken}`)
      .expect(409);
    expect((hiredWithdraw.body as ErrorEnvelope).error.code).toBe('CONFLICT');
  });

  it('lists allowlisted applicants for owned jobs only and writes status history', async () => {
    const employerA = await employerWithOrg(app, sms, 'appl-a');
    const employerB = await employerWithOrg(app, sms, 'appl-b');
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    await request(server)
      .patch('/api/v1/employee/profile')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ fullName: 'Applicant One', districtId })
      .expect(200);

    const created = await request(server)
      .post('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .send({
        ...jobPayload(districtId, skillId, 'Applicants job'),
        status: 'PUBLISHED',
      })
      .expect(201);
    const jobId = (created.body as JobBody).data.id;

    const applied = await request(server)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ jobId })
      .expect(201);
    const applicationId = (applied.body as ApplicationBody).data.id;

    await request(server)
      .get(`/api/v1/employer/jobs/${jobId}/applications`)
      .set('Authorization', `Bearer ${employerB.accessToken}`)
      .expect(404);

    const listed = await request(server)
      .get(`/api/v1/employer/jobs/${jobId}/applications`)
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .expect(200);
    const listBody = listed.body as {
      data: Array<{
        id: string;
        status: string;
        employee: Record<string, unknown>;
      }>;
    };
    expect(listBody.data[0].id).toBe(applicationId);
    expect(listBody.data[0].employee.fullName).toBe('Applicant One');
    expect(JSON.stringify(listBody.data[0].employee)).not.toMatch(
      /phone|dateOfBirth|date_of_birth|aadhaar/i,
    );

    await request(server)
      .patch(`/api/v1/employer/jobs/${jobId}/applications/${applicationId}`)
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .send({ status: 'WITHDRAWN' })
      .expect(400);

    await request(server)
      .patch(`/api/v1/employer/jobs/${jobId}/applications/${applicationId}`)
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .send({ status: 'VIEWED' })
      .expect(200);

    const history = await prisma.applicationStatusHistory.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((row) => row.toStatus)).toEqual(['SUBMITTED', 'VIEWED']);
  });

  it('returns allowlisted worker cards and excludes suspended accounts', async () => {
    const employer = await employerWithOrg(app, sms, 'workers');
    const visible = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const suspended = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    await request(server)
      .patch('/api/v1/employee/profile')
      .set('Authorization', `Bearer ${visible.accessToken}`)
      .send({ fullName: 'Visible Worker', districtId })
      .expect(200);
    await request(server)
      .put('/api/v1/employee/skills')
      .set('Authorization', `Bearer ${visible.accessToken}`)
      .send({ skills: [{ skillId, yearsExperience: 4 }] })
      .expect(200);
    await prisma.verificationRequest.create({
      data: {
        userId: visible.userId,
        provider: 'mock',
        status: 'SUCCEEDED',
      },
    });

    await request(server)
      .patch('/api/v1/employee/profile')
      .set('Authorization', `Bearer ${suspended.accessToken}`)
      .send({ fullName: 'Suspended Worker', districtId })
      .expect(200);
    await prisma.user.update({
      where: { id: suspended.userId },
      data: { accountStatus: 'SUSPENDED' },
    });

    const search = await request(server)
      .get('/api/v1/employer/workers')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .query({ districtId, skillId })
      .expect(200);
    const body = search.body as {
      data: Array<{
        id: string;
        fullName: string;
        identityVerified: boolean;
        phone?: string;
      }>;
    };
    const names = body.data.map((row) => row.fullName);
    expect(names).toContain('Visible Worker');
    expect(names).not.toContain('Suspended Worker');
    const card = body.data.find((row) => row.fullName === 'Visible Worker');
    expect(card?.identityVerified).toBe(true);
    expect(JSON.stringify(body.data)).not.toMatch(
      /phone|dateOfBirth|date_of_birth|aadhaar/i,
    );
  });

  it('forbids employees from employer job routes', async () => {
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    await request(app.getHttpServer() as Server)
      .get('/api/v1/employer/jobs')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(403);
  });
});

function jobPayload(districtId: string, skillId: string, title: string) {
  return {
    title,
    description: `${title} description`,
    jobType: 'DAILY_WAGE',
    districtId,
    vacancies: 2,
    skillIds: [skillId],
  };
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
    .send({ name: `P6-${label}-${session.userId}` })
    .expect(200);
  await activateEmployerMembership(app.get(PrismaService), session.userId);
  return session;
}

async function activateEmployerMembership(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  const profile = await prisma.employerProfile.findUnique({
    where: { userId },
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
