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
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { extractBearer } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService, RequestMeta } from './auth.service';
import {
  LoginDto,
  LogoutDto,
  OtpRequestDto,
  OtpVerifyDto,
  PasswordResetDto,
  PasswordSetDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';
import { TokenService } from './token.service';

@SkipThrottle({ default: true })
@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('otp/request')
  requestOtp(@Body() dto: OtpRequestDto, @Req() request: Request) {
    return this.authService.requestOtp(dto, requestMeta(request));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('otp/verify')
  verifyOtp(@Body() dto: OtpVerifyDto, @Req() request: Request) {
    return this.authService.verifyOtp(dto, requestMeta(request));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, requestMeta(request));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() request: Request) {
    return this.authService.refresh(dto, requestMeta(request));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Body() dto: LogoutDto, @Req() request: Request) {
    return this.authService.logout(
      dto,
      this.optionalAccessUserId(request),
      requestMeta(request),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/set')
  setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PasswordSetDto,
  ) {
    return this.authService.setPassword(user, dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('password/reset')
  resetPassword(@Body() dto: PasswordResetDto, @Req() request: Request) {
    return this.authService.resetPassword(dto, requestMeta(request));
  }

  @Get('session')
  session(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.session(user);
  }

  private optionalAccessUserId(request: Request): string | undefined {
    const token = extractBearer(request);
    if (!token) {
      return undefined;
    }
    return this.tokenService.tryVerifyAccess(token)?.sub;
  }
}

function requestMeta(request: Request): RequestMeta {
  const forwarded = request.header('x-forwarded-for');
  const ip =
    (typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined) || request.ip;
  const userAgent = request.header('user-agent');
  return { ip, userAgent };
}
