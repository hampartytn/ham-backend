import {
  identityWebhookSignature,
  verifyIdentityWebhookSignature,
} from './webhook-signature';

describe('identity webhook signature', () => {
  const secret = 'test-identity-webhook-secret-min-32chars';
  const body = Buffer.from('{"eventId":"1"}', 'utf8');

  it('accepts a matching HMAC and rejects missing or wrong signatures', () => {
    const header = identityWebhookSignature(body, secret);
    expect(verifyIdentityWebhookSignature(body, header, secret)).toBe(true);
    expect(verifyIdentityWebhookSignature(body, undefined, secret)).toBe(false);
    expect(
      verifyIdentityWebhookSignature(body, 'sha256=deadbeef', secret),
    ).toBe(false);
    expect(verifyIdentityWebhookSignature(undefined, header, secret)).toBe(
      false,
    );
  });
});
