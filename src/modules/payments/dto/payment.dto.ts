import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PAYMENT_PURPOSE_EMPLOYER_ACTIVATION,
  PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
  PAYMENT_PURPOSE_MEMBERSHIP,
} from '../payments.util';

export class InitiatePaymentDto {
  @IsIn([
    PAYMENT_PURPOSE_EMPLOYER_ACTIVATION,
    PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
    PAYMENT_PURPOSE_MEMBERSHIP,
  ])
  purpose!:
    | typeof PAYMENT_PURPOSE_EMPLOYER_ACTIVATION
    | typeof PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP
    | typeof PAYMENT_PURPOSE_MEMBERSHIP;

  @ValidateIf(
    (dto: InitiatePaymentDto) =>
      dto.purpose === PAYMENT_PURPOSE_MEMBERSHIP ||
      dto.purpose === PAYMENT_PURPOSE_EMPLOYER_MEMBERSHIP,
  )
  @IsUUID('7')
  planId?: string;

  @ValidateIf((dto: InitiatePaymentDto) => dto.purpose === PAYMENT_PURPOSE_MEMBERSHIP)
  @IsString()
  @MaxLength(64)
  termsVersion?: string;

  @ValidateIf((dto: InitiatePaymentDto) => dto.purpose === PAYMENT_PURPOSE_MEMBERSHIP)
  @IsBoolean()
  @Equals(true, { message: 'accepted must be true' })
  accepted?: true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountPaise?: number;
}

export class ConfirmPaymentDto {
  @IsString()
  @MaxLength(128)
  razorpay_order_id!: string;

  @IsString()
  @MaxLength(128)
  razorpay_payment_id!: string;

  @IsString()
  @MaxLength(256)
  razorpay_signature!: string;
}

export class PaymentWebhookDto {
  @IsString()
  @MaxLength(128)
  eventId!: string;

  @IsString()
  @MaxLength(128)
  providerOrderId!: string;

  @IsIn(['SUCCEEDED', 'FAILED', 'CANCELLED'])
  status!: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
}
