import { createHmac, timingSafeEqual } from 'node:crypto';

export const RAZORPAY_PROVIDER_NAME = 'razorpay';

export function razorpayCheckoutSignature(
  orderId: string,
  paymentId: string,
  keySecret: string,
): string {
  return createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

export function verifyRazorpayCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string | undefined,
  keySecret: string | undefined,
): boolean {
  if (!orderId || !paymentId || !signature || !keySecret) {
    return false;
  }
  const expected = razorpayCheckoutSignature(orderId, paymentId, keySecret);
  return timingSafeEqualHex(signature, expected);
}

export function razorpayWebhookSignature(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || rawBody.length === 0 || !header || !secret) {
    return false;
  }
  const expected = razorpayWebhookSignature(rawBody, secret);
  return timingSafeEqualHex(header, expected);
}

function timingSafeEqualHex(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
