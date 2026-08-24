import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { localizedName } from '../../common/utils/localized-name';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  async listDistricts(user: AuthenticatedUser) {
    const districts = await this.prisma.district.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    return {
      data: districts.map((district) => ({
        id: district.id,
        code: district.code,
        name: localizedName(user.preferredLanguage, district.names),
      })),
    };
  }

  async listCities(user: AuthenticatedUser, districtId: string) {
    const district = await this.prisma.district.findFirst({
      where: { id: districtId, isActive: true },
    });
    if (!district) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }
    const cities = await this.prisma.city.findMany({
      where: { districtId, isActive: true },
      orderBy: { code: 'asc' },
    });
    return {
      data: cities.map((city) => ({
        id: city.id,
        districtId: city.districtId,
        code: city.code,
        name: localizedName(user.preferredLanguage, city.names),
      })),
    };
  }

  async listAreas(user: AuthenticatedUser, cityId: string) {
    const city = await this.prisma.city.findFirst({
      where: { id: cityId, isActive: true },
    });
    if (!city) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }
    const areas = await this.prisma.area.findMany({
      where: { cityId, isActive: true },
      orderBy: { code: 'asc' },
    });
    return {
      data: areas.map((area) => ({
        id: area.id,
        cityId: area.cityId,
        code: area.code,
        name: localizedName(user.preferredLanguage, area.names),
      })),
    };
  }
}
