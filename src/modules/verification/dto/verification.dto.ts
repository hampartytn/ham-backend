import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StartVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  returnUrl?: string;
}

export class MockCompleteVerificationDto {
  @IsUUID('7')
  verificationId!: string;

  @IsIn(['SUCCEEDED', 'FAILED'])
  result!: 'SUCCEEDED' | 'FAILED';
}

export class VerificationWebhookDto {
  @IsString()
  @MaxLength(128)
  eventId!: string;

  @IsUUID('7')
  verificationId!: string;

  @IsIn(['SUCCEEDED', 'FAILED'])
  result!: 'SUCCEEDED' | 'FAILED';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  maskedIdentity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  failureCode?: string;
}
