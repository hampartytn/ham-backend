import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  canEmployeeWithdraw,
  canEmployerSetStatus,
} from '../../common/utils/application-state';
import { assertSameOrganization } from '../../common/utils/ownership';
import { toAllowlistedWorker } from '../../common/utils/worker-privacy';
import { offsetFromQuery } from '../../database/pagination';
import { PrismaService } from '../../database/prisma.service';
import type { ApplicationStatus } from '../../generated/prisma/enums';
import {
  CreateApplicationDto,
  EmployeeApplicationsQueryDto,
  EmployerApplicationsQueryDto,
  PatchApplicationStatusDto,
} from './dto/application.dto';

const jobSummaryInclude = {
  job: {
    select: {
      id: true,
      title: true,
      status: true,
      organization: { select: { id: true, name: true } },
    },
  },
} as const;

const applicantInclude = {
  employeeProfile: {
    select: {
      id: true,
      fullName: true,
      districtId: true,
      availabilityStatus: true,
      availableFrom: true,
      skills: { include: { skill: true } },
    },
  },
} as const;

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(user: AuthenticatedUser, dto: CreateApplicationDto) {
    const profile = await this.requireEmployeeProfile(user);
    const job = await this.prisma.job.findFirst({
      where: { id: dto.jobId },
    });
    if (!job || job.deletedAt) {
      throw notFound();
    }
    if (job.status !== 'PUBLISHED') {
      throw conflict('Job is not open for applications');
    }

    try {
      const application = await this.prisma.$transaction(async (tx) => {
        const created = await tx.jobApplication.create({
          data: {
            jobId: job.id,
            employeeProfileId: profile.id,
            coverNote: dto.coverNote,
            status: 'SUBMITTED',
          },
          include: jobSummaryInclude,
        });
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: created.id,
            fromStatus: null,
            toStatus: 'SUBMITTED',
            actorUserId: user.id,
          },
        });
        return created;
      });
      return { data: toEmployeeApplicationDto(application) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw conflict('Application already exists');
      }
      throw error;
    }
  }

  async listMine(user: AuthenticatedUser, query: EmployeeApplicationsQueryDto) {
    const profile = await this.requireEmployeeProfile(user);
    const { page, limit, skip, take } = offsetFromQuery(query);
    const where: Prisma.JobApplicationWhereInput = {
      employeeProfileId: profile.id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        include: jobSummaryInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    return {
      data: rows.map(toEmployeeApplicationDto),
      meta: { page, limit, total },
    };
  }

  async getMine(user: AuthenticatedUser, applicationId: string) {
    const profile = await this.requireEmployeeProfile(user);
    const application = await this.prisma.jobApplication.findFirst({
      where: { id: applicationId, employeeProfileId: profile.id },
      include: jobSummaryInclude,
    });
    if (!application) {
      throw notFound();
    }
    return { data: toEmployeeApplicationDto(application) };
  }

  async withdraw(user: AuthenticatedUser, applicationId: string) {
    const profile = await this.requireEmployeeProfile(user);
    const application = await this.prisma.jobApplication.findFirst({
      where: { id: applicationId, employeeProfileId: profile.id },
      include: jobSummaryInclude,
    });
    if (!application) {
      throw notFound();
    }
    if (!canEmployeeWithdraw(application.status)) {
      throw conflict('Application cannot be withdrawn');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.jobApplication.update({
        where: { id: application.id },
        data: { status: 'WITHDRAWN' },
        include: jobSummaryInclude,
      });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: application.status,
          toStatus: 'WITHDRAWN',
          actorUserId: user.id,
        },
      });
      return next;
    });

    return { data: toEmployeeApplicationDto(updated) };
  }

  async listForEmployerJob(
    user: AuthenticatedUser,
    jobId: string,
    query: EmployerApplicationsQueryDto,
  ) {
    await this.requireOwnedJob(user, jobId);
    const { page, limit, skip, take } = offsetFromQuery(query);
    const where: Prisma.JobApplicationWhereInput = {
      jobId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        include: applicantInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    return {
      data: rows.map((row) =>
        toEmployerApplicantDto(row, user.preferredLanguage),
      ),
      meta: { page, limit, total },
    };
  }

  async patchForEmployerJob(
    user: AuthenticatedUser,
    jobId: string,
    applicationId: string,
    dto: PatchApplicationStatusDto,
  ) {
    await this.requireOwnedJob(user, jobId);
    const application = await this.prisma.jobApplication.findFirst({
      where: { id: applicationId, jobId },
      include: applicantInclude,
    });
    if (!application) {
      throw notFound();
    }

    const nextStatus = dto.status as ApplicationStatus;
    if (!canEmployerSetStatus(application.status, nextStatus)) {
      throw conflict('Application status cannot be updated');
    }

    if (application.status === nextStatus) {
      return {
        data: toEmployerApplicantDto(application, user.preferredLanguage),
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.jobApplication.update({
        where: { id: application.id },
        data: { status: nextStatus },
        include: applicantInclude,
      });
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: application.status,
          toStatus: nextStatus,
          actorUserId: user.id,
        },
      });
      return next;
    });

    return {
      data: toEmployerApplicantDto(updated, user.preferredLanguage),
    };
  }

  private async requireEmployeeProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      throw notFound();
    }
    return profile;
  }

  private async requireOwnedJob(user: AuthenticatedUser, jobId: string) {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      throw notFound();
    }
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job) {
      throw notFound();
    }
    assertSameOrganization(profile.organizationId, job.organizationId);
    return job;
  }
}

function toEmployeeApplicationDto(application: {
  id: string;
  jobId: string;
  status: string;
  coverNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  job: {
    id: string;
    title: string;
    status: string;
    organization: { id: string; name: string };
  };
}) {
  return {
    id: application.id,
    jobId: application.jobId,
    status: application.status,
    coverNote: application.coverNote,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    job: {
      id: application.job.id,
      title: application.job.title,
      status: application.job.status,
      organization: application.job.organization,
    },
  };
}

function toEmployerApplicantDto(
  application: {
    id: string;
    status: string;
    coverNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    employeeProfile: {
      id: string;
      fullName: string | null;
      districtId: string | null;
      availabilityStatus: string;
      availableFrom: Date | null;
      skills: Array<{
        skillId: string;
        yearsExperience: number | null;
        skill: { code: string; names: unknown };
      }>;
    };
  },
  language: string,
) {
  const worker = toAllowlistedWorker(
    language,
    application.employeeProfile,
    false,
  );
  return {
    id: application.id,
    status: application.status,
    coverNote: application.coverNote,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    employee: {
      id: worker.id,
      fullName: worker.fullName,
      districtId: worker.districtId,
      availabilityStatus: worker.availabilityStatus,
      availableFrom: worker.availableFrom,
      skills: worker.skills,
    },
  };
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
