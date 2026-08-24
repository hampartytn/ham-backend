import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { localizedName } from '../../common/utils/localized-name';
import { offsetFromQuery } from '../../database/pagination';
import { PrismaService } from '../../database/prisma.service';
import { coverageWhere, type LegalSupportGeoQuery } from './coverage-match';
import type {
  CreateSupportProviderInput,
  CoverageInput,
  ListLegalProvidersQueryDto,
  UpdateSupportProviderInput,
} from './dto/legal-support.dto';

const employeeProviderWhere: Prisma.SupportProviderWhereInput = {
  approvalStatus: 'APPROVED',
  deletedAt: null,
  category: { isActive: true },
};

const providerInclude = {
  category: true,
  coverages: true,
} as const;

@Injectable()
export class LegalSupportService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(user: AuthenticatedUser) {
    const categories = await this.prisma.supportProviderCategory.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    return {
      data: categories.map((category) => ({
        id: category.id,
        code: category.code,
        name: localizedName(user.preferredLanguage, category.names),
      })),
    };
  }

  async listProviders(
    user: AuthenticatedUser,
    query: ListLegalProvidersQueryDto,
  ) {
    const geo = await this.resolveGeo(query);
    const { page, limit, skip, take } = offsetFromQuery(query);
    const where: Prisma.SupportProviderWhereInput = {
      ...employeeProviderWhere,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      coverages: { some: coverageWhere(geo) },
    };

    const [rows, total] = await Promise.all([
      this.prisma.supportProvider.findMany({
        where,
        include: { category: true },
        orderBy: [{ trustLevel: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.supportProvider.count({ where }),
    ]);

    return {
      data: rows.map((row) => toProviderDto(row, user.preferredLanguage)),
      meta: { page, limit, total },
    };
  }

  async getProvider(user: AuthenticatedUser, providerId: string) {
    const provider = await this.prisma.supportProvider.findFirst({
      where: { id: providerId, ...employeeProviderWhere },
      include: providerInclude,
    });
    if (!provider) {
      throw notFound();
    }
    return {
      data: {
        ...toProviderDto(provider, user.preferredLanguage),
        coverages: provider.coverages.map((coverage) => ({
          districtId: coverage.districtId,
          cityId: coverage.cityId,
          areaId: coverage.areaId,
        })),
      },
    };
  }

  async create(input: CreateSupportProviderInput) {
    await this.assertCategory(input.categoryId);
    const coverages = await this.assertCoverages(input.coverages);

    return this.prisma.supportProvider.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        trustLevel: input.trustLevel,
        approvalStatus: input.approvalStatus ?? 'DRAFT',
        phone: input.phone,
        email: input.email,
        addressText: input.addressText,
        coverages: {
          create: coverages.map((coverage) => ({
            districtId: coverage.districtId,
            cityId: coverage.cityId,
            areaId: coverage.areaId,
          })),
        },
      },
      include: providerInclude,
    });
  }

  async update(providerId: string, input: UpdateSupportProviderInput) {
    const existing = await this.prisma.supportProvider.findFirst({
      where: { id: providerId, deletedAt: null },
    });
    if (!existing) {
      throw notFound();
    }
    return this.prisma.supportProvider.update({
      where: { id: providerId },
      data: {
        name: input.name ?? existing.name,
        description:
          input.description !== undefined
            ? input.description
            : existing.description,
        trustLevel: input.trustLevel ?? existing.trustLevel,
        approvalStatus: input.approvalStatus ?? existing.approvalStatus,
        phone: input.phone !== undefined ? input.phone : existing.phone,
        email: input.email !== undefined ? input.email : existing.email,
        addressText:
          input.addressText !== undefined
            ? input.addressText
            : existing.addressText,
      },
      include: providerInclude,
    });
  }

  async archive(providerId: string) {
    const existing = await this.prisma.supportProvider.findFirst({
      where: { id: providerId, deletedAt: null },
    });
    if (!existing) {
      throw notFound();
    }
    return this.prisma.supportProvider.update({
      where: { id: providerId },
      data: { deletedAt: new Date() },
    });
  }

  async listAdmin(
    user: AuthenticatedUser,
    query: {
      page?: unknown;
      limit?: unknown;
      approvalStatus?: 'DRAFT' | 'APPROVED' | 'REJECTED';
    },
  ) {
    const { page, limit, skip, take } = offsetFromQuery(query);
    const where: Prisma.SupportProviderWhereInput = {
      deletedAt: null,
      ...(query.approvalStatus ? { approvalStatus: query.approvalStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportProvider.findMany({
        where,
        include: providerInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.supportProvider.count({ where }),
    ]);
    return {
      data: rows.map((row) => toAdminProviderDto(row, user.preferredLanguage)),
      meta: { page, limit, total },
    };
  }

  async approve(providerId: string) {
    const existing = await this.prisma.supportProvider.findFirst({
      where: { id: providerId, deletedAt: null },
    });
    if (!existing) {
      throw notFound();
    }
    return this.prisma.supportProvider.update({
      where: { id: providerId },
      data: { approvalStatus: 'APPROVED' },
      include: providerInclude,
    });
  }

  private async resolveGeo(query: {
    districtId?: string;
    cityId?: string;
    areaId?: string;
  }): Promise<LegalSupportGeoQuery> {
    let districtId = query.districtId;
    let cityId = query.cityId;
    const areaId = query.areaId;

    if (areaId) {
      const area = await this.prisma.area.findFirst({
        where: { id: areaId, isActive: true },
        include: { city: true },
      });
      if (!area) {
        throw validation('areaId', 'unknown area');
      }
      cityId = cityId ?? area.cityId;
      districtId = districtId ?? area.city.districtId;
      if (cityId !== area.cityId) {
        throw validation('cityId', 'must match area');
      }
    }

    if (cityId) {
      const city = await this.prisma.city.findFirst({
        where: { id: cityId, isActive: true },
      });
      if (!city) {
        throw validation('cityId', 'unknown city');
      }
      districtId = districtId ?? city.districtId;
      if (districtId !== city.districtId) {
        throw validation('districtId', 'must match city');
      }
    }

    if (!districtId) {
      throw validation('districtId', 'required');
    }

    const district = await this.prisma.district.findFirst({
      where: { id: districtId, isActive: true },
    });
    if (!district) {
      throw validation('districtId', 'unknown district');
    }

    return {
      districtId,
      ...(cityId ? { cityId } : {}),
      ...(areaId ? { areaId } : {}),
    };
  }

  private async assertCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.supportProviderCategory.findFirst({
      where: { id: categoryId, isActive: true },
    });
    if (!category) {
      throw validation('categoryId', 'unknown category');
    }
  }

  private async assertCoverages(
    coverages: CoverageInput[],
  ): Promise<LegalSupportGeoQuery[]> {
    if (coverages.length === 0) {
      throw validation('coverages', 'required');
    }
    const resolved: LegalSupportGeoQuery[] = [];
    for (const coverage of coverages) {
      resolved.push(await this.resolveGeo(coverage));
    }
    return resolved;
  }
}

function toAdminProviderDto(
  provider: {
    id: string;
    name: string;
    description: string | null;
    trustLevel: string;
    approvalStatus: string;
    phone: string | null;
    email: string | null;
    addressText: string | null;
    category: {
      id: string;
      code: string;
      names: unknown;
    };
    coverages: Array<{
      districtId: string;
      cityId: string | null;
      areaId: string | null;
    }>;
  },
  language: string,
) {
  return {
    ...toProviderDto(provider, language),
    approvalStatus: provider.approvalStatus,
    coverages: provider.coverages.map((coverage) => ({
      districtId: coverage.districtId,
      cityId: coverage.cityId,
      areaId: coverage.areaId,
    })),
  };
}

function toProviderDto(
  provider: {
    id: string;
    name: string;
    description: string | null;
    trustLevel: string;
    phone: string | null;
    email: string | null;
    addressText: string | null;
    category: {
      id: string;
      code: string;
      names: unknown;
    };
  },
  language: string,
) {
  return {
    id: provider.id,
    name: provider.name,
    description: provider.description,
    trustLevel: provider.trustLevel,
    phone: provider.phone,
    email: provider.email,
    addressText: provider.addressText,
    category: {
      id: provider.category.id,
      code: provider.category.code,
      name: localizedName(language, provider.category.names),
    },
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Resource not found',
  });
}

function validation(field: string, issue: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Request validation failed',
    details: [{ field, issue }],
  });
}
