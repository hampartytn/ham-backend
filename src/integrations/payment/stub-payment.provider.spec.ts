import { StubPaymentProvider } from './stub-payment.provider';
import { paymentWebhookSignature } from './webhook-signature';

describe('StubPaymentProvider', () => {
  const provider = new StubPaymentProvider();
  const secret = 'test-payment-webhook-secret-min-32chars!!';

  it('returns checkout fields only and never card data', async () => {
    const result = await provider.createOrder({
      paymentId: '0199aaaa-bbbb-7000-8000-000000000001',
      amountPaise: 1,
      currency: 'INR',
      purpose: 'EMPLOYER_ACTIVATION',
    });

    expect(result.provider).toBe('stub');
    expect(result.providerPayload).toEqual({
      provider: 'stub',
      orderId: result.providerOrderId,
      amountPaise: 1,
      currency: 'INR',
      checkoutMode: 'stub',
    });
    expect(JSON.stringify(result)).not.toMatch(/card|pan|cvv|upi/i);
  });

  it('verifies stub webhook signatures', () => {
    const body = Buffer.from('{"eventId":"p10-1"}', 'utf8');
    const header = paymentWebhookSignature(body, secret);
    expect(provider.verifyWebhook(body, header, secret)).toBe(true);
    expect(provider.verifyWebhook(body, 'sha256=nope', secret)).toBe(false);
  });
});
