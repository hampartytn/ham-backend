import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import type {
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  PaymentProvider,
} from './payment.provider';
import {
  RAZORPAY_PROVIDER_NAME,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from './razorpay-signature';

@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = RAZORPAY_PROVIDER_NAME;

  constructor(private readonly configService: ConfigService) {}

  async createOrder(
    input: CreatePaymentOrderInput,
  ): Promise<CreatePaymentOrderResult> {
    const keyId = this.keyId();
    const keySecret = this.keySecret();
    if (!keyId || !keySecret) {
      throw new Error('Razorpay keys are not configured');
    }

    const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await client.orders.create({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.paymentId.replace(/-/g, '').slice(0, 40),
      notes: {
        paymentId: input.paymentId,
        purpose: input.purpose,
      },
    });

    const orderId = String(order.id);
    return {
      provider: this.name,
      providerOrderId: orderId,
      providerPayload: {
        keyId,
        orderId,
        amountPaise: input.amountPaise,
        currency: input.currency,
        checkoutMode: this.name,
      },
    };
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

  isConfigured(): boolean {
    return this.keyId().length > 0 && this.keySecret().length > 0;
  }

  webhookSecret(): string {
    return this.configService.get<string>('payment.razorpay.webhookSecret', '');
  }

  keySecret(): string {
    return this.configService.get<string>('payment.razorpay.keySecret', '');
  }

  keyId(): string {
    return this.configService.get<string>('payment.razorpay.keyId', '');
  }
}
