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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApplicationsService } from '../applications/applications.service';
import {
  EmployerApplicationsQueryDto,
  PatchApplicationStatusDto,
} from '../applications/dto/application.dto';
import { CreateJobDto, EmployerJobsQueryDto, PatchJobDto } from './dto/job.dto';
import { JobsService } from './jobs.service';

@Controller('employer/jobs')
@Roles('EMPLOYER')
@ApiTags('employer-jobs')
export class EmployerJobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly applicationsService: ApplicationsService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployerJobsQueryDto,
  ) {
    return this.jobsService.listMine(user, query);
  }

  @Get(':jobId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
  ) {
    return this.jobsService.getMine(user, jobId);
  }

  @Patch(':jobId')
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
    @Body() dto: PatchJobDto,
  ) {
    return this.jobsService.patch(user, jobId, dto);
  }

  @Post(':jobId/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
  ) {
    return this.jobsService.publish(user, jobId);
  }

  @Post(':jobId/close')
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
  ) {
    return this.jobsService.close(user, jobId);
  }

  @Get(':jobId/applications')
  listApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
    @Query() query: EmployerApplicationsQueryDto,
  ) {
    return this.applicationsService.listForEmployerJob(user, jobId, query);
  }

  @Patch(':jobId/applications/:applicationId')
  patchApplication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
    @Param('applicationId', new ParseUUIDPipe({ version: '7' }))
    applicationId: string,
    @Body() dto: PatchApplicationStatusDto,
  ) {
    return this.applicationsService.patchForEmployerJob(
      user,
      jobId,
      applicationId,
      dto,
    );
  }
}
