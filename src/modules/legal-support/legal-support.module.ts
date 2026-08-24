import { Module } from '@nestjs/common';
import { LegalSupportController } from './legal-support.controller';
import { LegalSupportService } from './legal-support.service';

@Module({
  controllers: [LegalSupportController],
  providers: [LegalSupportService],
  exports: [LegalSupportService],
})
export class LegalSupportModule {}
