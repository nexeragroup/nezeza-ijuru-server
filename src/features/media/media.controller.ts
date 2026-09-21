import {
  Body,
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'node:fs';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MediaTargetType, MediaType } from '../../common/enums/media.enum';
import {
  MediaMetadataDto,
  NewExternalMediaDto,
  UpdateMediaDto,
} from './dto/media.dto';
import { MediaEntity } from './entity/media.entity';
import { LivestreamService } from './livestream.service';
import { MediaService } from './media.service';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly livestreams: LivestreamService,
  ) {}

  @Get('published')
  @Public()
  published(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Query('mediaTypes') mediaTypes?: string,
  ) {
    const selectedTypes = mediaTypes?.split(',').filter(Boolean);
    if (selectedTypes?.some((type) => !Object.values(MediaType).includes(type as MediaType))) {
      throw new BadRequestException('mediaTypes contains an unsupported media type');
    }
    return this.mediaService.findPublished({
      page,
      limit,
      mediaTypes: selectedTypes as MediaType[] | undefined,
    });
  }

  @Get('livestreams')
  @Public()
  livestreamList() {
    return this.livestreams.findPublishedLivestreams();
  }

  @Get()
  @Public()
  list(
    @Query('targetType', new ParseEnumPipe(MediaTargetType))
    targetType: MediaTargetType,
    @Query('targetId', ParseUUIDPipe) targetId: string,
  ): Promise<MediaEntity[]> {
    return this.mediaService.findForTarget(targetType, targetId);
  }

  @Get(':key')
  @Public()
  async file(@Param('key') key: string): Promise<StreamableFile> {
    const media = await this.mediaService.publicFile(key);
    return new StreamableFile(createReadStream(media.path), {
      type: media.mimeType ?? undefined,
    });
  }

  @Post('external')
  @Permissions(PERMISSIONS.MEDIA_UPLOAD)
  createExternal(@Body() dto: NewExternalMediaDto): Promise<MediaEntity> {
    return this.mediaService.createExternal(dto);
  }

  @Post('external/bulk')
  @Permissions(PERMISSIONS.MEDIA_UPLOAD)
  createBulkExternal(
    @Body(new ParseArrayPipe({ items: NewExternalMediaDto }))
    payload: NewExternalMediaDto[],
  ): Promise<MediaEntity[]> {
    return this.mediaService.createBulkExternal(payload);
  }

  @Post('upload')
  @Permissions(PERMISSIONS.MEDIA_UPLOAD)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_BYTES, files: 1 },
    }),
  )
  upload(
    @Body() dto: MediaMetadataDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MediaEntity> {
    return this.mediaService.upload(dto, file);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.MEDIA_UPLOAD)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaDto,
  ): Promise<MediaEntity> {
    return this.mediaService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.MEDIA_DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.mediaService.remove(id);
  }
}
