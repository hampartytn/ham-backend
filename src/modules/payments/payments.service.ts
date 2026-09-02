import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrganization } from '../../common/utils/ownership';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PAYMENT_PROVIDER,
  STUB_PAYMENT_PROVIDER_NAME,
  type PaymentProvider,
} from '../../integrations/payment/payment.provider';
import { RazorpayPaymentProvider } from '../../integrations/payment/razorpay-payment.provider';
import { RAZORPAY_PROVIDER_NAME } from '../../integrations/payment/razorpay-signature';
import { RAZORPAY_PAYMENT_PROVIDER } from '../../integrations/payment/razorpay.tokens';
import { EmployerMembershipService } from '../employers/employer-membership.service';
import { isEmployerProfileComplete } from '../employers/employer-membership.util';
import { MembershipService } from '../membership/membership.service';
import {
  ConfirmPaymentDto,
  InitiatePaymentDto,
  PaymentWebhookDto,
} from './dto/payment.dto';
import {
  PAYMENT_CURRENCY_INR,
  PAYMENT_PURPOSE_EMPLOYER_ACTIVATION,
  PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
  PAYMENT_PURPOSE_MEMBERSHIP,
  applyWebhookStatus,
} from './payments.util';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(PAYMENT_PROVIDER)
    private readonly stubProvider: PaymentProvider,
    @Inject(RAZORPAY_PAYMENT_PROVIDER)
    private readonly razorpayProvider: RazorpayPaymentProvider,
    private readonly membershipService: MembershipService,
    private readonly employerMembershipService: EmployerMembershipService,
    private readonly auditService: AuditService,
  ) {}

  async initiate(user: AuthenticatedUser, dto: InitiatePaymentDto) {
    if (dto.purpose === PAYMENT_PURPOSE_MEMBERSHIP) {
      return this.initiateMembership(user, dto);
    }
    if (dto.purpose === PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP) {
      return this.initiateEmployerMembership(user, dto);
    }
    return this.initiateEmployerActivation(user, dto);
  }

  async confirm(
    user: AuthenticatedUser,
    dto: ConfirmPaymentDto,
    context: { ip: string | null; userAgent: string | null },
  ) {
    if (user.role === 'EMPLOYER') {
      return this.confirmEmployerMembership(user, dto, context);
    }
    if (user.role !== 'EMPLOYEE') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Forbidden',
      });
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        purpose: PAYMENT_PURPOSE_MEMBERSHIP,
        provider: RAZORPAY_PROVIDER_NAME,
        providerOrderId: dto.razorpay_order_id,
      },
    });
    if (!payment) {
      throw notFound();
    }

    const keySecret = this.razorpayProvider.keySecret();
    if (
      !this.razorpayProvider.verifyCheckoutSignature(
        dto.razorpay_order_id,
        dto.razorpay_payment_id,
        dto.razorpay_signature,
        keySecret,
      )
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }

    if (payment.membershipPlanId) {
      const plan = await this.prisma.membershipPlan.findUnique({
        where: { id: payment.membershipPlanId },
      });
      if (plan && plan.amountPaise !== payment.amountPaise) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'Payment amount does not match the membership plan',
        });
      }
    }

    const updated = await this.succeedMembershipPayment(
      payment.id,
      dto.razorpay_payment_id,
      user.id,
      context,
      'USER',
    );

    await this.auditService.append({
      actorType: 'USER',
      actorUserId: user.id,
      action: 'payment.verified',
      targetType: 'Payment',
      targetId: payment.id,
      metadata: { purpose: PAYMENT_PURPOSE_MEMBERSHIP },
      ip: context.ip ?? undefined,
    });

    return {
      data: {
        paymentId: updated.paymentId,
        status: updated.status,
        membershipStatus: updated.membershipStatus,
      },
    };
  }

  async getPayment(user: AuthenticatedUser, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
    });
    if (!payment) {
      throw notFound();
    }
    if (user.role === 'EMPLOYEE') {
      if (payment.userId !== user.id || payment.purpose !== PAYMENT_PURPOSE_MEMBERSHIP) {
        throw notFound();
      }
    } else {
      const organizationId = await this.requireOrganizationId(user);
      assertSameOrganization(organizationId, payment.organizationId);
    }
    return {
      data: {
        paymentId: payment.id,
        status: payment.status,
        amountPaise: payment.amountPaise,
        currency: payment.currency,
        purpose: payment.purpose,
      },
    };
  }

  async handleWebhook(
    provider: string,
    signatureHeader: string | undefined,
    rawBody: Buffer | undefined,
    dto: PaymentWebhookDto,
  ) {
    const secret = this.configService.get<string>('payment.webhookSecret');
    if (!this.stubProvider.verifyWebhook(rawBody, signatureHeader, secret)) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }
    if (provider !== this.stubProvider.name) {
      throw notFound();
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        provider,
        providerOrderId: dto.providerOrderId,
      },
    });
    if (!payment) {
      throw notFound();
    }

    const fingerprint = createHash('sha256')
      .update(rawBody ?? Buffer.alloc(0))
      .digest('hex');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.webhookEvent.create({
          data: {
            provider,
            providerEventId: dto.eventId,
            paymentId: payment.id,
            payloadFingerprint: fingerprint,
            processedAt: new Date(),
          },
        });

        const next = applyWebhookStatus(payment.status, dto.status);
        if (!next) {
          return;
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: next },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { received: true };
      }
      throw error;
    }

    return { received: true };
  }

  async handleRazorpayWebhook(
    signatureHeader: string | undefined,
    eventIdHeader: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    const secret = this.razorpayProvider.webhookSecret();
    if (!this.razorpayProvider.verifyWebhook(rawBody, signatureHeader, secret)) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }

    const parsed = parseRazorpayWebhook(rawBody);
    if (!parsed) {
      throw notFound();
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        provider: RAZORPAY_PROVIDER_NAME,
        providerOrderId: parsed.orderId,
      },
    });
    if (!payment) {
      throw notFound();
    }

    const fingerprint = createHash('sha256')
      .update(rawBody ?? Buffer.alloc(0))
      .digest('hex');
    const providerEventId =
      eventIdHeader?.trim() ||
      `${parsed.event}:${parsed.paymentId ?? parsed.orderId}`;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.webhookEvent.create({
          data: {
            provider: RAZORPAY_PROVIDER_NAME,
            providerEventId,
            paymentId: payment.id,
            payloadFingerprint: fingerprint,
            processedAt: new Date(),
          },
        });

        if (parsed.status === 'FAILED') {
          const next = applyWebhookStatus(payment.status, 'FAILED');
          if (next) {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: next, providerPaymentId: parsed.paymentId },
            });
          }
          return;
        }

        if (parsed.status === 'SUCCEEDED') {
          const current = await tx.payment.findUniqueOrThrow({
            where: { id: payment.id },
          });
          const next = applyWebhookStatus(current.status, 'SUCCEEDED');
          let membershipId = current.membershipId;
          if (next === 'SUCCEEDED' && current.purpose === PAYMENT_PURPOSE_MEMBERSHIP) {
            const membership = await this.membershipService.activatePaidMembership(
              tx,
              current.userId,
              {},
            );
            membershipId = membership.id;
          }
          if (
            next === 'SUCCEEDED' &&
            current.purpose === PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP &&
            current.organizationId
          ) {
            await this.employerMembershipService.activateEmployerMembership(
              tx,
              current.organizationId,
            );
          }
          if (next || parsed.paymentId) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                ...(next ? { status: next } : {}),
                providerPaymentId: parsed.paymentId ?? current.providerPaymentId,
                membershipId,
              },
            });
          }
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { received: true };
      }
      throw error;
    }

    if (parsed.status === 'FAILED') {
      await this.auditService.append({
        actorType: 'SYSTEM',
        action: 'payment.failed',
        targetType: 'Payment',
        targetId: payment.id,
        metadata: { purpose: payment.purpose, event: parsed.event },
      });
    } else {
      await this.auditService.append({
        actorType: 'SYSTEM',
        action: 'payment.webhook_reconciled',
        targetType: 'Payment',
        targetId: payment.id,
        metadata: { purpose: payment.purpose, event: parsed.event },
      });
    }

    return { received: true };
  }

  private async initiateEmployerActivation(
    user: AuthenticatedUser,
    dto: InitiatePaymentDto,
  ) {
    if (user.role !== 'EMPLOYER') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Forbidden',
      });
    }
    this.assertStubEnabled();
    const organizationId = await this.requireOrganizationId(user);
    const amountPaise = this.catalogAmount(dto.purpose);
    const currency = PAYMENT_CURRENCY_INR;

    const created = await this.prisma.payment.create({
      data: {
        organizationId,
        userId: user.id,
        provider: this.stubProvider.name,
        amountPaise,
        currency,
        status: 'CREATED',
        purpose: dto.purpose,
      },
    });

    let order: Awaited<ReturnType<PaymentProvider['createOrder']>>;
    try {
      order = await this.stubProvider.createOrder({
        paymentId: created.id,
        amountPaise,
        currency,
        purpose: dto.purpose,
      });
    } catch {
      throw new BadGatewayException({
        code: ErrorCode.PROVIDER_UNAVAILABLE,
        message: 'Payment provider is unavailable',
      });
    }

    const pending = await this.prisma.payment.update({
      where: { id: created.id },
      data: {
        providerOrderId: order.providerOrderId,
        status: 'PENDING',
      },
    });

    await this.auditService.append({
      actorType: 'USER',
      actorUserId: user.id,
      action: 'payment.initiated',
      targetType: 'Payment',
      targetId: pending.id,
      metadata: { purpose: dto.purpose },
    });

    return {
      data: {
        paymentId: pending.id,
        status: pending.status,
        providerPayload: order.providerPayload,
      },
    };
  }

  private async initiateEmployerMembership(
    user: AuthenticatedUser,
    dto: InitiatePaymentDto,
  ) {
    if (user.role !== 'EMPLOYER') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Forbidden',
      });
    }
    if (!this.razorpayProvider.isConfigured()) {
      throw new ConflictException({
        code: ErrorCode.NOT_ENABLED,
        message: 'Payments are not enabled',
      });
    }
    if (!dto.planId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
      });
    }

    const organizationId = await this.requireOrganizationId(user);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (organization.membershipStatus === 'ACTIVE') {
      throw conflict('Membership already active');
    }
    if (!isEmployerProfileComplete(organization)) {
      throw conflict('Company profile is incomplete');
    }

    const plan = await this.employerMembershipService.requireActivePlan(dto.planId);
    const amountPaise = plan.amountPaise;
    const currency = plan.currency || PAYMENT_CURRENCY_INR;

    const reusable = await this.prisma.payment.findFirst({
      where: {
        organizationId,
        purpose: PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
        membershipPlanId: plan.id,
        provider: RAZORPAY_PROVIDER_NAME,
        status: { in: ['CREATED', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable?.providerOrderId && reusable.status === 'PENDING') {
      return {
        data: {
          paymentId: reusable.id,
          status: reusable.status,
          providerPayload: this.razorpayProvider.checkoutPayload(
            reusable.providerOrderId,
            reusable.amountPaise,
            reusable.currency,
          ),
        },
      };
    }

    const created = await this.prisma.payment.create({
      data: {
        organizationId,
        userId: user.id,
        membershipPlanId: plan.id,
        provider: RAZORPAY_PROVIDER_NAME,
        amountPaise,
        currency,
        status: 'CREATED',
        purpose: PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
      },
    });

    let order: Awaited<ReturnType<PaymentProvider['createOrder']>>;
    try {
      order = await this.razorpayProvider.createOrder({
        paymentId: created.id,
        amountPaise,
        currency,
        purpose: PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
      });
    } catch {
      throw new BadGatewayException({
        code: ErrorCode.PROVIDER_UNAVAILABLE,
        message: 'Payment provider is unavailable',
      });
    }

    const pending = await this.prisma.payment.update({
      where: { id: created.id },
      data: {
        providerOrderId: order.providerOrderId,
        status: 'PENDING',
      },
    });

    await this.auditService.append({
      actorType: 'USER',
      actorUserId: user.id,
      action: 'payment.initiated',
      targetType: 'Payment',
      targetId: pending.id,
      metadata: { purpose: PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP, planId: plan.id },
    });

    return {
      data: {
        paymentId: pending.id,
        status: pending.status,
        providerPayload: order.providerPayload,
      },
    };
  }

  private async confirmEmployerMembership(
    user: AuthenticatedUser,
    dto: ConfirmPaymentDto,
    context: { ip: string | null; userAgent: string | null },
  ) {
    const organizationId = await this.requireOrganizationId(user);
    const payment = await this.prisma.payment.findFirst({
      where: {
        organizationId,
        purpose: PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
        provider: RAZORPAY_PROVIDER_NAME,
        providerOrderId: dto.razorpay_order_id,
      },
    });
    if (!payment) {
      throw notFound();
    }

    const keySecret = this.razorpayProvider.keySecret();
    if (
      !this.razorpayProvider.verifyCheckoutSignature(
        dto.razorpay_order_id,
        dto.razorpay_payment_id,
        dto.razorpay_signature,
        keySecret,
      )
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }

    if (payment.membershipPlanId) {
      const plan = await this.prisma.membershipPlan.findUnique({
        where: { id: payment.membershipPlanId },
      });
      if (plan && plan.amountPaise !== payment.amountPaise) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'Payment amount does not match the membership plan',
        });
      }
    }

    const updated = await this.succeedEmployerMembershipPayment(
      payment.id,
      dto.razorpay_payment_id,
      organizationId,
    );

    await this.auditService.append({
      actorType: 'USER',
      actorUserId: user.id,
      action: 'payment.verified',
      targetType: 'Payment',
      targetId: payment.id,
      metadata: { purpose: PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP },
      ip: context.ip ?? undefined,
    });

    return {
      data: {
        paymentId: updated.paymentId,
        status: updated.status,
        membershipStatus: updated.membershipStatus,
      },
    };
  }

  private async initiateMembership(
    user: AuthenticatedUser,
    dto: InitiatePaymentDto,
  ) {
    if (user.role !== 'EMPLOYEE') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Forbidden',
      });
    }
    if (!this.razorpayProvider.isConfigured()) {
      throw new ConflictException({
        code: ErrorCode.NOT_ENABLED,
        message: 'Payments are not enabled',
      });
    }
    await this.membershipService.requireVerified(user.id);
    this.membershipService.assertTermsVersion(dto.termsVersion);
    if (dto.accepted !== true || !dto.planId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
      });
    }

    const existingMembership = await this.prisma.hamMembership.findUnique({
      where: { userId: user.id },
    });
    if (existingMembership?.status === 'JOINED') {
      throw conflict('Membership already joined');
    }

    const plan = await this.membershipService.requireActivePlan(dto.planId);
    const amountPaise = plan.amountPaise;
    const currency = plan.currency || PAYMENT_CURRENCY_INR;

    const reusable = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        purpose: PAYMENT_PURPOSE_MEMBERSHIP,
        membershipPlanId: plan.id,
        provider: RAZORPAY_PROVIDER_NAME,
        status: { in: ['CREATED', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reusable?.providerOrderId && reusable.status === 'PENDING') {
      return {
        data: {
          paymentId: reusable.id,
          status: reusable.status,
          providerPayload: this.razorpayProvider.checkoutPayload(
            reusable.providerOrderId,
            reusable.amountPaise,
            reusable.currency,
          ),
        },
      };
    }

    const created = await this.prisma.payment.create({
      data: {
        userId: user.id,
        membershipPlanId: plan.id,
        provider: RAZORPAY_PROVIDER_NAME,
        amountPaise,
        currency,
        status: 'CREATED',
        purpose: PAYMENT_PURPOSE_MEMBERSHIP,
      },
    });

    let order: Awaited<ReturnType<PaymentProvider['createOrder']>>;
    try {
      order = await this.razorpayProvider.createOrder({
        paymentId: created.id,
        amountPaise,
        currency,
        purpose: PAYMENT_PURPOSE_MEMBERSHIP,
      });
    } catch {
      throw new BadGatewayException({
        code: ErrorCode.PROVIDER_UNAVAILABLE,
        message: 'Payment provider is unavailable',
      });
    }

    const pending = await this.prisma.payment.update({
      where: { id: created.id },
      data: {
        providerOrderId: order.providerOrderId,
        status: 'PENDING',
      },
    });

    await this.auditService.append({
      actorType: 'USER',
      actorUserId: user.id,
      action: 'payment.initiated',
      targetType: 'Payment',
      targetId: pending.id,
      metadata: { purpose: PAYMENT_PURPOSE_MEMBERSHIP, planId: plan.id },
    });

    return {
      data: {
        paymentId: pending.id,
        status: pending.status,
        providerPayload: order.providerPayload,
      },
    };
  }

  private async succeedMembershipPayment(
    paymentId: string,
    providerPaymentId: string,
    userId: string,
    context: { ip: string | null; userAgent: string | null },
    actorType: 'USER' | 'SYSTEM',
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (current.userId !== userId) {
        throw notFound();
      }

      const membership = await this.membershipService.activatePaidMembership(
        tx,
        userId,
        context,
      );

      const next = applyWebhookStatus(current.status, 'SUCCEEDED');
      const updated = next
        ? await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: next,
              providerPaymentId,
              membershipId: membership.id,
            },
          })
        : await tx.payment.update({
            where: { id: paymentId },
            data: {
              providerPaymentId: current.providerPaymentId ?? providerPaymentId,
              membershipId: membership.id,
            },
          });

      return { updated, membership };
    });

    if (result.membership.status === 'JOINED') {
      await this.auditService.append({
        actorType,
        actorUserId: actorType === 'USER' ? userId : undefined,
        action: 'membership.activated',
        targetType: 'HamMembership',
        targetId: result.membership.id,
        metadata: { paymentId },
        ip: context.ip ?? undefined,
      });
    }

    return {
      paymentId: result.updated.id,
      status: result.updated.status,
      membershipStatus: result.membership.status,
    };
  }

  private async succeedEmployerMembershipPayment(
    paymentId: string,
    providerPaymentId: string,
    organizationId: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (
        current.organizationId !== organizationId ||
        current.purpose !== PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP
      ) {
        throw notFound();
      }

      const membership =
        await this.employerMembershipService.activateEmployerMembership(
          tx,
          organizationId,
        );

      const next = applyWebhookStatus(current.status, 'SUCCEEDED');
      const updated = next
        ? await tx.payment.update({
            where: { id: paymentId },
            data: {
              status: next,
              providerPaymentId,
            },
          })
        : await tx.payment.update({
            where: { id: paymentId },
            data: {
              providerPaymentId: current.providerPaymentId ?? providerPaymentId,
            },
          });

      return { updated, membership };
    });

    return {
      paymentId: result.updated.id,
      status: result.updated.status,
      membershipStatus: result.membership.membershipStatus,
    };
  }

  private assertStubEnabled(): void {
    const configured = this.configService.get<string>(
      'payment.provider',
      STUB_PAYMENT_PROVIDER_NAME,
    );
    const stubEnabled = this.configService.get<boolean>(
      'payment.stubEnabled',
      true,
    );
    if (configured !== STUB_PAYMENT_PROVIDER_NAME || stubEnabled !== true) {
      throw new ConflictException({
        code: ErrorCode.NOT_ENABLED,
        message: 'Payments are not enabled',
      });
    }
  }

  private catalogAmount(purpose: string): number {
    if (purpose !== PAYMENT_PURPOSE_EMPLOYER_ACTIVATION) {
      throw new ConflictException({
        code: ErrorCode.NOT_ENABLED,
        message: 'Payments are not enabled',
      });
    }
    return this.configService.get<number>('payment.employerActivationPaise', 1);
  }

  private async requireOrganizationId(
    user: AuthenticatedUser,
  ): Promise<string> {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      throw notFound();
    }
    if (!profile.organizationId) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Organization is required',
      });
    }
    return profile.organizationId;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Resource not found',
  });
}

function conflict(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONFLICT,
    message,
  });
}

function parseRazorpayWebhook(rawBody: Buffer | undefined): {
  event: string;
  orderId: string;
  paymentId: string | null;
  status: 'SUCCEEDED' | 'FAILED';
} | null {
  if (!rawBody || rawBody.length === 0) {
    return null;
  }
  let body: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string } };
      order?: { entity?: { id?: string } };
    };
  };
  try {
    body = JSON.parse(rawBody.toString('utf8')) as typeof body;
  } catch {
    return null;
  }
  const event = body.event ?? '';
  const paymentId = body.payload?.payment?.entity?.id ?? null;
  const orderId =
    body.payload?.payment?.entity?.order_id ??
    body.payload?.order?.entity?.id ??
    '';
  if (!orderId) {
    return null;
  }
  if (event === 'payment.failed') {
    return { event, orderId, paymentId, status: 'FAILED' };
  }
  if (event === 'payment.captured' || event === 'order.paid') {
    return { event, orderId, paymentId, status: 'SUCCEEDED' };
  }
  return null;
}
