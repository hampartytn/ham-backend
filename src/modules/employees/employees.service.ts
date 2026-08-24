import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { localizedName } from '../../common/utils/localized-name';
import { assertSameUser } from '../../common/utils/ownership';
import { PrismaService } from '../../database/prisma.service';
import { FilesService } from '../files/files.service';
import {
  PatchEmployeeProfileDto,
  ReplaceEmployeeSkillsDto,
} from './dto/employee-profile.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async getProfile(user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    return { data: this.toDto(profile, user.preferredLanguage) };
  }

  async patchProfile(user: AuthenticatedUser, dto: PatchEmployeeProfileDto) {
    const profile = await this.requireProfile(user);
    await this.assertLocation(dto, profile);

    const availabilityStatus =
      dto.availabilityStatus ?? profile.availabilityStatus;
    const availableFrom =
      dto.availableFrom !== undefined
        ? new Date(dto.availableFrom)
        : profile.availableFrom;

    if (availabilityStatus === 'AVAILABLE_FROM' && !availableFrom) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'availableFrom', issue: 'required' }],
      });
    }

    const updated = await this.prisma.employeeProfile.update({
      where: { id: profile.id },
      data: {
        fullName: dto.fullName ?? profile.fullName,
        dateOfBirth:
          dto.dateOfBirth !== undefined
            ? new Date(dto.dateOfBirth)
            : profile.dateOfBirth,
        gender: dto.gender ?? profile.gender,
        districtId: dto.districtId ?? profile.districtId,
        cityId: dto.cityId !== undefined ? dto.cityId : profile.cityId,
        areaId: dto.areaId !== undefined ? dto.areaId : profile.areaId,
        availabilityStatus,
        availableFrom:
          availabilityStatus === 'AVAILABLE_FROM' ? availableFrom : null,
        bio: dto.bio ?? profile.bio,
      },
      include: profileInclude,
    });

    return { data: this.toDto(updated, user.preferredLanguage) };
  }

  async replaceSkills(user: AuthenticatedUser, dto: ReplaceEmployeeSkillsDto) {
    const profile = await this.requireProfile(user);
    const skillIds = [...new Set(dto.skills.map((item) => item.skillId))];
    const skills = await this.prisma.skill.findMany({
      where: { id: { in: skillIds }, isActive: true },
    });
    if (skills.length !== skillIds.length) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'skills', issue: 'unknown skillId' }],
      });
    }

    const yearsBySkill = new Map(
      dto.skills.map((item) => [item.skillId, item.yearsExperience]),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeSkill.deleteMany({
        where: { employeeProfileId: profile.id },
      });
      if (skillIds.length > 0) {
        await tx.employeeSkill.createMany({
          data: skillIds.map((skillId) => ({
            employeeProfileId: profile.id,
            skillId,
            yearsExperience: yearsBySkill.get(skillId),
          })),
        });
      }
    });

    return this.getSkills(user);
  }

  async getSkills(user: AuthenticatedUser) {
    const profile = await this.requireProfile(user);
    const rows = await this.prisma.employeeSkill.findMany({
      where: { employeeProfileId: profile.id },
      include: { skill: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      data: rows.map((row) => ({
        skillId: row.skillId,
        code: row.skill.code,
        name: localizedName(user.preferredLanguage, row.skill.names),
        yearsExperience: row.yearsExperience,
      })),
    };
  }

  async uploadImage(user: AuthenticatedUser, contents: Buffer) {
    const profile = await this.requireProfile(user);
    const saved = await this.filesService.saveProfileImage(user, contents);
    const previous = profile.profileImageFileId;
    await this.prisma.employeeProfile.update({
      where: { id: profile.id },
      data: { profileImageFileId: saved.fileId },
    });
    if (previous && previous !== saved.fileId) {
      await this.prisma.fileObject.update({
        where: { id: previous },
        data: { deletedAt: new Date() },
      });
    }
    return { data: saved };
  }

  private async requireProfile(user: AuthenticatedUser) {
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId: user.id },
      include: profileInclude,
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

  private async assertLocation(
    dto: PatchEmployeeProfileDto,
    current: {
      districtId: string | null;
      cityId: string | null;
      areaId: string | null;
    },
  ): Promise<void> {
    const districtId = dto.districtId ?? current.districtId;
    const cityId = dto.cityId !== undefined ? dto.cityId : current.cityId;
    const areaId = dto.areaId !== undefined ? dto.areaId : current.areaId;

    if (districtId) {
      const district = await this.prisma.district.findFirst({
        where: { id: districtId, isActive: true },
      });
      if (!district) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'districtId', issue: 'unknown district' }],
        });
      }
    }

    if (cityId) {
      if (!districtId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [
            { field: 'districtId', issue: 'required when cityId is set' },
          ],
        });
      }
      const city = await this.prisma.city.findFirst({
        where: { id: cityId, districtId, isActive: true },
      });
      if (!city) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'cityId', issue: 'unknown city' }],
        });
      }
    }

    if (areaId) {
      if (!cityId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: [{ field: 'cityId', issue: 'required when areaId is set' }],
        });
      }
      const area = await this.prisma.area.findFirst({
        where: { id: areaId, cityId, isActive: true },
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

  private toDto(
    profile: Awaited<ReturnType<EmployeesService['requireProfile']>>,
    language: string,
  ) {
    return {
      id: profile.id,
      fullName: profile.fullName,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      districtId: profile.districtId,
      cityId: profile.cityId,
      areaId: profile.areaId,
      availabilityStatus: profile.availabilityStatus,
      availableFrom: profile.availableFrom,
      bio: profile.bio,
      image: profile.profileImage
        ? {
            fileId: profile.profileImage.id,
            url: this.filesService.fileUrl(profile.profileImage.id),
          }
        : null,
      skills: profile.skills.map((row) => ({
        skillId: row.skillId,
        code: row.skill.code,
        name: localizedName(language, row.skill.names),
        yearsExperience: row.yearsExperience,
      })),
    };
  }
}

const profileInclude = {
  skills: { include: { skill: true } },
  profileImage: true,
} as const;
