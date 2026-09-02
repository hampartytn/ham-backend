import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { RAZORPAY_PROVIDER_NAME } from '../../integrations/payment/razorpay-signature';
import {
  ConfirmPaymentDto,
  InitiatePaymentDto,
  PaymentWebhookDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@ApiTags('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @Roles('EMPLOYER', 'EMPLOYEE')
  initiate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiate(user, dto);
  }

  @Post('confirm')
  @Roles('EMPLOYEE', 'EMPLOYER')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPaymentDto,
    @Req() request: Request,
  ) {
    return this.paymentsService.confirm(user, dto, consentContext(request));
  }

  @Public()
  @SkipThrottle()
  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Param('provider') provider: string,
    @Headers('x-payment-signature') stubSignature: string | undefined,
    @Headers('x-razorpay-signature') razorpaySignature: string | undefined,
    @Headers('x-razorpay-event-id') razorpayEventId: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
  ) {
    if (provider === RAZORPAY_PROVIDER_NAME) {
      return this.paymentsService.handleRazorpayWebhook(
        razorpaySignature,
        razorpayEventId,
        request.rawBody,
      );
    }
    return this.paymentsService.handleWebhook(
      provider,
      stubSignature,
      request.rawBody,
      body as PaymentWebhookDto,
    );
  }

  @Get(':paymentId')
  @Roles('EMPLOYER', 'EMPLOYEE')
  getPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', new ParseUUIDPipe({ version: '7' }))
    paymentId: string,
  ) {
    return this.paymentsService.getPayment(user, paymentId);
  }
}

function consentContext(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  return {
    ip: request.ip ?? request.socket.remoteAddress ?? null,
    userAgent: request.header('user-agent') ?? null,
  };
}
