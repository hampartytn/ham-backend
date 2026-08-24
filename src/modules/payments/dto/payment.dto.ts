import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PAYMENT_PURPOSE_EMPLOYER_ACTIVATION } from '../payments.util';

export class InitiatePaymentDto {
  @IsIn([PAYMENT_PURPOSE_EMPLOYER_ACTIVATION])
  purpose!: typeof PAYMENT_PURPOSE_EMPLOYER_ACTIVATION;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountPaise?: number;
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
