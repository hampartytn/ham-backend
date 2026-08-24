import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { IdentityVerificationProvider } from '../../integrations/identity-verification/identity-verification.provider';
import { VerificationService } from './verification.service';

describe('VerificationService', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('hides mock complete when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    const service = new VerificationService(
      {} as PrismaService,
      {
        get: (key: string) => (key === 'nodeEnv' ? 'development' : 'mock'),
      } as unknown as ConfigService,
      {} as IdentityVerificationProvider,
    );

    expect(() => service.assertMockCompleteEnabled()).toThrow(
      NotFoundException,
    );
  });
});
