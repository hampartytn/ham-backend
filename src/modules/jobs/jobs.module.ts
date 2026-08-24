import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { EmployerJobsController } from './employer-jobs.controller';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [ApplicationsModule],
  controllers: [JobsController, EmployerJobsController],
  providers: [JobsService],
})
export class JobsModule {}
