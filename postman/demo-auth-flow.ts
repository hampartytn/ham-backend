/**
 * Live auth-flow demo (same HTTP contract as Postman).
 * Run: npx tsx postman/demo-auth-flow.ts
 */
import { NestFactory } from '@nestjs/core';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { MockSmsProvider } from '../src/integrations/messaging/mock-sms.provider';

async function main() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.LOG_LEVEL = 'silent';

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: false,
  });
  setupApp(app);
  await app.init();
  const server = app.getHttpServer() as Server;
  const sms = app.get(MockSmsProvider);

  const phone = `+91987${String(Date.now()).slice(-7)}`;
  const password = 'CorrectHorse1';

  console.log('\n=== Phone under test:', phone, '===\n');

  // 1) First register
  const r1 = await request(server).post('/api/v1/auth/register').send({
    phone,
    role: 'EMPLOYEE',
    preferredLanguage: 'ta',
    password,
  });
  console.log('1) POST /auth/register (first)');
  console.log('   status:', r1.status);
  console.log('   body:', JSON.stringify(r1.body));

  // 2) Second register — expect CONFLICT
  const r2 = await request(server).post('/api/v1/auth/register').send({
    phone,
    role: 'EMPLOYEE',
    preferredLanguage: 'ta',
    password,
  });
  console.log('\n2) POST /auth/register (same phone again)');
  console.log('   status:', r2.status);
  console.log('   body:', JSON.stringify(r2.body));

  // 3) Login before OTP — must fail (still PENDING_PHONE)
  const loginEarly = await request(server).post('/api/v1/auth/login').send({
    phone,
    password,
  });
  console.log('\n3) POST /auth/login BEFORE phone OTP verify');
  console.log('   status:', loginEarly.status);
  console.log('   body:', JSON.stringify(loginEarly.body));

  // 4) OTP request REGISTER
  const otpReq = await request(server).post('/api/v1/auth/otp/request').send({
    phone,
    purpose: 'REGISTER',
  });
  console.log('\n4) POST /auth/otp/request purpose=REGISTER');
  console.log('   status:', otpReq.status);
  console.log('   body:', JSON.stringify(otpReq.body));
  console.log(
    '   meaning of expiresIn: 300 → OTP is valid for 300 seconds (5 minutes).',
  );
  console.log(
    '   This response shape is always the same; it does NOT mean login succeeded.',
  );

  const code = sms.peek(phone, 'REGISTER');
  console.log('\n   (dev) mock OTP code:', code);

  // 5) OTP verify REGISTER
  const otpVerify = await request(server).post('/api/v1/auth/otp/verify').send({
    phone,
    purpose: 'REGISTER',
    code,
  });
  console.log('\n5) POST /auth/otp/verify purpose=REGISTER');
  console.log('   status:', otpVerify.status);
  console.log(
    '   accountStatus:',
    (otpVerify.body as { data?: { user?: { accountStatus?: string } } }).data
      ?.user?.accountStatus,
  );
  console.log(
    '   got accessToken:',
    Boolean(
      (otpVerify.body as { data?: { accessToken?: string } }).data?.accessToken,
    ),
  );

  // 6) Password login after ACTIVE
  const loginOk = await request(server).post('/api/v1/auth/login').send({
    phone,
    password,
  });
  console.log('\n6) POST /auth/login AFTER verify');
  console.log('   status:', loginOk.status);
  console.log(
    '   accountStatus:',
    (loginOk.body as { data?: { user?: { accountStatus?: string } } }).data
      ?.user?.accountStatus,
  );
  console.log(
    '   got accessToken:',
    Boolean(
      (loginOk.body as { data?: { accessToken?: string } }).data?.accessToken,
    ),
  );

  console.log('\n=== Flow OK ===\n');
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
