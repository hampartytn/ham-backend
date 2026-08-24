import { OtpService } from './otp.service';
import { ErrorCode } from '../../common/constants/error-codes';
import { hashOpaque } from './token.service';

describe('OtpService', () => {
  it('locks a challenge after max attempts and keeps a generic error', async () => {
    const challenge = {
      id: 'otp-1',
      phone: '+919900000002',
      purpose: 'LOGIN',
      codeHash: hashOpaque('111111'),
      attempts: 4,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    };

    const prisma = {
      otpChallenge: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(challenge),
        update: jest.fn(
          (args: {
            data: { attempts?: { increment: number }; consumedAt?: Date };
          }) => {
            if (args.data.attempts?.increment) {
              return Promise.resolve({ ...challenge, attempts: 5 });
            }
            return Promise.resolve({ ...challenge, ...args.data, attempts: 5 });
          },
        ),
      },
    };
    const tokenService = {
      generateOtpCode: jest.fn(),
      generateResetToken: jest.fn(),
    };
    const sms = { sendOtp: jest.fn() };
    const service = new OtpService(prisma as never, tokenService as never, sms);

    await expect(
      service.verify('+919900000002', 'LOGIN', '000000'),
    ).rejects.toMatchObject({
      response: {
        code: ErrorCode.INVALID_OR_EXPIRED_CODE,
      },
    });
    expect(prisma.otpChallenge.update).toHaveBeenCalledWith({
      where: { id: 'otp-1' },
      data: { consumedAt: expect.any(Date) as Date },
    });
  });
});
