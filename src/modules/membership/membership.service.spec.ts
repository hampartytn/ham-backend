import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { MembershipService } from './membership.service';

describe('MembershipService', () => {
  it('returns NOT_ENABLED for withdraw while M9 is unanswered', () => {
    const service = new MembershipService(
      {} as PrismaService,
      { get: () => 'ham-membership-2026-08' } as unknown as ConfigService,
    );

    try {
      service.withdraw();
      fail('expected withdraw to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ErrorCode.NOT_ENABLED,
      });
    }
  });
});
