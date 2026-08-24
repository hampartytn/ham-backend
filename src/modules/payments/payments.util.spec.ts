import { applyWebhookStatus, isTerminalPaymentStatus } from './payments.util';

describe('payment state machine', () => {
  it('applies webhook status from CREATED or PENDING and ignores terminals', () => {
    expect(applyWebhookStatus('CREATED', 'SUCCEEDED')).toBe('SUCCEEDED');
    expect(applyWebhookStatus('PENDING', 'FAILED')).toBe('FAILED');
    expect(applyWebhookStatus('PENDING', 'CANCELLED')).toBe('CANCELLED');
    expect(applyWebhookStatus('SUCCEEDED', 'FAILED')).toBeNull();
    expect(applyWebhookStatus('FAILED', 'SUCCEEDED')).toBeNull();
    expect(applyWebhookStatus('CANCELLED', 'SUCCEEDED')).toBeNull();
  });

  it('treats SUCCEEDED FAILED CANCELLED as terminal', () => {
    expect(isTerminalPaymentStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalPaymentStatus('PENDING')).toBe(false);
  });
});
