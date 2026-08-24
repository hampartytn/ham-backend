import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  PaymentProvider,
} from './payment.provider';
import { STUB_PAYMENT_PROVIDER_NAME } from './payment.provider';
import { verifyPaymentWebhookSignature } from './webhook-signature';

@Injectable()
export class StubPaymentProvider implements PaymentProvider {
  readonly name = STUB_PAYMENT_PROVIDER_NAME;

  createOrder(
    input: CreatePaymentOrderInput,
  ): Promise<CreatePaymentOrderResult> {
    const providerOrderId = `stub_${input.paymentId}`;
    return Promise.resolve({
      provider: this.name,
      providerOrderId,
      providerPayload: {
        provider: this.name,
        orderId: providerOrderId,
        amountPaise: input.amountPaise,
        currency: input.currency,
        checkoutMode: 'stub',
      },
    });
  }

  verifyWebhook(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    secret: string | undefined,
  ): boolean {
    return verifyPaymentWebhookSignature(rawBody, signatureHeader, secret);
  }
}
