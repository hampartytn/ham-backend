import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ListLegalProvidersQueryDto } from './dto/legal-support.dto';
import { LegalSupportService } from './legal-support.service';

@Controller('legal-support')
@ApiTags('legal-support')
export class LegalSupportController {
  constructor(private readonly legalSupportService: LegalSupportService) {}

  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.legalSupportService.listCategories(user);
  }

  @Get('providers')
  @Roles('EMPLOYEE', 'ADMIN')
  listProviders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLegalProvidersQueryDto,
  ) {
    return this.legalSupportService.listProviders(user, query);
  }

  @Get('providers/:providerId')
  @Roles('EMPLOYEE', 'ADMIN')
  getProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', new ParseUUIDPipe({ version: '7' }))
    providerId: string,
  ) {
    return this.legalSupportService.getProvider(user, providerId);
  }
}
