export const IDENTITY_VERIFICATION_PROVIDER = Symbol(
  'IDENTITY_VERIFICATION_PROVIDER',
);

export type StartVerificationInput = {
  userId: string;
  returnUrl?: string;
};

export type StartVerificationResult = {
  provider: string;
  providerRef: string;
  status: 'PENDING' | 'IN_PROGRESS';
  nextStep: string;
};

export type CompleteVerificationInput = {
  providerRef: string;
  result: 'SUCCEEDED' | 'FAILED';
};

export type CompleteVerificationResult = {
  status: 'SUCCEEDED' | 'FAILED';
  maskedIdentity: string | null;
  failureCode: string | null;
};

export type IdentityVerificationProvider = {
  readonly name: string;
  start(input: StartVerificationInput): Promise<StartVerificationResult>;
  complete(
    input: CompleteVerificationInput,
  ): Promise<CompleteVerificationResult>;
};
