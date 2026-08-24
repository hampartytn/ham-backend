export const FILE_STORAGE_PROVIDER = Symbol('FILE_STORAGE_PROVIDER');

export type StoredFile = {
  storageKey: string;
  byteSize: number;
};

export type FileStorageProvider = {
  save(storageKey: string, contents: Buffer): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
};
