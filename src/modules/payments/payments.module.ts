import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER } from '../../integrations/payment/payment.provider';
import { RazorpayPaymentProvider } from '../../integrations/payment/razorpay-payment.provider';
import { RAZORPAY_PAYMENT_PROVIDER } from '../../integrations/payment/razorpay.tokens';
import { StubPaymentProvider } from '../../integrations/payment/stub-payment.provider';
import { EmployersModule } from '../employers/employers.module';
import { MembershipModule } from '../membership/membership.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [MembershipModule, EmployersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StubPaymentProvider,
    RazorpayPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: StubPaymentProvider,
    },
    {
      provide: RAZORPAY_PAYMENT_PROVIDER,
      useExisting: RazorpayPaymentProvider,
    },
  ],
})
export class PaymentsModule {}
