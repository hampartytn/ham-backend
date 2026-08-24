import pino from 'pino';
import { buildPinoRedactPaths, redactSensitive } from './redact';

describe('redactSensitive', () => {
  it('strips forbidden keys before they can be stored', () => {
    const redacted = redactSensitive({
      action: 'user.block',
      password: 'x',
      authorization: 'Bearer y',
      nested: { accessToken: 'tok', note: 'ok' },
    }) as Record<string, unknown>;

    expect(redacted.action).toBe('user.block');
    expect(redacted.password).toBe('[Redacted]');
    expect(redacted.authorization).toBe('[Redacted]');
    expect((redacted.nested as Record<string, unknown>).accessToken).toBe(
      '[Redacted]',
    );
    expect((redacted.nested as Record<string, unknown>).note).toBe('ok');

    const withAadhaar = redactSensitive({
      aadhaar: '123412341234',
      note: 'ok',
    }) as Record<string, unknown>;
    expect(withAadhaar.aadhaar).toBe('[Redacted]');
    expect(JSON.stringify(withAadhaar)).not.toMatch(/123412341234/);
  });
});

describe('pino redaction', () => {
  it('does not write password or authorization secrets to the log line', () => {
    const lines: string[] = [];
    const logger = pino(
      {
        redact: {
          paths: buildPinoRedactPaths(),
          censor: '[Redacted]',
        },
      },
      {
        write(chunk: string) {
          lines.push(chunk);
        },
      },
    );

    logger.info({
      password: 'x',
      authorization: 'Bearer y',
      aadhaar: '123412341234',
      path: '/login',
    });
    const output = lines.join('');

    expect(output).toContain('[Redacted]');
    expect(output).not.toContain('"x"');
    expect(output).not.toContain('Bearer y');
    expect(output).not.toMatch(/123412341234/);
    expect(output).toContain('/login');
  });
});
