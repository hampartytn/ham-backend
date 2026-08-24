import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms-provider';

/**
 * Dev/mock SMS: never returns OTP over HTTP.
 * Non-production writes a clear Nest log banner AND appends to `logs/mock-otp.log`
 * so the code is easy to find when Nest HTTP logs are noisy.
 *
 * Note: do not log under a structured field named `otp` — LOG_REDACT redacts it.
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);
  private readonly lastCodes = new Map<string, string>();

  sendOtp(phone: string, code: string, purpose: string): Promise<void> {
    this.lastCodes.set(`${phone}:${purpose}`, code);

    if (process.env.NODE_ENV === 'production') {
      this.logger.log({ phone, purpose }, 'otp.dispatch');
      return Promise.resolve();
    }

    this.logger.warn(
      `\n======== MOCK OTP (not sent via SMS) ========\n` +
        `  phone:   ${phone}\n` +
        `  purpose: ${purpose}\n` +
        `  code:    ${code}\n` +
        `  file:    logs/mock-otp.log\n` +
        `============================================`,
    );

    this.appendMockOtpFile(phone, purpose, code);

    return Promise.resolve();
  }

  private appendMockOtpFile(
    phone: string,
    purpose: string,
    code: string,
  ): void {
    try {
      const dir = join(process.cwd(), 'logs');
      mkdirSync(dir, { recursive: true });
      const line = `${new Date().toISOString()}  ${purpose.padEnd(16)}  ${phone}  =>  ${code}\n`;
      appendFileSync(join(dir, 'mock-otp.log'), line, 'utf8');
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : 'unknown' },
        'mock_otp_file_write_failed',
      );
    }
  }

  peek(phone: string, purpose: string): string | undefined {
    return this.lastCodes.get(`${phone}:${purpose}`);
  }
}
