import { Body, Controller, Get, Patch, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  PatchEmployerProfileDto,
  UpsertOrganizationDto,
  WorkerSearchQueryDto,
} from './dto/employer.dto';
import { EmployersService } from './employers.service';

@Controller('employer')
@Roles('EMPLOYER')
@ApiTags('employers')
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.employersService.getProfile(user);
  }

  @Patch('profile')
  patchProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PatchEmployerProfileDto,
  ) {
    return this.employersService.patchProfile(user, dto);
  }

  @Put('organization')
  upsertOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertOrganizationDto,
  ) {
    return this.employersService.upsertOrganization(user, dto);
  }

  @Get('workers')
  searchWorkers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkerSearchQueryDto,
  ) {
    return this.employersService.searchWorkers(user, query);
  }
}
