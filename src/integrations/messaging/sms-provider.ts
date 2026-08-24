export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export type SmsProvider = {
  sendOtp(phone: string, code: string, purpose: string): Promise<void>;
};
