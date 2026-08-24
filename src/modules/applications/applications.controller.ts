import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApplicationsService } from './applications.service';
import {
  CreateApplicationDto,
  EmployeeApplicationsQueryDto,
} from './dto/application.dto';

@Controller('applications')
@Roles('EMPLOYEE')
@ApiTags('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationsService.apply(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeApplicationsQueryDto,
  ) {
    return this.applicationsService.listMine(user, query);
  }

  @Get(':applicationId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '7' }))
    applicationId: string,
  ) {
    return this.applicationsService.getMine(user, applicationId);
  }

  @Post(':applicationId/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '7' }))
    applicationId: string,
  ) {
    return this.applicationsService.withdraw(user, applicationId);
  }
}
