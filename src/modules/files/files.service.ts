import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-codes';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import {
  detectProfileImageMime,
  extensionForMime,
} from '../../integrations/storage/image-mime';
import {
  FILE_STORAGE_PROVIDER,
  type FileStorageProvider,
} from '../../integrations/storage/file-storage.provider';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: FileStorageProvider,
  ) {}

  fileUrl(fileId: string): string {
    const prefix = this.configService.get<string>('apiPrefix', 'api');
    const version = this.configService.get<string>('apiVersion', '1');
    return `/${prefix}/v${version}/files/${fileId}`;
  }

  async saveProfileImage(
    user: AuthenticatedUser,
    contents: Buffer,
  ): Promise<{ fileId: string; url: string }> {
    const maxBytes = this.configService.get<number>(
      'fileStorage.maxBytes',
      2_097_152,
    );
    if (contents.byteLength === 0 || contents.byteLength > maxBytes) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'file', issue: 'invalid size' }],
      });
    }

    const mime = detectProfileImageMime(contents);
    if (!mime) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: [{ field: 'file', issue: 'unsupported type' }],
      });
    }

    const storageKey = `profiles/${user.id}/${randomUUID()}.${extensionForMime(mime)}`;
    await this.storage.save(storageKey, contents);
    const file = await this.prisma.fileObject.create({
      data: {
        ownerUserId: user.id,
        storageKey,
        detectedMime: mime,
        byteSize: contents.byteLength,
        visibility: 'PUBLIC',
      },
    });
    return { fileId: file.id, url: this.fileUrl(file.id) };
  }

  async loadForDownload(
    fileId: string,
    user: AuthenticatedUser,
  ): Promise<{ mime: string; contents: Buffer }> {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });
    if (!file || file.deletedAt) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }
    if (file.visibility !== 'PUBLIC' && file.ownerUserId !== user.id) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      });
    }
    const contents = await this.storage.read(file.storageKey);
    return { mime: file.detectedMime, contents };
  }
}
