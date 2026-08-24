import { Logger } from '@nestjs/common';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { MockSmsProvider } from './mock-sms.provider';

describe('MockSmsProvider', () => {
  const originalEnv = process.env.NODE_ENV;
  const otpLogPath = join(process.cwd(), 'logs', 'mock-otp.log');

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
    if (existsSync(otpLogPath)) {
      rmSync(otpLogPath, { force: true });
    }
  });

  it('does not log the OTP when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const provider = new MockSmsProvider();

    await provider.sendOtp('+919900000001', '654321', 'LOGIN');

    expect(provider.peek('+919900000001', 'LOGIN')).toBe('654321');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/654321/);
    expect(warn).not.toHaveBeenCalled();
    expect(existsSync(otpLogPath)).toBe(false);
  });

  it('prints a clear mock OTP banner and writes logs/mock-otp.log outside production', async () => {
    process.env.NODE_ENV = 'development';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const provider = new MockSmsProvider();

    await provider.sendOtp('+919900000001', '654321', 'REGISTER');

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('MOCK OTP');
    expect(String(warn.mock.calls[0]?.[0])).toContain('654321');
    expect(existsSync(otpLogPath)).toBe(true);
    expect(readFileSync(otpLogPath, 'utf8')).toContain('654321');
    expect(readFileSync(otpLogPath, 'utf8')).toContain('REGISTER');
  });
});
