import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { SecurityModule } from './modules/security/security.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { EmployersModule } from './modules/employers/employers.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { SkillsModule } from './modules/skills/skills.module';
import { GeoModule } from './modules/geo/geo.module';
import { FilesModule } from './modules/files/files.module';
import { AdminModule } from './modules/admin/admin.module';
import { VerificationModule } from './modules/verification/verification.module';
import { MembershipModule } from './modules/membership/membership.module';
import { LegalSupportModule } from './modules/legal-support/legal-support.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AccountStatusGuard } from './common/guards/account-status.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { buildPinoRedactPaths } from './common/utils/redact';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const extra = configService
          .get<string>('logging.redact', '')
          .split(',')
          .map((key) => key.trim())
          .filter((key) => key.length > 0);
        const nodeEnv = configService.get<string>('nodeEnv', 'development');

        return {
          pinoHttp: {
            level: configService.get<string>('logging.level', 'info'),
            autoLogging: nodeEnv !== 'test',
            genReqId: (req: IncomingMessage) => {
              const header = req.headers['x-request-id'];
              if (typeof header === 'string' && header.trim().length > 0) {
                return header;
              }
              return randomUUID();
            },
            customProps: (req: IncomingMessage) => ({
              requestId: req.headers['x-request-id'] ?? randomUUID(),
            }),
            redact: {
              paths: buildPinoRedactPaths(extra),
              censor: '[Redacted]',
            },
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('throttle.ttlMs', 60_000),
            limit: configService.get<number>('throttle.limit', 100),
          },
          {
            name: 'auth',
            ttl: configService.get<number>('throttle.authTtlMs', 60_000),
            limit: configService.get<number>('throttle.authLimit', 10),
          },
        ],
      }),
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    SecurityModule,
    AuthModule,
    FilesModule,
    UsersModule,
    EmployeesModule,
    EmployersModule,
    JobsModule,
    ApplicationsModule,
    SkillsModule,
    GeoModule,
    AdminModule,
    VerificationModule,
    MembershipModule,
    LegalSupportModule,
    PaymentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccountStatusGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
