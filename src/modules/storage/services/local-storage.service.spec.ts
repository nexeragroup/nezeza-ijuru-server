import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageService } from './local-storage.service';
import { FileType } from '../enums/file-type.enum';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('LocalStorageService', () => {
  let root: string;
  let service: LocalStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nezeza-storage-'));
    service = new LocalStorageService({
      get: (key: string, fallback: unknown) =>
        key === 'storage.localPath' ? root : fallback,
    } as ConfigService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('detects the file content and stores images under images', async () => {
    const stored = await service.store(
      {
        buffer: png,
        size: png.length,
        originalname: 'evangelism.png',
      } as Express.Multer.File,
      FileType.IMAGE,
    );

    expect(stored.storageKey).toMatch(/^images\/[a-f0-9-]{36}\.png$/i);
    expect(stored.mimeType).toBe('image/png');
    expect(await readFile(stored.path)).toEqual(png);
  });

  it('rejects content that does not match the selected file type', async () => {
    await expect(
      service.store(
        {
          buffer: Buffer.from('not an image'),
          size: 12,
          originalname: 'evangelism.png',
        } as Express.Multer.File,
        FileType.IMAGE,
      ),
    ).rejects.toThrow('does not match file type IMAGE');
  });
});
