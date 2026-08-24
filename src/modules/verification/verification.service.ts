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
import { PrismaService } from '../../database/prisma.service';
import {
  IDENTITY_VERIFICATION_PROVIDER,
  type IdentityVerificationProvider,
} from '../../integrations/identity-verification/identity-verification.provider';
import { sanitizeMaskedIdentity } from '../../integrations/identity-verification/mask-identity';
import { verifyIdentityWebhookSignature } from '../../integrations/identity-verification/webhook-signature';
import {
  MockCompleteVerificationDto,
  StartVerificationDto,
  VerificationWebhookDto,
} from './dto/verification.dto';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(IDENTITY_VERIFICATION_PROVIDER)
    private readonly identityProvider: IdentityVerificationProvider,
  ) {}

  async start(user: AuthenticatedUser, dto: StartVerificationDto) {
    const latest = await this.latestForUser(user.id);
    if (latest?.status === 'SUCCEEDED') {
      throw conflict('Identity is already verified');
    }
    if (
      latest &&
      (latest.status === 'PENDING' || latest.status === 'IN_PROGRESS')
    ) {
      return { data: toStartDto(latest, latest.provider) };
    }

    let started: Awaited<ReturnType<IdentityVerificationProvider['start']>>;
    try {
      started = await this.identityProvider.start({
        userId: user.id,
        returnUrl: dto.returnUrl,
      });
    } catch {
      throw new BadGatewayException({
        code: ErrorCode.PROVIDER_UNAVAILABLE,
        message: 'Identity provider is unavailable',
      });
    }

    const created = await this.prisma.verificationRequest.create({
      data: {
        userId: user.id,
        provider: started.provider,
        providerRef: started.providerRef,
        status: started.status,
        startedAt: new Date(),
        metadata: { source: 'start', nextStep: started.nextStep },
      },
    });

    return { data: toStartDto(created, started.provider, started.nextStep) };
  }

  async getMe(user: AuthenticatedUser) {
    const latest = await this.latestForUser(user.id);
    if (!latest) {
      return { data: null };
    }
    return { data: toMeDto(latest) };
  }

  async mockComplete(
    user: AuthenticatedUser,
    dto: MockCompleteVerificationDto,
  ) {
    this.assertMockCompleteEnabled();

    const verification = await this.prisma.verificationRequest.findFirst({
      where: { id: dto.verificationId, userId: user.id },
    });
    if (!verification) {
      throw notFound();
    }
    if (
      verification.status === 'SUCCEEDED' ||
      verification.status === 'FAILED'
    ) {
      throw conflict('Verification cannot be updated');
    }

    const completed = await this.identityProvider.complete({
      providerRef: verification.providerRef ?? verification.id,
      result: dto.result,
    });

    const updated = await this.prisma.verificationRequest.update({
      where: { id: verification.id },
      data: {
        status: completed.status,
        maskedIdentity: sanitizeMaskedIdentity(completed.maskedIdentity),
        failureCode: completed.failureCode,
        completedAt: new Date(),
        metadata: { source: 'mock_complete' },
      },
    });

    return { data: toMeDto(updated) };
  }

  async handleWebhook(
    provider: string,
    signatureHeader: string | undefined,
    rawBody: Buffer | undefined,
    dto: VerificationWebhookDto,
  ) {
    const configured = this.configService.get<string>(
      'identity.provider',
      'mock',
    );
    const secret = this.configService.get<string>('identity.webhookSecret');
    if (!verifyIdentityWebhookSignature(rawBody, signatureHeader, secret)) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Unauthorized',
      });
    }
    if (provider !== configured) {
      throw notFound();
    }

    const verification = await this.prisma.verificationRequest.findFirst({
      where: { id: dto.verificationId, provider },
    });
    if (!verification) {
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
            payloadFingerprint: fingerprint,
            processedAt: new Date(),
          },
        });

        if (
          verification.status !== 'PENDING' &&
          verification.status !== 'IN_PROGRESS'
        ) {
          return;
        }

        await tx.verificationRequest.update({
          where: { id: verification.id },
          data: {
            status: dto.result,
            maskedIdentity:
              dto.result === 'SUCCEEDED'
                ? sanitizeMaskedIdentity(dto.maskedIdentity)
                : null,
            failureCode:
              dto.result === 'FAILED'
                ? (dto.failureCode ?? 'WEBHOOK_FAILED')
                : null,
            completedAt: new Date(),
            metadata: { source: 'webhook' },
          },
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

  assertMockCompleteEnabled(): void {
    if (process.env.NODE_ENV === 'production') {
      throw notFound();
    }
    const nodeEnv = this.configService.get<string>('nodeEnv', 'development');
    const provider = this.configService.get<string>(
      'identity.provider',
      'mock',
    );
    if (nodeEnv === 'production' || provider !== 'mock') {
      throw notFound();
    }
  }

  private latestForUser(userId: string) {
    return this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

function toStartDto(
  verification: {
    id: string;
    status: string;
    provider: string;
    metadata?: unknown;
  },
  provider: string,
  nextStep?: string,
) {
  const fromMetadata =
    verification.metadata &&
    typeof verification.metadata === 'object' &&
    verification.metadata !== null &&
    'nextStep' in verification.metadata &&
    typeof verification.metadata.nextStep === 'string'
      ? verification.metadata.nextStep
      : undefined;

  return {
    verificationId: verification.id,
    status: verification.status,
    provider,
    nextStep: nextStep ?? fromMetadata ?? 'mock_complete',
  };
}

function toMeDto(verification: {
  id: string;
  status: string;
  provider: string;
  maskedIdentity: string | null;
  failureCode: string | null;
}) {
  return {
    verificationId: verification.id,
    status: verification.status,
    provider: verification.provider,
    maskedIdentity: verification.maskedIdentity,
    failureCode: verification.failureCode,
  };
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
