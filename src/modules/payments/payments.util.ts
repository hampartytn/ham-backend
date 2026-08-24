export const PAYMENT_PURPOSE_EMPLOYER_ACTIVATION = 'EMPLOYER_ACTIVATION';
export const PAYMENT_CURRENCY_INR = 'INR';

export const TERMINAL_PAYMENT_STATUSES = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;

export type WebhookPaymentStatus = 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export function isTerminalPaymentStatus(
  status: string,
): status is (typeof TERMINAL_PAYMENT_STATUSES)[number] {
  return (TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(status);
}

export function applyWebhookStatus(
  current: string,
  incoming: WebhookPaymentStatus,
): WebhookPaymentStatus | null {
  if (isTerminalPaymentStatus(current)) {
    return null;
  }
  if (current === 'CREATED' || current === 'PENDING') {
    return incoming;
  }
  return null;
}
