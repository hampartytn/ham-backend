import { MockIdentityVerificationProvider } from './mock-identity-verification.provider';
import { MOCK_MASKED_IDENTITY } from './mask-identity';

describe('MockIdentityVerificationProvider', () => {
  it('never returns a full 12-digit identity number', async () => {
    const provider = new MockIdentityVerificationProvider();
    const started = await provider.start({ userId: 'user-1' });
    expect(started.provider).toBe('mock');
    expect(started.status).toBe('PENDING');

    const succeeded = await provider.complete({
      providerRef: started.providerRef,
      result: 'SUCCEEDED',
    });
    expect(succeeded.maskedIdentity).toBe(MOCK_MASKED_IDENTITY);
    expect(JSON.stringify(succeeded)).not.toMatch(/\d{12}/);

    const failed = await provider.complete({
      providerRef: started.providerRef,
      result: 'FAILED',
    });
    expect(failed.maskedIdentity).toBeNull();
    expect(failed.failureCode).toBe('MOCK_FAILED');
  });
});
