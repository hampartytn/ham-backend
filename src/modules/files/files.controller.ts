import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FilesService } from './files.service';

@Controller('files')
@ApiTags('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get(':fileId')
  @Header('Cache-Control', 'private, max-age=3600')
  async download(
    @Param('fileId', new ParseUUIDPipe({ version: '7' })) fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const file = await this.filesService.loadForDownload(fileId, user);
    return new StreamableFile(file.contents, {
      type: file.mime,
      disposition: 'inline',
    });
  }
}
