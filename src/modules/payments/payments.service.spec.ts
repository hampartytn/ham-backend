import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { StubPaymentProvider } from '../../integrations/payment/stub-payment.provider';
import { RazorpayPaymentProvider } from '../../integrations/payment/razorpay-payment.provider';
import { AuditService } from '../audit/audit.service';
import { EmployerMembershipService } from '../employers/employer-membership.service';
import { MembershipService } from '../membership/membership.service';
import { PaymentsService } from './payments.service';

const employer = {
  id: 'user-1',
  role: 'EMPLOYER' as const,
  accountStatus: 'ACTIVE' as const,
  phone: '+913330000001',
  preferredLanguage: 'ta',
};

describe('PaymentsService', () => {
  it('returns NOT_ENABLED when the stub is disabled', async () => {
    const service = new PaymentsService(
      {} as PrismaService,
      {
        get: (key: string) => {
          if (key === 'payment.provider') {
            return 'stub';
          }
          if (key === 'payment.stubEnabled') {
            return false;
          }
          return undefined;
        },
      } as unknown as ConfigService,
      new StubPaymentProvider(),
      { isConfigured: () => false } as RazorpayPaymentProvider,
      {} as MembershipService,
      {} as EmployerMembershipService,
      { append: jest.fn() } as unknown as AuditService,
    );

    try {
      await service.initiate(employer, { purpose: 'EMPLOYER_ACTIVATION' });
      fail('expected initiate to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: ErrorCode.NOT_ENABLED,
      });
    }
  });
});
