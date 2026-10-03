import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileType } from '../enums/file-type.enum';

const FOLDERS = ['images', 'videos', 'documents', 'other'] as const;
const UUID_FILE_PATTERN = /^[a-f0-9-]{36}\.[a-z0-9]{1,16}$/i;
const STORAGE_KEY_PATTERN =
  /^(images|videos|documents|other)\/[a-f0-9-]{36}\.[a-z0-9]{1,16}$/i;

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
]);

export interface StoredLocalFile {
  storageKey: string;
  path: string;
  mimeType: string;
  fileSize: number;
  originalName: string;
}

@Injectable()
export class LocalStorageService implements OnModuleInit {
  private readonly rootPath: string;
  private readonly maxFileSize: number;

  constructor(private readonly config: ConfigService) {
    this.rootPath = resolve(
      this.config.get<string>('storage.localPath', './storage'),
    );
    this.maxFileSize = this.config.get<number>(
      'storage.maxFileSizeBytes',
      25 * 1024 * 1024,
    );
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(
      FOLDERS.map((folder) =>
        mkdir(resolve(this.rootPath, folder), { recursive: true }),
      ),
    );
  }

  async store(
    file: Express.Multer.File,
    fileType: FileType,
  ): Promise<StoredLocalFile> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A non-empty file is required');
    }
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `Files must be smaller than ${this.maxFileSize} bytes`,
      );
    }

    const detected = await fileTypeFromBuffer(file.buffer).catch(
      () => undefined,
    );
    if (!detected || !this.matchesType(fileType, detected.mime)) {
      throw new BadRequestException(
        `The uploaded file does not match file type ${fileType}`,
      );
    }

    const folder = this.folderFor(fileType);
    const storageKey = `${folder}/${randomUUID()}.${detected.ext}`;
    const path = this.pathForKey(storageKey);
    await writeFile(path, file.buffer, { flag: 'wx' });

    return {
      storageKey,
      path,
      mimeType: detected.mime,
      fileSize: file.size,
      originalName: file.originalname,
    };
  }

  pathForKey(storageKey: string): string {
    if (
      !STORAGE_KEY_PATTERN.test(storageKey) &&
      !UUID_FILE_PATTERN.test(storageKey)
    ) {
      throw new BadRequestException('Invalid storage key');
    }
    return resolve(this.rootPath, storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    await unlink(this.pathForKey(storageKey)).catch(() => undefined);
  }

  private folderFor(fileType: FileType): (typeof FOLDERS)[number] {
    if (fileType === FileType.IMAGE) return 'images';
    if (fileType === FileType.VIDEO) return 'videos';
    if (fileType === FileType.DOCUMENT) return 'documents';
    return 'other';
  }

  private matchesType(fileType: FileType, mimeType: string): boolean {
    if (fileType === FileType.IMAGE) {
      return [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
      ].includes(mimeType);
    }
    if (fileType === FileType.VIDEO) return mimeType.startsWith('video/');
    if (fileType === FileType.AUDIO) return mimeType.startsWith('audio/');
    if (fileType === FileType.DOCUMENT)
      return DOCUMENT_MIME_TYPES.has(mimeType);
    return true;
  }
}
