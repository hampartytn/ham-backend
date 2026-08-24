import {
  BadGatewayException,
  ConflictException,
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
import {
  PAYMENT_PROVIDER,
  STUB_PAYMENT_PROVIDER_NAME,
  type PaymentProvider,
} from '../../integrations/payment/payment.provider';
import { InitiatePaymentDto, PaymentWebhookDto } from './dto/payment.dto';
import {
  PAYMENT_CURRENCY_INR,
  PAYMENT_PURPOSE_EMPLOYER_ACTIVATION,
  applyWebhookStatus,
} from './payments.util';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async initiate(user: AuthenticatedUser, dto: InitiatePaymentDto) {
    this.assertStubEnabled();
    const organizationId = await this.requireOrganizationId(user);
    const amountPaise = this.catalogAmount(dto.purpose);
    const currency = PAYMENT_CURRENCY_INR;

    const created = await this.prisma.payment.create({
      data: {
        organizationId,
        userId: user.id,
        provider: this.paymentProvider.name,
        amountPaise,
        currency,
        status: 'CREATED',
        purpose: dto.purpose,
      },
    });

    let order: Awaited<ReturnType<PaymentProvider['createOrder']>>;
    try {
      order = await this.paymentProvider.createOrder({
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

    return {
      data: {
        paymentId: pending.id,
        status: pending.status,
        providerPayload: order.providerPayload,
      },
    };
  }

  async getPayment(user: AuthenticatedUser, paymentId: string) {
    const organizationId = await this.requireOrganizationId(user);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
    });
    if (!payment) {
      throw notFound();
    }
    assertSameOrganization(organizationId, payment.organizationId);
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
    if (!this.paymentProvider.verifyWebhook(rawBody, signatureHeader, secret)) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }
    if (provider !== this.paymentProvider.name) {
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
