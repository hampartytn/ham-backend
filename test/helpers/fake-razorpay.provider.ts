import type {
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
} from '../../src/integrations/payment/payment.provider';
import { RAZORPAY_PROVIDER_NAME } from '../../src/integrations/payment/razorpay-signature';
import {
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from '../../src/integrations/payment/razorpay-signature';

export class FakeRazorpayPaymentProvider {
  readonly name = RAZORPAY_PROVIDER_NAME;

  isConfigured(): boolean {
    return true;
  }

  keyId(): string {
    return process.env.RAZORPAY_KEY_ID ?? 'rzp_test_ham_e2e_placeholder';
  }

  keySecret(): string {
    return (
      process.env.RAZORPAY_KEY_SECRET ||
      'test-razorpay-key-secret-min-32chars!!'
    );
  }

  webhookSecret(): string {
    return (
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      'test-razorpay-webhook-secret-min-32chars'
    );
  }

  checkoutPayload(
    orderId: string,
    amountPaise: number,
    currency: string,
  ): Record<string, string | number> {
    return {
      keyId: this.keyId(),
      orderId,
      amountPaise,
      currency,
      checkoutMode: this.name,
    };
  }

  createOrder(
    input: CreatePaymentOrderInput,
  ): Promise<CreatePaymentOrderResult> {
    const orderId = `order_test_${input.paymentId.replace(/-/g, '').slice(0, 12)}`;
    return Promise.resolve({
      provider: this.name,
      providerOrderId: orderId,
      providerPayload: this.checkoutPayload(
        orderId,
        input.amountPaise,
        input.currency,
      ),
    });
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    secret: string | undefined,
  ): boolean {
    return verifyRazorpayWebhookSignature(rawBody, signatureHeader, secret);
  }

  verifyCheckoutSignature(
    orderId: string,
    paymentId: string,
    signature: string | undefined,
    keySecret: string | undefined,
  ): boolean {
    return verifyRazorpayCheckoutSignature(
      orderId,
      paymentId,
      signature,
      keySecret,
    );
  }
}
