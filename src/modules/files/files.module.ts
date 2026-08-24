import { Global, Module } from '@nestjs/common';
import { FILE_STORAGE_PROVIDER } from '../../integrations/storage/file-storage.provider';
import { LocalFileStorageProvider } from '../../integrations/storage/local-file-storage.provider';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Global()
@Module({
  controllers: [FilesController],
  providers: [
    LocalFileStorageProvider,
    { provide: FILE_STORAGE_PROVIDER, useExisting: LocalFileStorageProvider },
    FilesService,
  ],
  exports: [FilesService, FILE_STORAGE_PROVIDER],
})
export class FilesModule {}
