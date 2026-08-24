import {
  paymentWebhookSignature,
  verifyPaymentWebhookSignature,
} from './webhook-signature';

describe('payment webhook signature', () => {
  const secret = 'test-payment-webhook-secret-min-32chars!!';
  const body = Buffer.from('{"eventId":"1"}', 'utf8');

  it('accepts a matching HMAC and rejects missing or wrong signatures', () => {
    const header = paymentWebhookSignature(body, secret);
    expect(verifyPaymentWebhookSignature(body, header, secret)).toBe(true);
    expect(verifyPaymentWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyPaymentWebhookSignature(body, 'sha256=deadbeef', secret)).toBe(
      false,
    );
    expect(verifyPaymentWebhookSignature(undefined, header, secret)).toBe(
      false,
    );
  });
});
