import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { localizedName } from '../../common/utils/localized-name';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSkills(user: AuthenticatedUser, categoryId?: string) {
    const skills = await this.prisma.skill.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: { code: 'asc' },
    });
    return {
      data: skills.map((skill) => ({
        id: skill.id,
        categoryId: skill.categoryId,
        code: skill.code,
        name: localizedName(user.preferredLanguage, skill.names),
      })),
    };
  }

  async listCategories(user: AuthenticatedUser) {
    const categories = await this.prisma.skillCategory.findMany({
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
}
