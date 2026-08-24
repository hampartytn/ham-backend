import { Module } from '@nestjs/common';
import { IDENTITY_VERIFICATION_PROVIDER } from '../../integrations/identity-verification/identity-verification.provider';
import { MockIdentityVerificationProvider } from '../../integrations/identity-verification/mock-identity-verification.provider';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  controllers: [VerificationController],
  providers: [
    VerificationService,
    MockIdentityVerificationProvider,
    {
      provide: IDENTITY_VERIFICATION_PROVIDER,
      useExisting: MockIdentityVerificationProvider,
    },
  ],
  exports: [VerificationService],
})
export class VerificationModule {}
