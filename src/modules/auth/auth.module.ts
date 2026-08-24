import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { MockSmsProvider } from '../../integrations/messaging/mock-sms.provider';
import { SMS_PROVIDER } from '../../integrations/messaging/sms-provider';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.accessSecret'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: configService.get<string>(
            'jwt.accessExpiresIn',
            '15m',
          ) as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OtpService,
    MockSmsProvider,
    { provide: SMS_PROVIDER, useExisting: MockSmsProvider },
  ],
  exports: [TokenService, MockSmsProvider],
})
export class AuthModule {}
