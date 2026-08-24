import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import {
  ASSIGNABLE_ADMIN_PERMISSIONS,
  type Permission,
} from '../../common/constants/permissions';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { redactSensitive } from '../../common/utils/redact';
import { offsetFromQuery } from '../../database/pagination';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password.util';
import { LegalSupportService } from '../legal-support/legal-support.service';
import {
  AdminAuditLogsQueryDto,
  AdminCreateAdminDto,
  AdminCreateLegalProviderDto,
  AdminJobsQueryDto,
  AdminLegalProvidersQueryDto,
  AdminPatchLegalProviderDto,
  AdminPatchPermissionsDto,
  AdminUsersQueryDto,
  AdminUserStatusDto,
} from './dto/admin.dto';

const USER_ROLES = ['EMPLOYEE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN'] as const;
const USER_STATUSES = [
  'PENDING_PHONE',
  'ACTIVE',
  'SUSPENDED',
  'BLOCKED',
] as const;
const JOB_STATUSES = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CLOSED'] as const;

export type AdminActorContext = {
  ip?: string | null;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly legalSupport: LegalSupportService,
  ) {}

  async listUsers(query: AdminUsersQueryDto) {
    const { page, limit, skip, take } = offsetFromQuery(query);
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.accountStatus ? { accountStatus: query.accountStatus } : {}),
      ...(q ? { OR: [{ phone: q }, { email: q }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: userListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: rows.map(toUserListDto),
      meta: { page, limit, total },
    };
  }

  async getUser(userId: string) {
    const record = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        ...userListSelect,
        employeeProfile: {
          select: {
            id: true,
            fullName: true,
            dateOfBirth: true,
            gender: true,
            districtId: true,
            cityId: true,
            areaId: true,
            availabilityStatus: true,
            bio: true,
          },
        },
        employerProfile: {
          select: {
            id: true,
            fullName: true,
            organizationId: true,
            organization: { select: { id: true, name: true } },
          },
        },
        verificationRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            maskedIdentity: true,
            failureCode: true,
          },
        },
      },
    });
    if (!record) {
      throw notFound();
    }
    const verification = record.verificationRequests[0];
    return {
      data: {
        ...toUserListDto(record),
        employeeProfile: record.employeeProfile,
        employerProfile: record.employerProfile,
        verification: verification
          ? {
              status: verification.status,
              maskedIdentity: verification.maskedIdentity,
              failureCode: verification.failureCode,
            }
          : null,
      },
    };
  }

  async updateUserStatus(
    actor: AuthenticatedUser,
    userId: string,
    dto: AdminUserStatusDto,
    context: AdminActorContext,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!target) {
      throw notFound();
    }
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw forbidden();
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { accountStatus: dto.accountStatus },
      select: userListSelect,
    });
    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'user.status',
      targetType: 'User',
      targetId: target.id,
      metadata: {
        accountStatus: dto.accountStatus,
        reason: dto.reason,
      },
      ip: context.ip ?? undefined,
    });
    return { data: toUserListDto(updated) };
  }

  async listJobs(query: AdminJobsQueryDto) {
    const { page, limit, skip, take } = offsetFromQuery(query);
    const where: Prisma.JobWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.job.count({ where }),
    ]);
    return {
      data: rows.map((job) => ({
        id: job.id,
        title: job.title,
        status: job.status,
        organizationId: job.organizationId,
        organization: job.organization,
        districtId: job.districtId,
        publishedAt: job.publishedAt,
        closedAt: job.closedAt,
        createdAt: job.createdAt,
      })),
      meta: { page, limit, total },
    };
  }

  async unpublishJob(
    actor: AuthenticatedUser,
    jobId: string,
    context: AdminActorContext,
  ) {
    const job = await this.requireJob(jobId);
    if (job.status !== 'PUBLISHED') {
      throw conflict('Job cannot be unpublished');
    }
    const updated = await this.prisma.job.update({
      where: { id: job.id },
      data: { status: 'UNPUBLISHED' },
      include: { organization: { select: { id: true, name: true } } },
    });
    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'job.unpublish',
      targetType: 'Job',
      targetId: job.id,
      ip: context.ip ?? undefined,
    });
    return { data: { id: updated.id, status: updated.status } };
  }

  async closeJob(
    actor: AuthenticatedUser,
    jobId: string,
    context: AdminActorContext,
  ) {
    const job = await this.requireJob(jobId);
    if (job.status === 'CLOSED') {
      throw conflict('Job cannot be closed');
    }
    const updated = await this.prisma.job.update({
      where: { id: job.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'job.close',
      targetType: 'Job',
      targetId: job.id,
      ip: context.ip ?? undefined,
    });
    return { data: { id: updated.id, status: updated.status } };
  }

  listLegalProviders(
    user: AuthenticatedUser,
    query: AdminLegalProvidersQueryDto,
  ) {
    return this.legalSupport.listAdmin(user, query);
  }

  async createLegalProvider(
    actor: AuthenticatedUser,
    dto: AdminCreateLegalProviderDto,
    context: AdminActorContext,
  ) {
    const created = await this.legalSupport.create({
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
      trustLevel: dto.trustLevel,
      approvalStatus: 'DRAFT',
      phone: dto.phone,
      email: dto.email,
      addressText: dto.addressText,
      coverages: dto.coverages,
    });
    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'legal_support.create',
      targetType: 'SupportProvider',
      targetId: created.id,
      ip: context.ip ?? undefined,
    });
    return { data: { id: created.id, approvalStatus: created.approvalStatus } };
  }

  async updateLegalProvider(
    actor: AuthenticatedUser,
    providerId: string,
    dto: AdminPatchLegalProviderDto,
    context: AdminActorContext,
  ) {
    const updated = await this.legalSupport.update(providerId, dto);
    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'legal_support.update',
      targetType: 'SupportProvider',
      targetId: updated.id,
      ip: context.ip ?? undefined,
    });
    return { data: { id: updated.id, approvalStatus: updated.approvalStatus } };
  }

  async approveLegalProvider(
    actor: AuthenticatedUser,
    providerId: string,
    context: AdminActorContext,
  ) {
    const updated = await this.legalSupport.approve(providerId);
    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'legal_support.approve',
      targetType: 'SupportProvider',
      targetId: updated.id,
      ip: context.ip ?? undefined,
    });
    return { data: { id: updated.id, approvalStatus: updated.approvalStatus } };
  }

  async getMetrics() {
    const sevenDaysAgo = daysAgo(7);
    const thirtyDaysAgo = daysAgo(30);
    const [usersByRole, usersByStatus, jobsByStatus, last7, last30] =
      await Promise.all([
        this.prisma.user.groupBy({
          by: ['role'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.user.groupBy({
          by: ['accountStatus'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.job.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.jobApplication.count({
          where: { createdAt: { gte: sevenDaysAgo } },
        }),
        this.prisma.jobApplication.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

    return {
      data: {
        users: {
          byRole: fillCounts(
            USER_ROLES,
            usersByRole.map((row) => [row.role, row._count._all]),
          ),
          byStatus: fillCounts(
            USER_STATUSES,
            usersByStatus.map((row) => [row.accountStatus, row._count._all]),
          ),
        },
        jobs: {
          byStatus: fillCounts(
            JOB_STATUSES,
            jobsByStatus.map((row) => [row.status, row._count._all]),
          ),
        },
        applications: {
          last7Days: last7,
          last30Days: last30,
        },
      },
    };
  }

  async listAuditLogs(query: AdminAuditLogsQueryDto) {
    const { page, limit, skip, take } = offsetFromQuery(query);
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'from', issue: 'must be before to' }],
      });
    }
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        actorUserId: row.actorUserId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata ? redactSensitive(row.metadata) : null,
        ip: row.ip,
        createdAt: row.createdAt,
      })),
      meta: { page, limit, total },
    };
  }

  async createAdmin(
    actor: AuthenticatedUser,
    dto: AdminCreateAdminDto,
    context: AdminActorContext,
  ) {
    const permissions = uniqueAssignable(dto.permissions);
    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw conflict('Resource already exists');
    }
    const passwordHash = await hashPassword(dto.password);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: 'ADMIN',
          phone: dto.phone,
          passwordHash,
          accountStatus: 'ACTIVE',
          preferredLanguage: 'en',
          phoneVerifiedAt: new Date(),
        },
      });
      if (permissions.length > 0) {
        await tx.adminUserPermission.createMany({
          data: permissions.map((permission) => ({
            userId: user.id,
            permission,
            createdByUserId: actor.id,
          })),
        });
      }
      return user;
    });

    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'admin.create',
      targetType: 'User',
      targetId: created.id,
      metadata: { permissions },
      ip: context.ip ?? undefined,
    });

    return {
      data: {
        id: created.id,
        role: created.role,
        phone: created.phone,
        permissions,
      },
    };
  }

  async patchAdminPermissions(
    actor: AuthenticatedUser,
    userId: string,
    dto: AdminPatchPermissionsDto,
    context: AdminActorContext,
  ) {
    const permissions = uniqueAssignable(dto.permissions);
    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!target) {
      throw notFound();
    }
    if (target.role !== 'ADMIN') {
      throw conflict('Permissions can only be assigned to ADMIN users');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUserPermission.deleteMany({ where: { userId: target.id } });
      if (permissions.length > 0) {
        await tx.adminUserPermission.createMany({
          data: permissions.map((permission) => ({
            userId: target.id,
            permission,
            createdByUserId: actor.id,
          })),
        });
      }
    });

    await this.audit.append({
      actorType: 'USER',
      actorUserId: actor.id,
      action: 'admin.permissions',
      targetType: 'User',
      targetId: target.id,
      metadata: { permissions },
      ip: context.ip ?? undefined,
    });

    return { data: { userId: target.id, permissions } };
  }

  private async requireJob(jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job) {
      throw notFound();
    }
    return job;
  }
}

const userListSelect = {
  id: true,
  role: true,
  phone: true,
  email: true,
  accountStatus: true,
  preferredLanguage: true,
  createdAt: true,
} as const;

function toUserListDto(user: {
  id: string;
  role: string;
  phone: string;
  email: string | null;
  accountStatus: string;
  preferredLanguage: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    role: user.role,
    phone: user.phone,
    email: user.email,
    accountStatus: user.accountStatus,
    preferredLanguage: user.preferredLanguage,
    createdAt: user.createdAt,
  };
}

function uniqueAssignable(permissions: string[]): Permission[] {
  const unique = [...new Set(permissions)];
  const invalid = unique.filter(
    (permission) =>
      !ASSIGNABLE_ADMIN_PERMISSIONS.includes(permission as Permission),
  );
  if (invalid.length > 0) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: [
        { field: 'permissions', issue: 'contains unassignable permission' },
      ],
    });
  }
  return unique as Permission[];
}

function fillCounts(
  keys: readonly string[],
  pairs: Array<[string, number]>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of keys) {
    result[key] = 0;
  }
  for (const [key, count] of pairs) {
    result[key] = count;
  }
  return result;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Resource not found',
  });
}

function forbidden(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Forbidden',
  });
}

function conflict(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONFLICT,
    message,
  });
}
