import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SkillsService } from './skills.service';

class SkillQueryDto {
  @IsOptional()
  @IsUUID('7')
  categoryId?: string;
}

@Controller()
@ApiTags('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get('skills')
  listSkills(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SkillQueryDto,
  ) {
    return this.skillsService.listSkills(user, query.categoryId);
  }

  @Get('skill-categories')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.skillsService.listCategories(user);
  }
}
