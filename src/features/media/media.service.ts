import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Repository } from 'typeorm';
import {
  normalizePagination,
  toPaginatedResponse,
} from '../../common/utils/pagination.util';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import { ConferenceProgramsEntity } from '../conferences/entity/conference-programs.entity';
import { ConferencesEntity } from '../conferences/entity/conferences.entity';
import { EventsEntity } from '../events/entity/events.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import {
  MediaMetadataDto,
  NewExternalMediaDto,
  UpdateMediaDto,
} from './dto/media.dto';
import { MediaEntity } from './entity/media.entity';
import {
  MediaTargetType,
  MediaSourceType,
  MediaType,
} from '../../common/enums/media.enum';
import { BULK_CREATE_LIMIT } from '../../common/constants/bulk.constant';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly localPath: string;
  private readonly publicBaseUrl: string;

  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepository: Repository<MediaEntity>,
    @InjectRepository(ConferencesEntity)
    private readonly conferencesRepository: Repository<ConferencesEntity>,
    @InjectRepository(ConferenceProgramsEntity)
    private readonly conferenceProgramsRepository: Repository<ConferenceProgramsEntity>,
    @InjectRepository(EventsEntity)
    private readonly eventsRepository: Repository<EventsEntity>,
    @InjectRepository(SessionsEntity)
    private readonly sessionsRepository: Repository<SessionsEntity>,
    private readonly config: ConfigService,
  ) {
    this.localPath = resolve(
      this.config.get<string>('storage.localPath', './storage'),
    );
    const appPublicUrl = this.config.get<string>('app.publicUrl')?.replace(/\/+$/, '');
    this.publicBaseUrl = this.config
      .get<string>('storage.publicBaseUrl', `${appPublicUrl || 'http://localhost:3300'}/media`)
      .replace(/\/$/, '');
  }

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('storage.provider', 'local') === 'local') {
      await mkdir(this.localPath, { recursive: true });
    }
  }

  async findForTarget(
    targetType: MediaTargetType,
    targetId: string,
  ): Promise<MediaEntity[]> {
    await this.assertPublishedTargetExists(targetType, targetId);
    return this.mediaRepository.find({
      where: { targetType, targetId },
      order: { isFeatured: 'DESC', createdAt: 'DESC' },
    });
  }

  async createExternal(dto: NewExternalMediaDto): Promise<MediaEntity> {
    await this.assertTargetExists(dto.targetType, dto.targetId);
    return this.mediaRepository.save(
      this.mediaRepository.create({
        ...dto,
        sourceType: MediaSourceType.EXTERNAL,
        caption: dto.caption ?? null,
        altText: dto.altText ?? null,
        storageKey: null,
        mimeType: null,
        fileSize: null,
        durationSeconds: dto.durationSeconds ?? null,
        isFeatured: dto.isFeatured ?? false,
      }),
    );
  }

  async createBulkExternal(
    payloads: NewExternalMediaDto[],
  ): Promise<MediaEntity[]> {
    if (payloads.length === 0 || payloads.length > BULK_CREATE_LIMIT) {
      throw new BadRequestException(
        `Submit between 1 and ${BULK_CREATE_LIMIT} media items`,
      );
    }
    const media: MediaEntity[] = [];
    for (const payload of payloads) {
      media.push(await this.createExternal(payload));
    }
    return media;
  }

  async findPublished(options: {
    page?: number;
    limit?: number;
    mediaTypes?: MediaType[];
  }) {
    const pagination = normalizePagination(options);
    // Program placements inherit conference visibility; events and sessions
    // must also be published. TypeORM excludes soft-deleted joined entities.
    const query = this.mediaRepository
      .createQueryBuilder('media')
      .leftJoin(
        SessionsEntity,
        'session',
        'media.targetType = :sessionType AND session.id = media.targetId',
      )
      .leftJoin(
        EventsEntity,
        'event',
        '(media.targetType = :eventType AND event.id = media.targetId) OR event.id = session.eventId',
      )
      .leftJoin(
        ConferenceProgramsEntity,
        'placement',
        '(media.targetType = :programType AND placement.id = media.targetId) OR placement.id = event.conferenceProgramId',
      )
      .innerJoin(
        ConferencesEntity,
        'conference',
        '(media.targetType = :conferenceType AND conference.id = media.targetId) OR conference.id = placement.conferenceId',
      )
      .where('conference.publicationStatus = :published')
      .andWhere(
        '(media.targetType NOT IN (:...eventTargets) OR event.publicationStatus = :published)',
      )
      .andWhere(
        '(media.targetType != :sessionType OR session.publicationStatus = :published)',
      )
      .setParameters({
        sessionType: MediaTargetType.SESSION,
        eventType: MediaTargetType.EVENT,
        programType: MediaTargetType.CONFERENCE_PROGRAM,
        conferenceType: MediaTargetType.CONFERENCE,
        eventTargets: [MediaTargetType.EVENT, MediaTargetType.SESSION],
        published: PublicationStatus.PUBLISHED,
      })
      .orderBy('media.createdAt', 'DESC')
      .addOrderBy('media.id', 'DESC')
      .skip(pagination.skip)
      .take(pagination.take);
    if (options.mediaTypes?.length) {
      query.andWhere('media.mediaType IN (:...mediaTypes)', {
        mediaTypes: options.mediaTypes,
      });
    }
    const [items, total] = await query.getManyAndCount();
    return toPaginatedResponse(
      [
        items.map(
          ({
            id,
            title,
            caption,
            altText,
            url,
            mediaType,
            sourceType,
            mimeType,
          }) => ({
            id,
            title,
            caption,
            altText,
            url,
            mediaType,
            sourceType,
            mimeType,
          }),
        ),
        total,
      ],
      pagination,
    );
  }

  async upload(
    dto: MediaMetadataDto,
    file: Express.Multer.File | undefined,
  ): Promise<MediaEntity> {
    if (!file) throw new BadRequestException('A media file is required');
    if (this.config.get<string>('storage.provider', 'local') !== 'local') {
      throw new BadRequestException(
        'The configured storage provider is not available',
      );
    }
    await this.assertTargetExists(dto.targetType, dto.targetId);
    const detected = await this.detectFile(file.buffer, dto.mediaType);
    const extension = `.${detected.ext}`;
    const storageKey = `${randomUUID()}${extension}`;
    await writeFile(resolve(this.localPath, storageKey), file.buffer, {
      flag: 'wx',
    });
    try {
      return await this.mediaRepository.save(
        this.mediaRepository.create({
          ...dto,
          sourceType: MediaSourceType.UPLOAD,
          url: `${this.publicBaseUrl}/${storageKey}`,
          storageKey,
          mimeType: detected.mime,
          fileSize: String(file.size),
          caption: dto.caption ?? null,
          altText: dto.altText ?? null,
          durationSeconds: dto.durationSeconds ?? null,
          isFeatured: dto.isFeatured ?? false,
        }),
      );
    } catch (error) {
      await unlink(resolve(this.localPath, storageKey)).catch(() => undefined);
      throw error;
    }
  }

  async detectFile(buffer: Buffer, type: MediaType) {
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(buffer).catch(() => undefined);
    if (!detected)
      throw new BadRequestException('Unsupported or invalid media file');
    this.assertFileMatchesType(type, detected.mime);
    return detected;
  }

  async detectStoredFile(path: string, type: MediaType) {
    const { fileTypeFromFile } = await import('file-type');
    const detected = await fileTypeFromFile(path).catch(() => undefined);
    if (!detected)
      throw new BadRequestException('Unsupported or invalid media file');
    this.assertFileMatchesType(type, detected.mime);
    return detected;
  }

  async publicFile(key: string) {
    if (!/^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(key)) throw new NotFoundException();
    const media = await this.mediaRepository.findOneBy({ storageKey: key });
    if (!media) throw new NotFoundException();
    let conferenceId: string;
    if (media.targetType === MediaTargetType.CONFERENCE)
      conferenceId = media.targetId;
    else {
      let placementId: string;
      if (media.targetType === MediaTargetType.CONFERENCE_PROGRAM)
        placementId = media.targetId;
      else {
        let eventId = media.targetId;
        if (media.targetType === MediaTargetType.SESSION) {
          const session = await this.sessionsRepository.findOneBy({
            id: media.targetId,
            publicationStatus: PublicationStatus.PUBLISHED,
          });
          if (!session) throw new NotFoundException();
          eventId = session.eventId;
        }
        const event = await this.eventsRepository.findOneBy({
          id: eventId,
          publicationStatus: PublicationStatus.PUBLISHED,
        });
        if (!event) throw new NotFoundException();
        placementId = event.conferenceProgramId;
      }
      const placement = await this.conferenceProgramsRepository.findOneBy({
        id: placementId,
      });
      if (!placement) throw new NotFoundException();
      conferenceId = placement.conferenceId;
    }
    if (
      !(await this.conferencesRepository.existsBy({
        id: conferenceId,
        publicationStatus: PublicationStatus.PUBLISHED,
      }))
    )
      throw new NotFoundException();
    return {
      path: resolve(this.localPath, key),
      mediaType: media.mediaType,
      mimeType: media.mimeType,
    };
  }

  private assertFileMatchesType(type: MediaType, mimeType: string): void {
    const matches = {
      [MediaType.IMAGE]: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ].includes(mimeType),
      [MediaType.VIDEO]: mimeType.startsWith('video/'),
      [MediaType.AUDIO]: mimeType.startsWith('audio/'),
      [MediaType.PODCAST]: mimeType.startsWith('audio/'),
      [MediaType.DOCUMENT]: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ].includes(mimeType),
      [MediaType.OTHER]: false,
    }[type];
    if (!matches) {
      throw new BadRequestException(
        `The uploaded file does not match media type ${type}`,
      );
    }
  }

  async update(id: string, dto: UpdateMediaDto): Promise<MediaEntity> {
    const media = await this.findOne(id);
    if (dto.targetType || dto.targetId) {
      await this.assertTargetExists(
        dto.targetType ?? media.targetType,
        dto.targetId ?? media.targetId,
      );
    }
    Object.assign(media, dto);
    return this.mediaRepository.save(media);
  }

  async remove(id: string): Promise<void> {
    const media = await this.findOne(id);
    await this.mediaRepository.remove(media);
    if (media.storageKey) {
      await unlink(resolve(this.localPath, media.storageKey)).catch(
        () => undefined,
      );
    }
  }

  private async findOne(id: string): Promise<MediaEntity> {
    const media = await this.mediaRepository.findOneBy({ id });
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }

  private async assertTargetExists(
    type: MediaTargetType,
    id: string,
  ): Promise<void> {
    const repository = {
      [MediaTargetType.CONFERENCE]: this.conferencesRepository,
      [MediaTargetType.CONFERENCE_PROGRAM]: this.conferenceProgramsRepository,
      [MediaTargetType.EVENT]: this.eventsRepository,
      [MediaTargetType.SESSION]: this.sessionsRepository,
    }[type] as Repository<{ id: string }>;
    if (!(await repository.exists({ where: { id } }))) {
      throw new NotFoundException(`${type.toLowerCase()} target not found`);
    }
  }

  private async assertPublishedTargetExists(
    type: MediaTargetType,
    id: string,
  ): Promise<void> {
    if (type === MediaTargetType.CONFERENCE) {
      if (!(await this.conferencesRepository.existsBy({ id, publicationStatus: PublicationStatus.PUBLISHED }))) {
        throw new NotFoundException('Published conference not found');
      }
      return;
    }

    if (type === MediaTargetType.CONFERENCE_PROGRAM) {
      const placement = await this.conferenceProgramsRepository.findOneBy({ id });
      if (!placement || !(await this.conferencesRepository.existsBy({
        id: placement.conferenceId,
        publicationStatus: PublicationStatus.PUBLISHED,
      }))) {
        throw new NotFoundException('Published conference program not found');
      }
      return;
    }

    const target = type === MediaTargetType.EVENT
      ? await this.eventsRepository.findOneBy({ id, publicationStatus: PublicationStatus.PUBLISHED })
      : await this.sessionsRepository.findOneBy({ id, publicationStatus: PublicationStatus.PUBLISHED });
    const eventId = type === MediaTargetType.EVENT
      ? id
      : (target as SessionsEntity | null)?.eventId;
    const event = eventId
      ? await this.eventsRepository.findOneBy({
          id: eventId,
          publicationStatus: PublicationStatus.PUBLISHED,
        })
      : null;
    const placement = event
      ? await this.conferenceProgramsRepository.findOneBy({ id: event.conferenceProgramId })
      : null;

    if (!target || !event || !placement || !(await this.conferencesRepository.existsBy({
      id: placement.conferenceId,
      publicationStatus: PublicationStatus.PUBLISHED,
    }))) {
      throw new NotFoundException('Published media target not found');
    }
  }
}
