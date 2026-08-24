import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import type {
  ConsentAction,
  MembershipStatus,
} from '../../generated/prisma/enums';
import { JoinMembershipDto, MembershipTermsDto } from './dto/membership.dto';
import {
  DEFAULT_MEMBERSHIP_TERMS_VERSION,
  MAX_CONSENT_IP_LENGTH,
  MAX_CONSENT_UA_LENGTH,
  MEMBERSHIP_INFO_COPY_KEYS,
  canJoinMembership,
  truncateConsentField,
} from './membership.util';

export type ConsentActorContext = {
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getMembership(user: AuthenticatedUser) {
    const identityVerified = await this.isIdentityVerified(user.id);
    const membership = await this.prisma.hamMembership.findUnique({
      where: { userId: user.id },
    });
    const status = membership?.status ?? null;
    return {
      data: {
        status,
        canJoin: canJoinMembership(identityVerified, status),
        termsVersion: this.termsVersion(),
        identityVerified,
      },
    };
  }

  getInfo(user: AuthenticatedUser) {
    void user;
    return {
      data: {
        termsVersion: this.termsVersion(),
        copyKeys: [...MEMBERSHIP_INFO_COPY_KEYS],
        placeholderNotice: 'Membership information copy is not available yet.',
        withdrawEnabled: false,
      },
    };
  }

  async join(
    user: AuthenticatedUser,
    dto: JoinMembershipDto,
    context: ConsentActorContext,
  ) {
    this.assertTermsVersion(dto.termsVersion);
    await this.requireVerified(user.id);

    const existing = await this.prisma.hamMembership.findUnique({
      where: { userId: user.id },
    });
    if (existing?.status === 'JOINED') {
      throw conflict('Membership already joined');
    }

    const now = new Date();
    try {
      const membership = await this.prisma.$transaction(async (tx) => {
        const row = existing
          ? await tx.hamMembership.update({
              where: { id: existing.id },
              data: {
                status: 'JOINED',
                joinedAt: now,
                withdrawnAt: null,
              },
            })
          : await tx.hamMembership.create({
              data: {
                userId: user.id,
                status: 'JOINED',
                joinedAt: now,
              },
            });
        await tx.consentRecord.create({
          data: this.consentData(
            user.id,
            row.id,
            'JOINED',
            dto.termsVersion,
            now,
            context,
          ),
        });
        return row;
      });
      return { data: this.toMembershipDto(membership, true) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw conflict('Membership already joined');
      }
      throw error;
    }
  }

  async decline(
    user: AuthenticatedUser,
    dto: MembershipTermsDto,
    context: ConsentActorContext,
  ) {
    this.assertTermsVersion(dto.termsVersion);
    await this.requireVerified(user.id);

    const existing = await this.prisma.hamMembership.findUnique({
      where: { userId: user.id },
    });
    if (existing?.status === 'JOINED') {
      throw conflict('Membership cannot be declined');
    }
    if (existing?.status === 'DECLINED') {
      throw conflict('Membership already declined');
    }

    const now = new Date();
    const membership = await this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.hamMembership.update({
            where: { id: existing.id },
            data: { status: 'DECLINED', joinedAt: null, withdrawnAt: null },
          })
        : await tx.hamMembership.create({
            data: {
              userId: user.id,
              status: 'DECLINED',
            },
          });
      await tx.consentRecord.create({
        data: this.consentData(
          user.id,
          row.id,
          'DECLINED',
          dto.termsVersion,
          now,
          context,
        ),
      });
      return row;
    });
    return { data: this.toMembershipDto(membership, true) };
  }

  withdraw(): never {
    throw new ConflictException({
      code: ErrorCode.NOT_ENABLED,
      message: 'Membership withdrawal is not enabled',
    });
  }

  private termsVersion(): string {
    return this.configService.get<string>(
      'membership.termsVersion',
      DEFAULT_MEMBERSHIP_TERMS_VERSION,
    );
  }

  private assertTermsVersion(termsVersion: string): void {
    if (termsVersion !== this.termsVersion()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'termsVersion', issue: 'must match current terms' }],
      });
    }
  }

  private async requireVerified(userId: string): Promise<void> {
    if (!(await this.isIdentityVerified(userId))) {
      throw conflict('Identity verification is required');
    }
  }

  private async isIdentityVerified(userId: string): Promise<boolean> {
    const latest = await this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    return latest?.status === 'SUCCEEDED';
  }

  private consentData(
    userId: string,
    membershipId: string,
    action: ConsentAction,
    termsVersion: string,
    occurredAt: Date,
    context: ConsentActorContext,
  ) {
    return {
      userId,
      membershipId,
      action,
      termsVersion,
      occurredAt,
      ip: truncateConsentField(context.ip, MAX_CONSENT_IP_LENGTH),
      userAgent: truncateConsentField(context.userAgent, MAX_CONSENT_UA_LENGTH),
    };
  }

  private toMembershipDto(
    membership: { status: MembershipStatus },
    identityVerified: boolean,
  ) {
    return {
      status: membership.status,
      canJoin: canJoinMembership(identityVerified, membership.status),
      termsVersion: this.termsVersion(),
      identityVerified,
    };
  }
}

function conflict(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONFLICT,
    message,
  });
}
