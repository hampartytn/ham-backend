import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import {
  AccountStatus,
  OtpPurpose,
  PreferredLanguage,
  Role,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { DEFAULT_PREFERRED_LANGUAGE } from '../../common/constants/locales';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthEventType, OTP_TTL_SECONDS } from './auth.constants';
import {
  throwAccountBlocked,
  throwAccountSuspended,
  throwInvalidCode,
  throwInvalidCredentials,
  throwRegisterConflict,
  throwUnauthorized,
} from './auth.errors';
import {
  LoginDto,
  LogoutDto,
  OtpRequestDto,
  OtpVerifyDto,
  PasswordResetDto,
  PasswordSetDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';
import { OtpService } from './otp.service';
import { hashPassword, needsRehash, verifyPassword } from './password.util';
import { hashOpaque, TokenService } from './token.service';

export type RequestMeta = {
  ip?: string;
  userAgent?: string;
};

type UserRow = {
  id: string;
  role: Role;
  phone: string;
  preferredLanguage: PreferredLanguage;
  accountStatus: AccountStatus;
  passwordHash: string | null;
  deletedAt: Date | null;
};

type AuthUserView = {
  id: string;
  role: Role;
  phone: string;
  preferredLanguage: PreferredLanguage;
  accountStatus: AccountStatus;
};

type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: AuthUserView;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyPasswordHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await hashPassword(
      'timing-pad-not-a-real-password',
    );
  }

  async register(dto: RegisterDto): Promise<{
    data: { userId: string; phone: string; accountStatus: 'PENDING_PHONE' };
  }> {
    const passwordHash = dto.password
      ? await hashPassword(dto.password)
      : undefined;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            phone: dto.phone,
            role: dto.role,
            preferredLanguage: dto.preferredLanguage ?? DEFAULT_PREFERRED_LANGUAGE,
            email: dto.email,
            passwordHash,
            accountStatus: 'PENDING_PHONE',
          },
        });

        if (dto.role === 'EMPLOYEE') {
          await tx.employeeProfile.create({ data: { userId: created.id } });
        } else {
          await tx.employerProfile.create({ data: { userId: created.id } });
        }

        return created;
      });

      return {
        data: {
          userId: user.id,
          phone: user.phone,
          accountStatus: 'PENDING_PHONE',
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throwRegisterConflict();
      }
      throw error;
    }
  }

  async requestOtp(
    dto: OtpRequestDto,
    meta: RequestMeta,
  ): Promise<{ data: { expiresIn: number } }> {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (isEligibleForOtp(user, dto.purpose)) {
      await this.otpService.request(dto.phone, dto.purpose, user.id);
      await this.recordEvent({
        userId: user.id,
        phone: dto.phone,
        type: AuthEventType.OTP_REQUEST,
        meta,
      });
    }

    return { data: { expiresIn: OTP_TTL_SECONDS } };
  }

  async verifyOtp(
    dto: OtpVerifyDto,
    meta: RequestMeta,
  ): Promise<{ data: AuthTokenPair } | { data: { resetToken: string } }> {
    try {
      await this.otpService.verify(dto.phone, dto.purpose, dto.code);
    } catch (error) {
      await this.recordEvent({
        phone: dto.phone,
        type: AuthEventType.OTP_FAILURE,
        meta,
      });
      throw error;
    }

    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (dto.purpose === 'PASSWORD_RESET') {
      if (!user || user.deletedAt || user.accountStatus !== 'ACTIVE') {
        throwInvalidCode();
      }
      const resetToken = await this.otpService.issueResetToken(
        dto.phone,
        user.id,
      );
      return { data: { resetToken } };
    }

    if (!user || user.deletedAt) {
      throwInvalidCode();
    }

    if (dto.purpose === 'REGISTER') {
      if (user.accountStatus !== 'PENDING_PHONE') {
        throwInvalidCode();
      }
      const activated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          accountStatus: 'ACTIVE',
          phoneVerifiedAt: new Date(),
        },
      });
      return this.issueSession(activated, meta);
    }

    this.assertAccountAllowsSession(user);
    return this.issueSession(user, meta);
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<{ data: AuthTokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    const hashToVerify =
      user && !user.deletedAt && user.passwordHash
        ? user.passwordHash
        : this.dummyPasswordHash;
    const passwordOk = await verifyPassword(hashToVerify, dto.password);

    if (!user || user.deletedAt || !user.passwordHash || !passwordOk) {
      if (user && !user.deletedAt && user.passwordHash && !passwordOk) {
        await this.recordEvent({
          userId: user.id,
          phone: user.phone,
          type: AuthEventType.LOGIN_FAILURE,
          meta,
        });
      }
      throwInvalidCredentials();
    }

    if (needsRehash(user.passwordHash)) {
      const nextHash = await hashPassword(dto.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: nextHash },
      });
    }

    this.assertAccountAllowsSession(user);
    return this.issueSession(user, meta);
  }

  async refresh(
    dto: RefreshDto,
    meta: RequestMeta,
  ): Promise<{ data: AuthTokenPair }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaque(dto.refreshToken) },
    });

    if (!existing) {
      throwUnauthorized();
    }

    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      await this.recordEvent({
        userId: existing.userId,
        type: AuthEventType.REFRESH_REUSE,
        meta,
      });
      throwUnauthorized();
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throwUnauthorized();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: existing.userId },
    });
    if (!user || user.deletedAt) {
      throwUnauthorized();
    }
    this.assertAccountAllowsSession(user);

    const { raw, hash } = this.tokenService.generateRefreshToken();
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: hash,
          familyId: existing.familyId,
          expiresAt: this.tokenService.refreshExpiresAt(),
          createdByIp: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: created.id,
        },
      });
    });

    await this.recordEvent({
      userId: user.id,
      phone: user.phone,
      type: AuthEventType.REFRESH,
      meta,
    });

    return {
      data: {
        accessToken: this.tokenService.signAccess(user.id, user.role),
        refreshToken: raw,
        expiresIn: this.tokenService.accessExpiresInSeconds(),
        tokenType: 'Bearer',
        user: toPublicUser(user),
      },
    };
  }

  async logout(
    dto: LogoutDto,
    accessUserId: string | undefined,
    meta: RequestMeta,
  ): Promise<{ data: { success: true } }> {
    let userId = accessUserId;
    let familyId: string | undefined;

    if (dto.refreshToken) {
      const row = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashOpaque(dto.refreshToken) },
      });
      const valid =
        !!row && !row.revokedAt && row.expiresAt.getTime() > Date.now();
      if (valid && row) {
        userId = userId ?? row.userId;
        familyId = row.familyId;
      }
    }

    if (!userId) {
      throwUnauthorized();
    }

    if (dto.allDevices || !familyId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.revokeFamily(familyId);
    }

    await this.recordEvent({
      userId,
      type: AuthEventType.LOGOUT,
      meta,
    });

    return { data: { success: true } };
  }

  async setPassword(
    user: AuthenticatedUser,
    dto: PasswordSetDto,
  ): Promise<{ data: { success: true } }> {
    const stored = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!stored || stored.deletedAt) {
      throwUnauthorized();
    }

    if (stored.passwordHash) {
      if (!dto.currentPassword) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [
            {
              field: 'currentPassword',
              issue: 'currentPassword is required',
            },
          ],
        });
      }
      const ok = await verifyPassword(stored.passwordHash, dto.currentPassword);
      if (!ok) {
        throwInvalidCredentials();
      }
    }

    await this.prisma.user.update({
      where: { id: stored.id },
      data: { passwordHash: await hashPassword(dto.password) },
    });
    await this.recordEvent({
      userId: stored.id,
      phone: stored.phone,
      type: AuthEventType.PASSWORD_SET,
      meta: {},
    });
    return { data: { success: true } };
  }

  async resetPassword(
    dto: PasswordResetDto,
    meta: RequestMeta,
  ): Promise<{ data: { success: true } }> {
    const userId = await this.otpService.consumeResetToken(
      dto.phone,
      dto.resetToken,
    );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt || user.phone !== dto.phone) {
      throwInvalidCode();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(dto.newPassword) },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.recordEvent({
      userId: user.id,
      phone: user.phone,
      type: AuthEventType.PASSWORD_RESET,
      meta,
    });
    return { data: { success: true } };
  }

  session(user: AuthenticatedUser): { data: AuthUserView } {
    return {
      data: {
        id: user.id,
        role: user.role,
        phone: user.phone,
        preferredLanguage: user.preferredLanguage as PreferredLanguage,
        accountStatus: user.accountStatus,
      },
    };
  }

  private async issueSession(
    user: UserRow,
    meta: RequestMeta,
  ): Promise<{ data: AuthTokenPair }> {
    const { raw, hash } = this.tokenService.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        familyId: randomUUID(),
        expiresAt: this.tokenService.refreshExpiresAt(),
        createdByIp: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.recordEvent({
      userId: user.id,
      phone: user.phone,
      type: AuthEventType.LOGIN_SUCCESS,
      meta,
    });

    return {
      data: {
        accessToken: this.tokenService.signAccess(user.id, user.role),
        refreshToken: raw,
        expiresIn: this.tokenService.accessExpiresInSeconds(),
        tokenType: 'Bearer',
        user: toPublicUser(user),
      },
    };
  }

  private assertAccountAllowsSession(user: UserRow): void {
    if (user.accountStatus === 'SUSPENDED') {
      throwAccountSuspended();
    }
    if (user.accountStatus === 'BLOCKED') {
      throwAccountBlocked();
    }
    if (user.accountStatus !== 'ACTIVE') {
      throwInvalidCredentials();
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async recordEvent(input: {
    userId?: string;
    phone?: string;
    type: string;
    meta: RequestMeta;
  }): Promise<void> {
    await this.prisma.authEvent.create({
      data: {
        userId: input.userId,
        phone: input.phone,
        type: input.type,
        ip: input.meta.ip,
        userAgent: input.meta.userAgent,
      },
    });
  }
}

function toPublicUser(user: UserRow): AuthUserView {
  return {
    id: user.id,
    role: user.role,
    phone: user.phone,
    preferredLanguage: user.preferredLanguage,
    accountStatus: user.accountStatus,
  };
}

function isEligibleForOtp(
  user: UserRow | null,
  purpose: OtpPurpose,
): user is UserRow {
  if (!user || user.deletedAt) {
    return false;
  }
  if (purpose === 'REGISTER') {
    return user.accountStatus === 'PENDING_PHONE';
  }
  return user.accountStatus === 'ACTIVE';
}
