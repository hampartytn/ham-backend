import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AdminService } from './admin.service';
import {
  AdminAuditLogsQueryDto,
  AdminCreateAdminDto,
  AdminCreateLegalProviderDto,
  AdminJobsQueryDto,
  AdminLegalProvidersQueryDto,
  AdminPatchLegalProviderDto,
  AdminPatchPermissionsDto,
  AdminUsersQueryDto,
  AdminUserStatusDto,
} from './dto/admin.dto';

@Controller('admin')
@Roles('ADMIN')
@ApiTags('admin')
@ApiBearerAuth('bearer')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('session')
  session(@CurrentUser() user: AuthenticatedUser) {
    return {
      data: {
        ok: true,
        role: user.role,
      },
    };
  }

  @Get('permissions/check')
  @RequirePermissions(Permission.USERS_READ)
  permissionCheck(@CurrentUser() user: AuthenticatedUser) {
    return {
      data: {
        ok: true,
        userId: user.id,
      },
    };
  }

  @Get('users')
  @RequirePermissions(Permission.USERS_READ)
  listUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:userId')
  @RequirePermissions(Permission.USERS_READ)
  getUser(
    @Param('userId', new ParseUUIDPipe({ version: '7' })) userId: string,
  ) {
    return this.adminService.getUser(userId);
  }

  @Post('users/:userId/status')
  @RequirePermissions(Permission.USERS_BLOCK)
  @HttpCode(HttpStatus.OK)
  updateUserStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '7' })) userId: string,
    @Body() dto: AdminUserStatusDto,
    @Req() request: Request,
  ) {
    return this.adminService.updateUserStatus(
      user,
      userId,
      dto,
      actorContext(request),
    );
  }

  @Get('jobs')
  @RequirePermissions(Permission.JOBS_MODERATE)
  listJobs(@Query() query: AdminJobsQueryDto) {
    return this.adminService.listJobs(query);
  }

  @Post('jobs/:jobId/unpublish')
  @RequirePermissions(Permission.JOBS_MODERATE)
  @HttpCode(HttpStatus.OK)
  unpublishJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
    @Req() request: Request,
  ) {
    return this.adminService.unpublishJob(user, jobId, actorContext(request));
  }

  @Post('jobs/:jobId/close')
  @RequirePermissions(Permission.JOBS_MODERATE)
  @HttpCode(HttpStatus.OK)
  closeJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
    @Req() request: Request,
  ) {
    return this.adminService.closeJob(user, jobId, actorContext(request));
  }

  @Get('legal-support/providers')
  @RequirePermissions(Permission.LEGAL_MANAGE)
  listLegalProviders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AdminLegalProvidersQueryDto,
  ) {
    return this.adminService.listLegalProviders(user, query);
  }

  @Post('legal-support/providers')
  @RequirePermissions(Permission.LEGAL_MANAGE)
  createLegalProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdminCreateLegalProviderDto,
    @Req() request: Request,
  ) {
    return this.adminService.createLegalProvider(
      user,
      dto,
      actorContext(request),
    );
  }

  @Patch('legal-support/providers/:providerId')
  @RequirePermissions(Permission.LEGAL_MANAGE)
  updateLegalProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', new ParseUUIDPipe({ version: '7' }))
    providerId: string,
    @Body() dto: AdminPatchLegalProviderDto,
    @Req() request: Request,
  ) {
    return this.adminService.updateLegalProvider(
      user,
      providerId,
      dto,
      actorContext(request),
    );
  }

  @Post('legal-support/providers/:providerId/approve')
  @RequirePermissions(Permission.LEGAL_MANAGE)
  @HttpCode(HttpStatus.OK)
  approveLegalProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', new ParseUUIDPipe({ version: '7' }))
    providerId: string,
    @Req() request: Request,
  ) {
    return this.adminService.approveLegalProvider(
      user,
      providerId,
      actorContext(request),
    );
  }

  @Get('metrics')
  @RequirePermissions(Permission.METRICS_READ)
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('audit-logs')
  @RequirePermissions(Permission.AUDIT_READ)
  listAuditLogs(@Query() query: AdminAuditLogsQueryDto) {
    return this.adminService.listAuditLogs(query);
  }

  @Post('admins')
  @RequirePermissions(Permission.ADMINS_MANAGE)
  createAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdminCreateAdminDto,
    @Req() request: Request,
  ) {
    return this.adminService.createAdmin(user, dto, actorContext(request));
  }

  @Patch('admins/:userId/permissions')
  @RequirePermissions(Permission.ADMINS_MANAGE)
  patchAdminPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '7' })) userId: string,
    @Body() dto: AdminPatchPermissionsDto,
    @Req() request: Request,
  ) {
    return this.adminService.patchAdminPermissions(
      user,
      userId,
      dto,
      actorContext(request),
    );
  }
}

function actorContext(request: Request): { ip?: string } {
  const ip = request.ip ?? request.socket.remoteAddress ?? undefined;
  return { ip: ip ? ip.slice(0, 45) : undefined };
}
