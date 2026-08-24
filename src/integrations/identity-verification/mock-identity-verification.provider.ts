import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CompleteVerificationInput,
  CompleteVerificationResult,
  IdentityVerificationProvider,
  StartVerificationInput,
  StartVerificationResult,
} from './identity-verification.provider';
import { MOCK_MASKED_IDENTITY } from './mask-identity';

export const MOCK_COMPLETE_NEXT_STEP = 'mock_complete';

@Injectable()
export class MockIdentityVerificationProvider implements IdentityVerificationProvider {
  readonly name = 'mock';

  start(input: StartVerificationInput): Promise<StartVerificationResult> {
    void input;
    return Promise.resolve({
      provider: this.name,
      providerRef: randomUUID(),
      status: 'PENDING',
      nextStep: MOCK_COMPLETE_NEXT_STEP,
    });
  }

  complete(
    input: CompleteVerificationInput,
  ): Promise<CompleteVerificationResult> {
    if (input.result === 'FAILED') {
      return Promise.resolve({
        status: 'FAILED',
        maskedIdentity: null,
        failureCode: 'MOCK_FAILED',
      });
    }

    return Promise.resolve({
      status: 'SUCCEEDED',
      maskedIdentity: MOCK_MASKED_IDENTITY,
      failureCode: null,
    });
  }
}
