import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { FilesService } from '../files/files.service';
import { PatchMeDto } from './dto/patch-me.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async getMe(user: AuthenticatedUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        employeeProfile: {
          include: {
            skills: true,
            profileImage: true,
          },
        },
        employerProfile: {
          include: { organization: true },
        },
        hamMembership: true,
        verificationRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }

    const latestVerification = record.verificationRequests[0];
    const identityVerified = latestVerification?.status === 'SUCCEEDED';
    const employee = record.employeeProfile;
    const employer = record.employerProfile;
    const profileComplete = employee
      ? Boolean(
          employee.fullName &&
          employee.districtId &&
          employee.skills.length > 0,
        )
      : Boolean(employer?.fullName && employer.organizationId);

    return {
      data: {
        id: record.id,
        role: record.role,
        phone: record.phone,
        email: record.email,
        preferredLanguage: record.preferredLanguage,
        accountStatus: record.accountStatus,
        onboarding: {
          phoneVerified: Boolean(record.phoneVerifiedAt),
          profileComplete,
          identityVerified,
          hamMembershipStatus: record.hamMembership?.status ?? null,
        },
        employeeProfile: employee
          ? {
              id: employee.id,
              fullName: employee.fullName,
              districtId: employee.districtId,
              availabilityStatus: employee.availabilityStatus,
              skillCount: employee.skills.length,
              image: employee.profileImage
                ? {
                    fileId: employee.profileImage.id,
                    url: this.filesService.fileUrl(employee.profileImage.id),
                  }
                : null,
            }
          : null,
        employerProfile: employer
          ? {
              id: employer.id,
              fullName: employer.fullName,
              organizationId: employer.organizationId,
              organizationName: employer.organization?.name ?? null,
            }
          : null,
      },
    };
  }

  async patchMe(user: AuthenticatedUser, dto: PatchMeDto) {
    if (dto.preferredLanguage === undefined && dto.email === undefined) {
      return this.getMe(user);
    }

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(dto.preferredLanguage
            ? { preferredLanguage: dto.preferredLanguage }
            : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'Unable to update account',
        });
      }
      throw error;
    }

    return this.getMe(user);
  }
}
