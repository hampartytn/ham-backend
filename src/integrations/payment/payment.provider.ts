export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export const STUB_PAYMENT_PROVIDER_NAME = 'stub';

export type CreatePaymentOrderInput = {
  paymentId: string;
  amountPaise: number;
  currency: string;
  purpose: string;
};

export type CreatePaymentOrderResult = {
  provider: string;
  providerOrderId: string;
  providerPayload: Record<string, string | number>;
};

export type PaymentProvider = {
  readonly name: string;
  createOrder(
    input: CreatePaymentOrderInput,
  ): Promise<CreatePaymentOrderResult>;
  verifyWebhook(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    secret: string | undefined,
  ): boolean;
};
