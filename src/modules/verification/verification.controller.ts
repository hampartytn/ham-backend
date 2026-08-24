import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { shouldDocumentMockComplete } from '../../open-api/swagger.policy';
import {
  MockCompleteVerificationDto,
  StartVerificationDto,
  VerificationWebhookDto,
} from './dto/verification.dto';
import { VerificationService } from './verification.service';

@Controller('verification')
@ApiTags('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('start')
  @Roles('EMPLOYEE')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartVerificationDto,
  ) {
    return this.verificationService.start(user, dto);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.verificationService.getMe(user);
  }

  @Public()
  @SkipThrottle()
  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Param('provider') provider: string,
    @Headers('x-identity-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Body() dto: VerificationWebhookDto,
  ) {
    return this.verificationService.handleWebhook(
      provider,
      signature,
      request.rawBody,
      dto,
    );
  }

  @Post('mock/complete')
  @ApiExcludeEndpoint(
    !shouldDocumentMockComplete(process.env.NODE_ENV ?? 'development'),
  )
  @Roles('EMPLOYEE')
  @HttpCode(HttpStatus.OK)
  mockComplete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MockCompleteVerificationDto,
  ) {
    return this.verificationService.mockComplete(user, dto);
  }
}
