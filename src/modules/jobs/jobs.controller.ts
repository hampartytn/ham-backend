import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JobFeedQueryDto } from './dto/job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
@Roles('EMPLOYEE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN')
@ApiTags('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: JobFeedQueryDto,
  ) {
    return this.jobsService.listPublished(user, query);
  }

  @Get(':jobId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
  ) {
    return this.jobsService.getPublished(user, jobId);
  }
}
