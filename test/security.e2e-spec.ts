import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { setupApp } from './../src/app.setup';
import { ErrorEnvelope } from './../src/common/constants/error-codes';

async function createApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      ping: jest.fn().mockResolvedValue(true),
      auditLog: { create: jest.fn() },
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

describe('Security foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects extra body fields with VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/security/sample')
      .send({ ping: 'ok', role: 'ADMIN' })
      .expect(400);

    const validationBody = response.body as ErrorEnvelope;
    expect(validationBody.error.code).toBe('VALIDATION_ERROR');
    expect(validationBody.error.requestId).toEqual(expect.any(String));
    expect(validationBody.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'role' })]),
    );
  });

  it('accepts a valid sample POST DTO', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/api/v1/security/sample')
      .send({ ping: 'ok' })
      .expect(201);

    expect(response.body).toEqual({ data: { ping: 'ok' } });
  });

  it('maps unknown routes to the NOT_FOUND envelope', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/does-not-exist')
      .expect(404);

    const notFoundBody = response.body as ErrorEnvelope;
    expect(notFoundBody.error.code).toBe('NOT_FOUND');
    expect(notFoundBody.error.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(notFoundBody)).not.toMatch(/stack/i);
  });

  it('allows a listed CORS origin and rejects an unknown origin', async () => {
    const allowed = await request(app.getHttpServer() as Server)
      .get('/health')
      .set('Origin', 'http://localhost:3001')
      .expect(200);

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3001',
    );

    const denied = await request(app.getHttpServer() as Server)
      .get('/health')
      .set('Origin', 'http://evil.example')
      .expect(200);

    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Rate limit (e2e)', () => {
  let app: INestApplication;
  const previousLimit = process.env.THROTTLE_LIMIT;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '2';
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    if (previousLimit === undefined) {
      delete process.env.THROTTLE_LIMIT;
    } else {
      process.env.THROTTLE_LIMIT = previousLimit;
    }
  });

  it('returns 429 RATE_LIMITED after exceeding the global limit', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).post('/api/v1/security/sample').send({ ping: '1' });
    await request(server).post('/api/v1/security/sample').send({ ping: '2' });
    const response = await request(server)
      .post('/api/v1/security/sample')
      .send({ ping: '3' })
      .expect(429);

    const limited = response.body as ErrorEnvelope;
    expect(limited.error.code).toBe('RATE_LIMITED');
    expect(limited.error.requestId).toEqual(expect.any(String));
  });
});
