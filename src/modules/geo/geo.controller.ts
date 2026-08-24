import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { GeoService } from './geo.service';

@Controller('geo')
@ApiTags('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('districts')
  listDistricts(@CurrentUser() user: AuthenticatedUser) {
    return this.geoService.listDistricts(user);
  }

  @Get('districts/:districtId/cities')
  listCities(
    @CurrentUser() user: AuthenticatedUser,
    @Param('districtId', new ParseUUIDPipe({ version: '7' }))
    districtId: string,
  ) {
    return this.geoService.listCities(user, districtId);
  }

  @Get('cities/:cityId/areas')
  listAreas(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cityId', new ParseUUIDPipe({ version: '7' })) cityId: string,
  ) {
    return this.geoService.listAreas(user, cityId);
  }
}
