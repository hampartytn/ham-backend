import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { assertSameOrganization } from '../../common/utils/ownership';
import { decodeJobCursor, encodeJobCursor } from '../../database/cursor';
import { offsetFromQuery } from '../../database/pagination';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateJobDto,
  EmployerJobsQueryDto,
  JobFeedQueryDto,
  PatchJobDto,
} from './dto/job.dto';
import { toEmployerJobDto, toPublicJobDto } from './jobs.mapper';

const jobInclude = {
  organization: { select: { id: true, name: true } },
  skills: { include: { skill: true } },
} as const;

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateJobDto) {
    const organizationId = await this.requireOrganizationId(user, true);
    await this.assertLocation(dto);
    const skillIds = await this.requireSkills(dto.skillIds);
    this.assertWages(dto.wageMinPaise, dto.wageMaxPaise, dto.wagePeriod);

    const status = dto.status ?? 'DRAFT';
    const publishedAt = status === 'PUBLISHED' ? new Date() : null;

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          organizationId,
          createdByUserId: user.id,
          title: dto.title,
          description: dto.description,
          jobType: dto.jobType,
          status,
          districtId: dto.districtId,
          cityId: dto.cityId,
          areaId: dto.areaId,
          vacancies: dto.vacancies,
          wageMinPaise: dto.wageMinPaise,
          wageMaxPaise: dto.wageMaxPaise,
          wagePeriod: dto.wagePeriod,
          publishedAt,
        },
      });
      if (skillIds.length > 0) {
        await tx.jobSkill.createMany({
          data: skillIds.map((skillId) => ({ jobId: created.id, skillId })),
        });
      }
      return tx.job.findUniqueOrThrow({
        where: { id: created.id },
        include: jobInclude,
      });
    });

    return { data: toEmployerJobDto(job, user.preferredLanguage) };
  }

  async listMine(user: AuthenticatedUser, query: EmployerJobsQueryDto) {
    const organizationId = await this.requireOrganizationId(user, false);
    const { page, limit, skip, take } = offsetFromQuery(query);
    if (!organizationId) {
      return { data: [], meta: { page, limit, total: 0 } };
    }
    const where: Prisma.JobWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        include: jobInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data: rows.map((job) => toEmployerJobDto(job, user.preferredLanguage)),
      meta: { page, limit, total },
    };
  }

  async getMine(user: AuthenticatedUser, jobId: string) {
    const job = await this.requireOwnedJob(user, jobId);
    return { data: toEmployerJobDto(job, user.preferredLanguage) };
  }

  async patch(user: AuthenticatedUser, jobId: string, dto: PatchJobDto) {
    const job = await this.requireOwnedJob(user, jobId);
    if (job.status === 'CLOSED') {
      throw conflict('Job cannot be edited');
    }

    const districtId = dto.districtId ?? job.districtId;
    const cityId = dto.cityId !== undefined ? dto.cityId : job.cityId;
    const areaId = dto.areaId !== undefined ? dto.areaId : job.areaId;
    await this.assertLocation({ districtId, cityId, areaId });

    const wageMinPaise =
      dto.wageMinPaise !== undefined ? dto.wageMinPaise : job.wageMinPaise;
    const wageMaxPaise =
      dto.wageMaxPaise !== undefined ? dto.wageMaxPaise : job.wageMaxPaise;
    const wagePeriod =
      dto.wagePeriod !== undefined ? dto.wagePeriod : job.wagePeriod;
    this.assertWages(wageMinPaise, wageMaxPaise, wagePeriod);

    const skillIds =
      dto.skillIds !== undefined
        ? await this.requireSkills(dto.skillIds)
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: {
          title: dto.title ?? job.title,
          description: dto.description ?? job.description,
          jobType: dto.jobType ?? job.jobType,
          districtId,
          cityId,
          areaId,
          vacancies: dto.vacancies ?? job.vacancies,
          wageMinPaise,
          wageMaxPaise,
          wagePeriod,
        },
      });
      if (skillIds) {
        await tx.jobSkill.deleteMany({ where: { jobId: job.id } });
        if (skillIds.length > 0) {
          await tx.jobSkill.createMany({
            data: skillIds.map((skillId) => ({ jobId: job.id, skillId })),
          });
        }
      }
      return tx.job.findUniqueOrThrow({
        where: { id: job.id },
        include: jobInclude,
      });
    });

    return { data: toEmployerJobDto(updated, user.preferredLanguage) };
  }

  async publish(user: AuthenticatedUser, jobId: string) {
    const job = await this.requireOwnedJob(user, jobId);
    if (job.status !== 'DRAFT' && job.status !== 'UNPUBLISHED') {
      throw conflict('Job cannot be published');
    }

    const updated = await this.prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: job.publishedAt ?? new Date(),
        closedAt: null,
      },
      include: jobInclude,
    });
    return { data: toEmployerJobDto(updated, user.preferredLanguage) };
  }

  async close(user: AuthenticatedUser, jobId: string) {
    const job = await this.requireOwnedJob(user, jobId);
    if (job.status === 'CLOSED') {
      throw conflict('Job cannot be closed');
    }

    const updated = await this.prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
      include: jobInclude,
    });
    return { data: toEmployerJobDto(updated, user.preferredLanguage) };
  }

  async listPublished(user: AuthenticatedUser, query: JobFeedQueryDto) {
    const limit =
      typeof query.limit === 'number' && Number.isFinite(query.limit)
        ? Math.min(50, Math.max(1, Math.trunc(query.limit)))
        : 20;
    const where: Prisma.JobWhereInput = {
      status: 'PUBLISHED',
      deletedAt: null,
      publishedAt: { not: null },
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.jobType ? { jobType: query.jobType } : {}),
      ...(query.skillId
        ? { skills: { some: { skillId: query.skillId } } }
        : {}),
    };

    if (query.cursor) {
      const cursor = decodeJobCursor(query.cursor);
      if (!cursor) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'cursor', issue: 'invalid cursor' }],
        });
      }
      where.AND = [
        {
          OR: [
            { publishedAt: { lt: cursor.publishedAt } },
            {
              AND: [
                { publishedAt: cursor.publishedAt },
                { id: { lt: cursor.id } },
              ],
            },
          ],
        },
      ];
    }

    const rows = await this.prisma.job.findMany({
      where,
      include: jobInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last?.publishedAt
        ? encodeJobCursor(last.publishedAt, last.id)
        : null;

    return {
      data: page.map((job) => toPublicJobDto(job, user.preferredLanguage)),
      meta: { nextCursor, limit },
    };
  }

  async getPublished(user: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        status: 'PUBLISHED',
        deletedAt: null,
      },
      include: jobInclude,
    });
    if (!job) {
      throw notFound();
    }
    return { data: toPublicJobDto(job, user.preferredLanguage) };
  }

  private async requireOrganizationId(
    user: AuthenticatedUser,
    required: true,
  ): Promise<string>;
  private async requireOrganizationId(
    user: AuthenticatedUser,
    required: false,
  ): Promise<string | null>;
  private async requireOrganizationId(
    user: AuthenticatedUser,
    required: boolean,
  ): Promise<string | null> {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      throw notFound();
    }
    if (!profile.organizationId) {
      if (required) {
        throw conflict('Organization is required');
      }
      return null;
    }
    return profile.organizationId;
  }

  private async requireOwnedJob(user: AuthenticatedUser, jobId: string) {
    const organizationId = await this.requireOrganizationId(user, false);
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, deletedAt: null },
      include: jobInclude,
    });
    if (!job) {
      throw notFound();
    }
    assertSameOrganization(organizationId, job.organizationId);
    return job;
  }

  private async requireSkills(skillIds: string[]): Promise<string[]> {
    const unique = [...new Set(skillIds)];
    if (unique.length === 0) {
      return [];
    }
    const skills = await this.prisma.skill.findMany({
      where: { id: { in: unique }, isActive: true },
    });
    if (skills.length !== unique.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'skillIds', issue: 'unknown skillId' }],
      });
    }
    return unique;
  }

  private async assertLocation(dto: {
    districtId?: string;
    cityId?: string | null;
    areaId?: string | null;
  }): Promise<void> {
    if (!dto.districtId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'districtId', issue: 'required' }],
      });
    }

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

    if (dto.cityId) {
      const city = await this.prisma.city.findFirst({
        where: {
          id: dto.cityId,
          districtId: dto.districtId,
          isActive: true,
        },
      });
      if (!city) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'cityId', issue: 'unknown city' }],
        });
      }
    }

    if (dto.areaId) {
      if (!dto.cityId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'cityId', issue: 'required when areaId is set' }],
        });
      }
      const area = await this.prisma.area.findFirst({
        where: { id: dto.areaId, cityId: dto.cityId, isActive: true },
      });
      if (!area) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'areaId', issue: 'unknown area' }],
        });
      }
    }
  }

  private assertWages(
    wageMinPaise: number | null | undefined,
    wageMaxPaise: number | null | undefined,
    wagePeriod: string | null | undefined,
  ): void {
    if (
      (wageMinPaise != null || wageMaxPaise != null) &&
      (wagePeriod == null || wagePeriod.length === 0)
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'wagePeriod', issue: 'required when wage is set' }],
      });
    }
    if (
      wageMinPaise != null &&
      wageMaxPaise != null &&
      wageMaxPaise < wageMinPaise
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'wageMaxPaise', issue: 'must be >= wageMinPaise' }],
      });
    }
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Resource not found',
  });
}

function conflict(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONFLICT,
    message,
  });
}
