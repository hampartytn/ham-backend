import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { localizedName } from '../../common/utils/localized-name';
import { PrismaService } from '../../database/prisma.service';
import type {
  ConsentAction,
  MembershipStatus,
} from '../../generated/prisma/enums';
import {
  EMPLOYEE_MEMBERSHIP_PLAN_CODE,
  PAYMENT_PURPOSE_MEMBERSHIP,
} from '../payments/payments.util';
import { JoinMembershipDto, MembershipTermsDto } from './dto/membership.dto';
import {
  DEFAULT_MEMBERSHIP_TERMS_VERSION,
  MAX_CONSENT_IP_LENGTH,
  MAX_CONSENT_UA_LENGTH,
  MEMBERSHIP_INFO_COPY_KEYS,
  canJoinMembership,
  canPayMembership,
  truncateConsentField,
} from './membership.util';

export type ConsentActorContext = {
  ip?: string | null;
  userAgent?: string | null;
};

type MembershipPlanView = {
  id: string;
  code: string;
  name: string;
  amountPaise: number;
  currency: string;
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
    const payment = await this.latestMembershipPayment(user.id);
    const membershipPaid = payment?.status === 'SUCCEEDED';
    const plan = await this.activePlanView(user.preferredLanguage);
    return {
      data: this.toMembershipDto({
        status,
        identityVerified,
        membershipPaid,
        paymentStatus: payment?.status ?? null,
        plan,
      }),
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
    if (!(await this.hasSucceededMembershipPayment(user.id))) {
      throw conflict('Membership payment is required');
    }

    const existing = await this.prisma.hamMembership.findUnique({
      where: { userId: user.id },
    });
    if (existing?.status === 'JOINED') {
      throw conflict('Membership already joined');
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      return this.activateJoined(tx, user.id, dto.termsVersion, context);
    });
    return {
      data: this.toMembershipDto({
        status: membership.status,
        identityVerified: true,
        membershipPaid: true,
        paymentStatus: 'SUCCEEDED',
        plan: await this.activePlanView(user.preferredLanguage),
      }),
    };
  }

  async activatePaidMembership(
    tx: Prisma.TransactionClient,
    userId: string,
    context: ConsentActorContext,
  ) {
    return this.activateJoined(tx, userId, this.termsVersion(), context);
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
    const payment = await this.latestMembershipPayment(user.id);
    return {
      data: this.toMembershipDto({
        status: membership.status,
        identityVerified: true,
        membershipPaid: payment?.status === 'SUCCEEDED',
        paymentStatus: payment?.status ?? null,
        plan: await this.activePlanView(user.preferredLanguage),
      }),
    };
  }

  withdraw(): never {
    throw new ConflictException({
      code: ErrorCode.NOT_ENABLED,
      message: 'Membership withdrawal is not enabled',
    });
  }

  async requireVerified(userId: string): Promise<void> {
    if (!(await this.isIdentityVerified(userId))) {
      throw conflict('Identity verification is required');
    }
  }

  async isIdentityVerified(userId: string): Promise<boolean> {
    const latest = await this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    return latest?.status === 'SUCCEEDED';
  }

  async hasSucceededMembershipPayment(userId: string): Promise<boolean> {
    const payment = await this.latestMembershipPayment(userId);
    return payment?.status === 'SUCCEEDED';
  }

  async activePlanView(language: string): Promise<MembershipPlanView | null> {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { code: EMPLOYEE_MEMBERSHIP_PLAN_CODE, isActive: true },
    });
    if (!plan) {
      return null;
    }
    return {
      id: plan.id,
      code: plan.code,
      name: localizedName(language, plan.names),
      amountPaise: plan.amountPaise,
      currency: plan.currency,
    };
  }

  async requireActivePlan(planId: string) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, code: EMPLOYEE_MEMBERSHIP_PLAN_CODE, isActive: true },
    });
    if (!plan) {
      throw new ConflictException({
        code: ErrorCode.NOT_ENABLED,
        message: 'Membership plan is not available',
      });
    }
    return plan;
  }

  termsVersion(): string {
    return this.configService.get<string>(
      'membership.termsVersion',
      DEFAULT_MEMBERSHIP_TERMS_VERSION,
    );
  }

  assertTermsVersion(termsVersion: string | undefined): void {
    if (termsVersion !== this.termsVersion()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'termsVersion', issue: 'must match current terms' }],
      });
    }
  }

  private async latestMembershipPayment(userId: string) {
    return this.prisma.payment.findFirst({
      where: { userId, purpose: PAYMENT_PURPOSE_MEMBERSHIP },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
  }

  private async activateJoined(
    tx: Prisma.TransactionClient,
    userId: string,
    termsVersion: string,
    context: ConsentActorContext,
  ) {
    const existing = await tx.hamMembership.findUnique({
      where: { userId },
    });
    if (existing?.status === 'JOINED') {
      return existing;
    }

    const now = new Date();
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
            userId,
            status: 'JOINED',
            joinedAt: now,
          },
        });
    await tx.consentRecord.create({
      data: this.consentData(
        userId,
        row.id,
        'JOINED',
        termsVersion,
        now,
        context,
      ),
    });
    return row;
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

  private toMembershipDto(input: {
    status: MembershipStatus | string | null;
    identityVerified: boolean;
    membershipPaid: boolean;
    paymentStatus: string | null;
    plan: MembershipPlanView | null;
  }) {
    return {
      status: input.status,
      canJoin: canJoinMembership(
        input.identityVerified,
        input.status,
        input.membershipPaid,
      ),
      canPay: canPayMembership(
        input.identityVerified,
        input.status,
        input.membershipPaid,
        Boolean(input.plan),
      ),
      termsVersion: this.termsVersion(),
      identityVerified: input.identityVerified,
      membershipPaid: input.membershipPaid,
      paymentStatus: input.paymentStatus,
      plan: input.plan,
    };
  }
}

function conflict(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONFLICT,
    message,
  });
}
