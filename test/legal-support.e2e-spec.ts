import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { setupApp } from './../src/app.setup';
import { MockSmsProvider } from './../src/integrations/messaging/mock-sms.provider';
import { LegalSupportService } from './../src/modules/legal-support/legal-support.service';

const PHONE_PREFIX = '+91444';
const PASSWORD = 'CorrectHorse1';

type TokenPairBody = {
  data: {
    accessToken: string;
    user: { id: string; role: string };
  };
};

type ProviderCard = {
  id: string;
  name: string;
  trustLevel: string;
  phone: string | null;
  category: { code: string; name: string };
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

describe('Legal support (e2e)', () => {
  let app!: INestApplication;
  let prisma!: PrismaService;
  let sms!: MockSmsProvider;
  let legalSupport!: LegalSupportService;
  let chennaiDistrictId!: string;
  let chennaiCityId!: string;
  let tNagarAreaId!: string;
  let coimbatoreDistrictId!: string;
  let advocateId!: string;
  let legalAidId!: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    sms = app.get(MockSmsProvider);
    legalSupport = app.get(LegalSupportService);
    await prisma.supportProvider.deleteMany({
      where: { name: { startsWith: 'P9-' } },
    });

    const chennai = await prisma.district.findFirst({
      where: { code: 'CHENNAI' },
    });
    const coimbatore = await prisma.district.findFirst({
      where: { code: 'COIMBATORE' },
    });
    const chennaiCity = await prisma.city.findFirst({
      where: { code: 'CHENNAI' },
    });
    const tNagar = await prisma.area.findFirst({
      where: { code: 'T_NAGAR' },
    });
    const advocate = await prisma.supportProviderCategory.findFirst({
      where: { code: 'advocate' },
    });
    const legalAid = await prisma.supportProviderCategory.findFirst({
      where: { code: 'legal_aid' },
    });
    expect(
      chennai && coimbatore && chennaiCity && tNagar && advocate && legalAid,
    ).toBeTruthy();
    chennaiDistrictId = chennai!.id;
    coimbatoreDistrictId = coimbatore!.id;
    chennaiCityId = chennaiCity!.id;
    tNagarAreaId = tNagar!.id;
    advocateId = advocate!.id;
    legalAidId = legalAid!.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.supportProvider.deleteMany({
        where: { name: { startsWith: 'P9-' } },
      });
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

  it('lists localized categories and hides unapproved providers from employees', async () => {
    const session = await registerAndVerify(
      app,
      sms,
      uniquePhone(),
      'EMPLOYEE',
    );
    const server = app.getHttpServer() as Server;

    const districtWide = await legalSupport.create({
      categoryId: advocateId,
      name: 'P9-DistrictWide',
      trustLevel: 'PLATFORM_VERIFIED',
      approvalStatus: 'APPROVED',
      phone: '+914400000001',
      coverages: [{ districtId: chennaiDistrictId }],
    });
    const cityWide = await legalSupport.create({
      categoryId: advocateId,
      name: 'P9-CityWide',
      trustLevel: 'PUBLIC_LISTING',
      approvalStatus: 'APPROVED',
      coverages: [{ districtId: chennaiDistrictId, cityId: chennaiCityId }],
    });
    const areaOnly = await legalSupport.create({
      categoryId: legalAidId,
      name: 'P9-AreaOnly',
      trustLevel: 'PUBLIC_LISTING',
      approvalStatus: 'APPROVED',
      coverages: [
        {
          districtId: chennaiDistrictId,
          cityId: chennaiCityId,
          areaId: tNagarAreaId,
        },
      ],
    });
    const draft = await legalSupport.create({
      categoryId: advocateId,
      name: 'P9-Draft',
      trustLevel: 'PUBLIC_LISTING',
      approvalStatus: 'DRAFT',
      phone: '+914400000099',
      coverages: [{ districtId: chennaiDistrictId }],
    });
    await legalSupport.create({
      categoryId: advocateId,
      name: 'P9-Coimbatore',
      trustLevel: 'PUBLIC_LISTING',
      approvalStatus: 'APPROVED',
      coverages: [{ districtId: coimbatoreDistrictId }],
    });

    await request(server)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ preferredLanguage: 'ta' })
      .expect(200);

    const categories = await request(server)
      .get('/api/v1/legal-support/categories')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const advocate = (
      categories.body as { data: Array<{ code: string; name: string }> }
    ).data.find((item) => item.code === 'advocate');
    expect(advocate?.name).toBe('வழக்கறிஞர்');

    await request(server)
      .get('/api/v1/legal-support/providers')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(400);

    const districtList = await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ districtId: chennaiDistrictId, limit: 50 })
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const districtBody = districtList.body as {
      data: ProviderCard[];
      meta: { page: number; limit: number; total: number };
    };
    const districtNames = names(districtList.body);
    expect(districtNames).toContain('P9-DistrictWide');
    expect(districtNames).not.toContain('P9-CityWide');
    expect(districtNames).not.toContain('P9-AreaOnly');
    expect(districtNames).not.toContain('P9-Draft');
    expect(districtNames).not.toContain('P9-Coimbatore');
    const verified = districtBody.data.find(
      (row) => row.name === 'P9-DistrictWide',
    );
    expect(verified?.trustLevel).toBe('PLATFORM_VERIFIED');
    expect(verified?.phone).toBe('+914400000001');
    expect(districtBody.meta.page).toBe(1);
    expect(districtBody.meta.limit).toBe(50);

    const cityList = await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ cityId: chennaiCityId, limit: 50 })
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const cityNames = names(cityList.body);
    expect(cityNames).toEqual(
      expect.arrayContaining(['P9-DistrictWide', 'P9-CityWide']),
    );
    expect(cityNames).not.toContain('P9-AreaOnly');

    const areaList = await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ areaId: tNagarAreaId, limit: 50 })
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const areaNames = names(areaList.body);
    expect(areaNames).toEqual(
      expect.arrayContaining(['P9-DistrictWide', 'P9-CityWide', 'P9-AreaOnly']),
    );

    const filtered = await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ areaId: tNagarAreaId, categoryId: legalAidId, limit: 50 })
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(names(filtered.body)).toContain('P9-AreaOnly');
    expect(names(filtered.body)).not.toContain('P9-DistrictWide');
    expect(names(filtered.body)).not.toContain('P9-CityWide');

    const paged = await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ districtId: chennaiDistrictId, page: 1, limit: 1 })
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const pagedBody = paged.body as {
      data: unknown[];
      meta: { page: number; limit: number; total: number };
    };
    expect(pagedBody.meta.page).toBe(1);
    expect(pagedBody.meta.limit).toBe(1);
    expect(pagedBody.meta.total).toBeGreaterThanOrEqual(1);
    expect(pagedBody.data).toHaveLength(1);

    await request(server)
      .get(`/api/v1/legal-support/providers/${draft.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(404);

    const detail = await request(server)
      .get(`/api/v1/legal-support/providers/${districtWide.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(
      (detail.body as { data: { trustLevel: string; coverages: unknown[] } })
        .data.trustLevel,
    ).toBe('PLATFORM_VERIFIED');

    await legalSupport.update(cityWide.id, { name: 'P9-CityWide-Updated' });
    await legalSupport.archive(areaOnly.id);
    await request(server)
      .get(`/api/v1/legal-support/providers/${areaOnly.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(404);
  });

  it('forbids employees from creating providers and employers from listing them', async () => {
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
    const server = app.getHttpServer() as Server;

    await request(server).get('/api/v1/legal-support/categories').expect(401);

    await request(server)
      .post('/api/v1/legal-support/providers')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .send({ name: 'P9-Hijack' })
      .expect(404);

    await request(server)
      .get('/api/v1/legal-support/providers')
      .query({ districtId: chennaiDistrictId })
      .set('Authorization', `Bearer ${employer.accessToken}`)
      .expect(403);
  });
});

function names(body: unknown): string[] {
  return (body as { data: Array<{ name: string }> }).data.map(
    (row) => row.name,
  );
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
