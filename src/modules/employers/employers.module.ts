import { Module } from '@nestjs/common';
import { EmployerMembershipService } from './employer-membership.service';
import { EmployersController } from './employers.controller';
import { EmployersService } from './employers.service';

@Module({
  controllers: [EmployersController],
  providers: [EmployersService, EmployerMembershipService],
  exports: [EmployerMembershipService],
})
export class EmployersModule {}
