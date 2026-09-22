import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { CreateExternalFileDto } from '../dto/create-external-file.dto';
import { UploadFileDto } from '../dto/upload-file.dto';
import { StorageFileEntity } from '../entities/storage-file.entity';
import { StorageType } from '../enums/storage-type.enum';
import { LocalStorageService } from './local-storage.service';

@Injectable()
export class StorageService {
  private readonly publicFilesUrl: string;

  constructor(
    @InjectRepository(StorageFileEntity)
    private readonly repository: Repository<StorageFileEntity>,
    private readonly local: LocalStorageService,
    private readonly config: ConfigService,
  ) {
    const publicUrl = this.config
      .get<string>('app.publicUrl', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const configuredPublicFilesUrl = this.config
      .get<string>('storage.publicBaseUrl', '')
      .trim();
    this.publicFilesUrl = (configuredPublicFilesUrl || `${publicUrl}/api/v1/storage/files`)
      .replace(/\/+$/, '');
  }

  async upload(
    dto: UploadFileDto,
    file: Express.Multer.File | undefined,
  ): Promise<StorageFileEntity> {
    if (this.config.get<string>('storage.provider', 'local') !== 'local') {
      throw new BadRequestException(
        'The configured storage provider is not available',
      );
    }
    if (!file) throw new BadRequestException('A file is required');

    const stored = await this.local.store(file, dto.fileType);
    try {
      const entity = this.repository.create({
        id: randomUUID(),
        storageType: StorageType.LOCAL,
        fileType: dto.fileType,
        originalName: stored.originalName,
        storageKey: stored.storageKey,
        url: '',
        mimeType: stored.mimeType,
        fileSize: String(stored.fileSize),
      });
      entity.url = `${this.publicFilesUrl}/${entity.id}`;
      return await this.repository.save(entity);
    } catch (error) {
      await this.local.remove(stored.storageKey);
      throw error;
    }
  }

  createExternal(dto: CreateExternalFileDto): Promise<StorageFileEntity> {
    return this.repository.save(
      this.repository.create({
        id: randomUUID(),
        storageType: StorageType.EXTERNAL,
        fileType: dto.fileType,
        originalName: dto.originalName?.trim() || null,
        storageKey: null,
        url: dto.url.trim(),
        mimeType: null,
        fileSize: null,
      }),
    );
  }

  async find(id: string): Promise<StorageFileEntity> {
    const file = await this.repository.findOneBy({ id });
    if (!file) throw new NotFoundException('Storage file not found');
    return file;
  }

  async localPath(
    id: string,
  ): Promise<{ entity: StorageFileEntity; path: string }> {
    const entity = await this.find(id);
    if (entity.storageType !== StorageType.LOCAL || !entity.storageKey) {
      throw new NotFoundException('Local storage file not found');
    }
    return { entity, path: this.local.pathForKey(entity.storageKey) };
  }

  pathForKey(storageKey: string): string {
    return this.local.pathForKey(storageKey);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.find(id);
    if (entity.storageKey) await this.local.remove(entity.storageKey);
    await this.repository.remove(entity);
  }

  async removeByKey(storageKey: string): Promise<void> {
    const entity = await this.repository.findOneBy({ storageKey });
    await this.local.remove(storageKey);
    if (entity) await this.repository.remove(entity);
  }
}
