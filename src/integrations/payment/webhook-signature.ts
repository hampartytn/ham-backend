import { createHmac, timingSafeEqual } from 'node:crypto';

export function paymentWebhookSignature(
  rawBody: Buffer,
  secret: string,
): string {
  const hex = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${hex}`;
}

export function verifyPaymentWebhookSignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || rawBody.length === 0 || !header || !secret) {
    return false;
  }
  const expected = paymentWebhookSignature(rawBody, secret);
  const provided = Buffer.from(header);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length) {
    return false;
  }
  return timingSafeEqual(provided, computed);
}
