import { Inject, Injectable } from '@nestjs/common';
import { OtpPurpose } from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import {
  SMS_PROVIDER,
  type SmsProvider,
} from '../../integrations/messaging/sms-provider';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  RESET_TOKEN_TTL_SECONDS,
} from './auth.constants';
import { throwInvalidCode } from './auth.errors';
import { hashOpaque, TokenService } from './token.service';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async request(
    phone: string,
    purpose: OtpPurpose,
    userId?: string,
  ): Promise<number> {
    await this.invalidateActive(phone, purpose);
    const code = this.tokenService.generateOtpCode();
    await this.prisma.otpChallenge.create({
      data: {
        phone,
        userId,
        purpose,
        codeHash: hashOpaque(code),
        maxAttempts: OTP_MAX_ATTEMPTS,
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      },
    });
    await this.sms.sendOtp(phone, code, purpose);
    return OTP_TTL_SECONDS;
  }

  async verify(
    phone: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !challenge ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.attempts >= challenge.maxAttempts
    ) {
      throwInvalidCode();
    }

    const updated = await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });

    if (updated.codeHash !== hashOpaque(code)) {
      if (updated.attempts >= updated.maxAttempts) {
        await this.prisma.otpChallenge.update({
          where: { id: updated.id },
          data: { consumedAt: new Date() },
        });
      }
      throwInvalidCode();
    }

    await this.prisma.otpChallenge.update({
      where: { id: updated.id },
      data: { consumedAt: new Date() },
    });
  }

  async issueResetToken(phone: string, userId: string): Promise<string> {
    await this.invalidateActive(phone, 'PASSWORD_RESET');
    const { raw, hash } = this.tokenService.generateResetToken();
    await this.prisma.otpChallenge.create({
      data: {
        phone,
        userId,
        purpose: 'PASSWORD_RESET',
        codeHash: hash,
        maxAttempts: 1,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return raw;
  }

  async consumeResetToken(phone: string, resetToken: string): Promise<string> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phone,
        purpose: 'PASSWORD_RESET',
        consumedAt: null,
        codeHash: hashOpaque(resetToken),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      !challenge ||
      !challenge.userId ||
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      throwInvalidCode();
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date(), attempts: { increment: 1 } },
    });

    return challenge.userId;
  }

  private async invalidateActive(
    phone: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    await this.prisma.otpChallenge.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}
