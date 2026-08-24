import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { FileStorageProvider, StoredFile } from './file-storage.provider';

@Injectable()
export class LocalFileStorageProvider implements FileStorageProvider {
  constructor(private readonly configService: ConfigService) {}

  async save(storageKey: string, contents: Buffer): Promise<StoredFile> {
    const absolute = this.absolutePath(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
    return { storageKey, byteSize: contents.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.absolutePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.absolutePath(storageKey));
    } catch (error) {
      if (isErrno(error) && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  private absolutePath(storageKey: string): string {
    const root = resolve(
      this.configService.get<string>('fileStorage.localDir', './storage'),
    );
    const relative = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    const absolute = normalize(join(root, relative));
    const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
    if (absolute !== root && !absolute.startsWith(rootWithSep)) {
      throw new Error('Invalid storage key');
    }
    return absolute;
  }
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
