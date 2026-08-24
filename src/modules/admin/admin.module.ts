import { Module } from '@nestjs/common';
import { LegalSupportModule } from '../legal-support/legal-support.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [LegalSupportModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
