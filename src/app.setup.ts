import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from 'class-validator';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { HEALTH_PATHS } from './common/constants/app.constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { flattenValidationErrors } from './common/utils/validation-errors';
import { setupSwagger } from './open-api/setup-swagger';

const requestIdMiddleware = new RequestIdMiddleware();

export function setupApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const origins = configService.get<string[]>('corsOrigins', []);

  const swaggerEnabled = configService.get<boolean>('swagger.enabled', false);

  if (nodeEnv === 'production') {
    if (origins.length === 0 || origins.includes('*')) {
      throw new Error(
        'Production CORS_ORIGINS must be an explicit allowlist and must not include *',
      );
    }
  }

  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled ? false : undefined,
    }),
  );
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, origins.includes(origin));
    },
    credentials: false,
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    requestIdMiddleware.use(req, res, next);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: flattenValidationErrors(errors),
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const apiPrefix = configService.get<string>('apiPrefix', 'api');
  const apiVersion = configService.get<string>('apiVersion', '1');
  app.setGlobalPrefix(apiPrefix, { exclude: [...HEALTH_PATHS] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion,
  });

  setupSwagger(app);
}
