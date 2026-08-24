import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';
import { setupApp } from './../src/app.setup';

async function createApp(pingResult = true): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      ping: jest.fn().mockResolvedValue(pingResult),
      auditLog: { create: jest.fn() },
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp(true);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns 200 without secrets', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|secret|postgresql:\/\//i,
    );
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves Swagger with bearer auth, admin tag, and no secret examples', async () => {
    const ui = await request(app.getHttpServer() as Server)
      .get('/docs')
      .expect(200);
    expect(ui.text).toMatch(/swagger/i);

    const spec = await request(app.getHttpServer() as Server)
      .get('/docs-json')
      .expect(200);
    const body = spec.body as {
      paths: Record<string, unknown>;
      tags?: Array<{ name: string }>;
      components?: { securitySchemes?: Record<string, unknown> };
    };
    const paths = Object.keys(body.paths);
    expect(paths.some((path) => path.includes('/auth/register'))).toBe(true);
    expect(
      paths.some((path) => path.includes('/verification/mock/complete')),
    ).toBe(true);
    expect(body.tags?.some((tag) => tag.name === 'admin')).toBe(true);
    expect(body.components?.securitySchemes?.bearer).toBeDefined();
    expect(paths.some((path) => path.includes('/security/sample'))).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(
      /passwordHash|DATABASE_URL|CorrectHorse/i,
    );
  });

  it('GET /ready pings the database', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/ready')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });
});

describe('Health down (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp(false);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /ready returns 503 when the database ping fails', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/ready')
      .expect(503);

    expect(response.body).toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });
});
