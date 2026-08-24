import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PatchMeDto } from './dto/patch-me.dto';
import { UsersService } from './users.service';

@Controller('me')
@ApiTags('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMe(user);
  }

  @Patch()
  patchMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: PatchMeDto) {
    return this.usersService.patchMe(user, dto);
  }
}
