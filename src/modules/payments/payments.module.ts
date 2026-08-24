import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER } from '../../integrations/payment/payment.provider';
import { StubPaymentProvider } from '../../integrations/payment/stub-payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StubPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: StubPaymentProvider,
    },
  ],
})
export class PaymentsModule {}
