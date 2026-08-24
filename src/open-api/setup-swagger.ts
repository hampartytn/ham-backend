import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  assertSwaggerAccess,
  shouldDocumentMockComplete,
} from './swagger.policy';

export function setupSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const enabled = configService.get<boolean>('swagger.enabled', false);
  if (!enabled) {
    return;
  }

  const user = configService.get<string>('swagger.user');
  const password = configService.get<string>('swagger.password');
  assertSwaggerAccess(nodeEnv, enabled, user, password);

  const path = configService.get<string>('swagger.path', 'docs');
  if (swaggerRequiresGate(nodeEnv, user, password)) {
    const gate = basicAuth(user!, password!);
    app.use(`/${path}`, gate);
    app.use(`/${path}-json`, gate);
  }

  const builder = new DocumentBuilder()
    .setTitle('ham-backend')
    .setDescription(SWAGGER_DESCRIPTION)
    .setVersion('1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addTag('admin', 'ADMIN / SUPER_ADMIN + permission');

  const document = SwaggerModule.createDocument(app, builder.build(), {
    operationIdFactory: (_controller: string, method: string) => method,
  });

  if (!shouldDocumentMockComplete(nodeEnv)) {
    for (const pathKey of Object.keys(document.paths)) {
      if (pathKey.includes('/verification/mock/complete')) {
        delete document.paths[pathKey];
      }
    }
  }

  SwaggerModule.setup(path, app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'ham-backend API',
  });
}

function swaggerRequiresGate(
  nodeEnv: string,
  user: string | undefined,
  password: string | undefined,
): boolean {
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    return true;
  }
  return Boolean(user && password);
}

function basicAuth(user: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Basic ')) {
      challenge(res);
      return;
    }
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const providedUser = separator >= 0 ? decoded.slice(0, separator) : '';
    const providedPassword = separator >= 0 ? decoded.slice(separator + 1) : '';
    if (
      safeEqual(providedUser, user) &&
      safeEqual(providedPassword, password)
    ) {
      next();
      return;
    }
    challenge(res);
  };
}

function challenge(res: Response): void {
  res.setHeader('WWW-Authenticate', 'Basic realm="ham-backend docs"');
  res.status(401).send('Unauthorized');
}

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

const SWAGGER_DESCRIPTION = [
  'HAM Job & Worker Welfare Platform API. Base path `/api/v1`. Health checks are version-neutral at `/health` and `/ready`.',
  '',
  'Auth: `Authorization: Bearer <accessToken>` unless the operation is public.',
  'Roles: EMPLOYEE, EMPLOYER, ADMIN, SUPER_ADMIN. Admin routes also require a permission; SUPER_ADMIN has all permissions.',
  '',
  'Error envelope: `{ "error": { "code", "message", "details?", "requestId" } }`.',
  'Codes: VALIDATION_ERROR, UNAUTHORIZED, INVALID_CREDENTIALS, INVALID_OR_EXPIRED_CODE, FORBIDDEN, ACCOUNT_SUSPENDED, ACCOUNT_BLOCKED, NOT_FOUND, CONFLICT, NOT_ENABLED, RATE_LIMITED, PROVIDER_UNAVAILABLE, INTERNAL_ERROR.',
  '',
  'Never send password hashes, full identity numbers, or card data. Mock identity complete is omitted from the production OpenAPI document.',
].join('\n');
