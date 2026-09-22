import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { createReadStream } from 'node:fs';
import { PERMISSIONS } from '../../../common/constants/permission.constants';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { CreateExternalFileDto } from '../dto/create-external-file.dto';
import { UploadFileDto } from '../dto/upload-file.dto';
import { StorageService } from '../services/storage.service';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('upload')
  @Permissions(PERMISSIONS.MEDIA_UPLOAD)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    }),
  )
  upload(
    @Body() dto: UploadFileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.storage.upload(dto, file);
  }

  @Post('external')
  @Permissions(PERMISSIONS.MEDIA_UPLOAD)
  external(@Body() dto: CreateExternalFileDto) {
    return this.storage.createExternal(dto);
  }

  @Get('files/:id')
  @Public()
  async file(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const stored = await this.storage.localPath(id);
    return new StreamableFile(createReadStream(stored.path), {
      type: stored.entity.mimeType ?? undefined,
    });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.MEDIA_READ)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.storage.find(id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.MEDIA_DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.storage.remove(id);
  }
}
