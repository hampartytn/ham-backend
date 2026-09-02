import {
  razorpayCheckoutSignature,
  razorpayWebhookSignature,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from './razorpay-signature';

describe('razorpay signatures', () => {
  const keySecret = 'test-razorpay-key-secret-min-32chars!!';
  const webhookSecret = 'test-razorpay-webhook-secret-min-32chars';

  it('accepts matching checkout HMAC and rejects mismatches', () => {
    const signature = razorpayCheckoutSignature('order_1', 'pay_1', keySecret);
    expect(
      verifyRazorpayCheckoutSignature('order_1', 'pay_1', signature, keySecret),
    ).toBe(true);
    expect(
      verifyRazorpayCheckoutSignature('order_1', 'pay_2', signature, keySecret),
    ).toBe(false);
    expect(
      verifyRazorpayCheckoutSignature('order_1', 'pay_1', undefined, keySecret),
    ).toBe(false);
  });

  it('accepts matching webhook HMAC without a sha256= prefix', () => {
    const body = Buffer.from('{"event":"payment.captured"}', 'utf8');
    const header = razorpayWebhookSignature(body, webhookSecret);
    expect(header.startsWith('sha256=')).toBe(false);
    expect(verifyRazorpayWebhookSignature(body, header, webhookSecret)).toBe(
      true,
    );
    expect(
      verifyRazorpayWebhookSignature(body, `sha256=${header}`, webhookSecret),
    ).toBe(false);
    expect(verifyRazorpayWebhookSignature(body, undefined, webhookSecret)).toBe(
      false,
    );
  });
});
