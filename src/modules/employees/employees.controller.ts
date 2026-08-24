import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  PatchEmployeeProfileDto,
  ReplaceEmployeeSkillsDto,
} from './dto/employee-profile.dto';
import { EmployeesService } from './employees.service';

@Controller('employee')
@Roles('EMPLOYEE')
@ApiTags('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getProfile(user);
  }

  @Patch('profile')
  patchProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PatchEmployeeProfileDto,
  ) {
    return this.employeesService.patchProfile(user, dto);
  }

  @Get('skills')
  getSkills(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getSkills(user);
  }

  @Put('skills')
  replaceSkills(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplaceEmployeeSkillsDto,
  ) {
    return this.employeesService.replaceSkills(user, dto);
  }

  @Post('profile/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2_097_152 },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.employeesService.uploadImage(
      user,
      file?.buffer ?? Buffer.alloc(0),
    );
  }
}
