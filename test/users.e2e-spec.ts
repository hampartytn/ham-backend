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

const PHONE_PREFIX = '+91888';
const PASSWORD = 'CorrectHorse1';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type TokenPairBody = {
  data: {
    accessToken: string;
    user: { id: string; role: string; phone: string };
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

describe('Authorization and users (e2e)', () => {
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

      await prisma.employeeProfile.updateMany({
        where: { userId: { in: userIds } },
        data: { profileImageFileId: null },
      });
      await prisma.fileObject.deleteMany({
        where: { ownerUserId: { in: userIds } },
      });
      await prisma.adminUserPermission.deleteMany({
        where: { userId: { in: userIds } },
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
      if (organizationIds.length > 0) {
        await prisma.organization.deleteMany({
          where: { id: { in: organizationIds } },
        });
      }
    }
    await app?.close();
  });

  it('keeps health public', async () => {
    await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200);
  });

  it('returns GET /me and rejects role changes on PATCH /me', async () => {
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

    const meBody = me.body as {
      data: {
        id: string;
        role: string;
        onboarding: {
          phoneVerified: boolean;
          profileComplete: boolean;
          identityVerified: boolean;
          hamMembershipStatus: string | null;
        };
      };
    };
    expect(meBody.data.id).toBe(session.userId);
    expect(meBody.data.role).toBe('EMPLOYEE');
    expect(meBody.data.onboarding).toEqual({
      phoneVerified: true,
      profileComplete: false,
      identityVerified: false,
      hamMembershipStatus: null,
    });
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash/i);

    await request(app.getHttpServer() as Server)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(400);

    const patched = await request(app.getHttpServer() as Server)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ preferredLanguage: 'en' })
      .expect(200);
    expect(
      (patched.body as { data: { preferredLanguage: string } }).data
        .preferredLanguage,
    ).toBe('en');
  });

  it('updates employee profile and skills for the caller only', async () => {
    const session = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const district = await prisma.district.findFirst({
      where: { code: 'CHENNAI' },
    });
    const skill = await prisma.skill.findFirst({ where: { code: 'mason' } });
    expect(district).not.toBeNull();
    expect(skill).not.toBeNull();

    await request(app.getHttpServer() as Server)
      .patch('/api/v1/employee/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ role: 'ADMIN', fullName: 'Worker' })
      .expect(400);

    await request(app.getHttpServer() as Server)
      .patch('/api/v1/employee/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ districtId: '00000000-0000-7000-8000-000000000000' })
      .expect(400);

    const patched = await request(app.getHttpServer() as Server)
      .patch('/api/v1/employee/profile')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ fullName: 'Worker One', districtId: district?.id })
      .expect(200);
    expect((patched.body as { data: { fullName: string } }).data.fullName).toBe(
      'Worker One',
    );

    await request(app.getHttpServer() as Server)
      .put('/api/v1/employee/skills')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ skills: [{ skillId: '00000000-0000-7000-8000-000000000000' }] })
      .expect(400);

    await request(app.getHttpServer() as Server)
      .put('/api/v1/employee/skills')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ skills: [{ skillId: skill?.id, yearsExperience: 3 }] })
      .expect(200);

    const me = await request(app.getHttpServer() as Server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(
      (me.body as { data: { onboarding: { profileComplete: boolean } } }).data
        .onboarding.profileComplete,
    ).toBe(true);

    const uploaded = await request(app.getHttpServer() as Server)
      .post('/api/v1/employee/profile/image')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .attach('file', PNG, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201);
    const image = uploaded.body as { data: { fileId: string; url: string } };
    expect(image.data.url).toContain(image.data.fileId);

    await request(app.getHttpServer() as Server)
      .get(image.data.url)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
  });

  it('localizes catalog and geo names from preferredLanguage', async () => {
    const session = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    await request(app.getHttpServer() as Server)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ preferredLanguage: 'ta' })
      .expect(200);

    const skills = await request(app.getHttpServer() as Server)
      .get('/api/v1/skills')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const mason = (
      skills.body as { data: Array<{ code: string; name: string }> }
    ).data.find((item) => item.code === 'mason');
    expect(mason?.name).toBe('கொத்தனார்');

    const districts = await request(app.getHttpServer() as Server)
      .get('/api/v1/geo/districts')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const chennai = (
      districts.body as {
        data: Array<{ code: string; name: string; id: string }>;
      }
    ).data.find((item) => item.code === 'CHENNAI');
    expect(chennai?.name).toBe('சென்னை');

    const cities = await request(app.getHttpServer() as Server)
      .get(`/api/v1/geo/districts/${chennai?.id}/cities`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(
      (cities.body as { data: Array<{ code: string }> }).data.some(
        (item) => item.code === 'CHENNAI',
      ),
    ).toBe(true);
  });

  it('prevents employers from using employee routes and vice versa', async () => {
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const employer = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );

    await request(app.getHttpServer() as Server)
      .get('/api/v1/employee/profile')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(403);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/employer/profile')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(403);
  });

  it('keeps employer organizations isolated', async () => {
    const employerA = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );
    const employerB = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );

    const orgA = await request(app.getHttpServer() as Server)
      .put('/api/v1/employer/organization')
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .send({ name: `P5-A-${employerA.userId}` })
      .expect(200);
    const orgB = await request(app.getHttpServer() as Server)
      .put('/api/v1/employer/organization')
      .set('Authorization', `Bearer ${employerB.accessToken}`)
      .send({ name: `P5-B-${employerB.userId}` })
      .expect(200);

    const idA = (orgA.body as { data: { id: string } }).data.id;
    const idB = (orgB.body as { data: { id: string } }).data.id;
    expect(idA).not.toBe(idB);

    await request(app.getHttpServer() as Server)
      .put('/api/v1/employer/organization')
      .set('Authorization', `Bearer ${employerA.accessToken}`)
      .send({ name: `P5-A-updated-${employerA.userId}`, organizationId: idB })
      .expect(400);

    const stillB = await request(app.getHttpServer() as Server)
      .get('/api/v1/employer/profile')
      .set('Authorization', `Bearer ${employerB.accessToken}`)
      .expect(200);
    expect(
      (stillB.body as { data: { organization: { id: string; name: string } } })
        .data.organization.id,
    ).toBe(idB);
    expect(
      (stillB.body as { data: { organization: { name: string } } }).data
        .organization.name,
    ).toContain('P5-B-');
  });

  it('forbids employees and employers from admin routes', async () => {
    const employee = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const employer = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYER',
    );

    const employeeDenied = await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/session')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .expect(403);
    expect((employeeDenied.body as ErrorEnvelope).error.code).toBe('FORBIDDEN');

    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/session')
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(403);
  });

  it('enforces admin permissions and implicit SUPER_ADMIN access', async () => {
    const adminPhone = uniquePhone();
    const superPhone = uniquePhone();
    await prisma.user.create({
      data: {
        role: 'ADMIN',
        phone: adminPhone,
        passwordHash: await hashPassword(PASSWORD),
        accountStatus: 'ACTIVE',
        preferredLanguage: 'en',
        phoneVerifiedAt: new Date(),
      },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { phone: adminPhone },
    });
    const superUser = await prisma.user.create({
      data: {
        role: 'SUPER_ADMIN',
        phone: superPhone,
        passwordHash: await hashPassword(PASSWORD),
        accountStatus: 'ACTIVE',
        preferredLanguage: 'en',
        phoneVerifiedAt: new Date(),
      },
    });

    const adminLogin = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone: adminPhone, password: PASSWORD })
      .expect(200);
    const superLogin = await request(app.getHttpServer() as Server)
      .post('/api/v1/auth/login')
      .send({ phone: superPhone, password: PASSWORD })
      .expect(200);
    const adminToken = (adminLogin.body as TokenPairBody).data.accessToken;
    const superToken = (superLogin.body as TokenPairBody).data.accessToken;

    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/session')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/permissions/check')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await prisma.adminUserPermission.create({
      data: {
        userId: adminUser.id,
        permission: Permission.USERS_READ,
        createdByUserId: superUser.id,
      },
    });

    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/permissions/check')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer() as Server)
      .get('/api/v1/admin/permissions/check')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
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
