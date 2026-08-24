import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  assertSameOrganization,
  assertSameUser,
} from '../../common/utils/ownership';
import { toAllowlistedWorker } from '../../common/utils/worker-privacy';
import { offsetFromQuery } from '../../database/pagination';
import { PrismaService } from '../../database/prisma.service';
import {
  PatchEmployerProfileDto,
  UpsertOrganizationDto,
  WorkerSearchQueryDto,
} from './dto/employer.dto';

@Injectable()
export class EmployersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    return { data: this.toDto(profile) };
  }

  async patchProfile(user: AuthenticatedUser, dto: PatchEmployerProfileDto) {
    const profile = await this.requireProfile(user);
    const updated = await this.prisma.employerProfile.update({
      where: { id: profile.id },
      data: { fullName: dto.fullName ?? profile.fullName },
      include: { organization: true },
    });
    return { data: this.toDto(updated) };
  }

  async upsertOrganization(
    user: AuthenticatedUser,
    dto: UpsertOrganizationDto,
  ) {
    const profile = await this.requireProfile(user);
    await this.assertOrgLocation(dto);

    if (profile.organizationId) {
      assertSameOrganization(profile.organizationId, profile.organizationId);
      const organization = await this.prisma.organization.update({
        where: { id: profile.organizationId },
        data: {
          name: dto.name,
          description: dto.description,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          districtId: dto.districtId,
          cityId: dto.cityId,
        },
      });
      return { data: organizationDto(organization) };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          description: dto.description,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          districtId: dto.districtId,
          cityId: dto.cityId,
        },
      });
      await tx.employerProfile.update({
        where: { id: profile.id },
        data: { organizationId: organization.id },
      });
      return organization;
    });

    return { data: organizationDto(created) };
  }

  async searchWorkers(user: AuthenticatedUser, query: WorkerSearchQueryDto) {
    const { page, limit, skip, take } = offsetFromQuery(query);
    const where: Prisma.EmployeeProfileWhereInput = {
      user: {
        role: 'EMPLOYEE',
        accountStatus: 'ACTIVE',
        deletedAt: null,
      },
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.availabilityStatus
        ? { availabilityStatus: query.availabilityStatus }
        : {}),
      ...(query.skillId
        ? { skills: { some: { skillId: query.skillId } } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.employeeProfile.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          districtId: true,
          availabilityStatus: true,
          availableFrom: true,
          createdAt: true,
          skills: { include: { skill: true } },
          user: {
            select: {
              verificationRequests: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { status: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.employeeProfile.count({ where }),
    ]);

    return {
      data: rows.map((row) =>
        toAllowlistedWorker(
          user.preferredLanguage,
          row,
          row.user.verificationRequests[0]?.status === 'SUCCEEDED',
        ),
      ),
      meta: { page, limit, total },
    };
  }

  private async requireProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId: user.id },
      include: { organization: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }
    assertSameUser(user.id, profile.userId);
    return profile;
  }

  private async assertOrgLocation(dto: UpsertOrganizationDto): Promise<void> {
    if (dto.districtId) {
      const district = await this.prisma.district.findFirst({
        where: { id: dto.districtId, isActive: true },
      });
      if (!district) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'districtId', issue: 'unknown district' }],
        });
      }
    }
    if (dto.cityId) {
      if (!dto.districtId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [
            { field: 'districtId', issue: 'required when cityId is set' },
          ],
        });
      }
      const city = await this.prisma.city.findFirst({
        where: { id: dto.cityId, districtId: dto.districtId, isActive: true },
      });
      if (!city) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'cityId', issue: 'unknown city' }],
        });
      }
    }
  }

  private toDto(
    profile: Awaited<ReturnType<EmployersService['requireProfile']>>,
  ) {
    return {
      id: profile.id,
      fullName: profile.fullName,
      organization: profile.organization
        ? organizationDto(profile.organization)
        : null,
    };
  }
}

function organizationDto(organization: {
  id: string;
  name: string;
  description: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  districtId: string | null;
  cityId: string | null;
  verificationState: string;
  activationStatus: string;
}) {
  return {
    id: organization.id,
    name: organization.name,
    description: organization.description,
    contactPhone: organization.contactPhone,
    contactEmail: organization.contactEmail,
    districtId: organization.districtId,
    cityId: organization.cityId,
    verificationState: organization.verificationState,
    activationStatus: organization.activationStatus,
  };
}
