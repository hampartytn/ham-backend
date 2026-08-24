import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JoinMembershipDto, MembershipTermsDto } from './dto/membership.dto';
import { MembershipService } from './membership.service';

@Controller('membership')
@Roles('EMPLOYEE')
@ApiTags('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get()
  getMembership(@CurrentUser() user: AuthenticatedUser) {
    return this.membershipService.getMembership(user);
  }

  @Get('info')
  getInfo(@CurrentUser() user: AuthenticatedUser) {
    return this.membershipService.getInfo(user);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: JoinMembershipDto,
    @Req() request: Request,
  ) {
    return this.membershipService.join(user, dto, consentContext(request));
  }

  @Post('decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MembershipTermsDto,
    @Req() request: Request,
  ) {
    return this.membershipService.decline(user, dto, consentContext(request));
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MembershipTermsDto,
  ) {
    void user;
    void dto;
    return this.membershipService.withdraw();
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
