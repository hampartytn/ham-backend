import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { AuditActorType } from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { redactSensitive } from '../../common/utils/redact';

export type AuditAppendInput = {
  actorType: AuditActorType;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
};

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async append(input: AuditAppendInput): Promise<void> {
    const extraKeys = this.configService
      .get<string>('logging.redact', '')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);

    const metadata = input.metadata
      ? (redactSensitive(input.metadata, extraKeys) as Prisma.InputJsonValue)
      : undefined;

    await this.prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata,
        ip: input.ip,
      },
    });
  }
}
