import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { localizedName } from '../../common/utils/localized-name';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  EMPLOYER_MEMBERSHIP_PLAN_CODE,
  PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
} from '../payments/payments.util';
import {
  canPayEmployerMembership,
  isEmployerProfileComplete,
} from './employer-membership.util';

type MembershipPlanView = {
  id: string;
  code: string;
  name: string;
  amountPaise: number;
  currency: string;
};

@Injectable()
export class EmployerMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async getMembership(user: AuthenticatedUser) {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId: user.id },
      include: { organization: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }

    const organization = profile.organization;
    const profileComplete = isEmployerProfileComplete(organization);
    const status = organization?.membershipStatus ?? 'INACTIVE';
    const payment = organization
      ? await this.latestEmployerMembershipPayment(organization.id)
      : null;
    const plan = await this.activePlanView(user.preferredLanguage);

    return {
      data: {
        status,
        canPay: canPayEmployerMembership({
          profileComplete,
          planActive: Boolean(plan),
          status,
          razorpayConfigured: this.razorpayConfigured(),
        }),
        profileComplete,
        paymentStatus: payment?.status ?? null,
        activatedAt: organization?.membershipActivatedAt ?? null,
        verificationState: organization?.verificationState ?? 'UNVERIFIED',
        plan,
      },
    };
  }

  async activateEmployerMembership(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const current = await tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        membershipStatus: true,
        membershipActivatedAt: true,
        verificationState: true,
        activationStatus: true,
      },
    });
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }
    if (current.membershipStatus === 'ACTIVE') {
      return current;
    }
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data: {
        membershipStatus: 'ACTIVE',
        membershipActivatedAt: current.membershipActivatedAt ?? new Date(),
      },
      select: {
        id: true,
        membershipStatus: true,
        membershipActivatedAt: true,
        verificationState: true,
        activationStatus: true,
      },
    });
    await this.auditService.append({
      actorType: 'SYSTEM',
      action: 'employer_membership.activated',
      targetType: 'Organization',
      targetId: organizationId,
    });
    return updated;
  }

  async requireActivePlan(planId: string) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: {
        id: planId,
        code: EMPLOYER_MEMBERSHIP_PLAN_CODE,
        isActive: true,
      },
    });
    if (!plan) {
      throw new ConflictException({
        code: ErrorCode.NOT_ENABLED,
        message: 'Membership plan is not available',
      });
    }
    return plan;
  }

  async activePlanView(language: string): Promise<MembershipPlanView | null> {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { code: EMPLOYER_MEMBERSHIP_PLAN_CODE, isActive: true },
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

  private razorpayConfigured(): boolean {
    const keyId = this.configService.get<string>('payment.razorpay.keyId', '');
    const keySecret = this.configService.get<string>(
      'payment.razorpay.keySecret',
      '',
    );
    return keyId.length > 0 && keySecret.length > 0;
  }

  private async latestEmployerMembershipPayment(organizationId: string) {
    return this.prisma.payment.findFirst({
      where: {
        organizationId,
        purpose: PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
  }
}
