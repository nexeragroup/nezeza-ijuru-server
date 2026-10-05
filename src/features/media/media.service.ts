import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, UpdateResult } from 'typeorm';
import {
  normalizePagination,
  toPaginatedResponse,
} from '../../common/utils/pagination.util';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import { ConferenceProgramsEntity } from '../conferences/entity/conference-programs.entity';
import { ConferencesEntity } from '../conferences/entity/conferences.entity';
import { EventsEntity } from '../events/entity/events.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import { ProgramsEntity } from '../programs/entity/programs.entity';
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
import { FileType } from '../../modules/storage/enums/file-type.enum';
import { StorageService } from '../../modules/storage/services/storage.service';

@Injectable()
export class MediaService {
  private readonly publicBaseUrl: string;

  constructor(
    @InjectRepository(MediaEntity)
    private readonly mediaRepository: Repository<MediaEntity>,
    @InjectRepository(ConferencesEntity)
    private readonly conferencesRepository: Repository<ConferencesEntity>,
    @InjectRepository(ProgramsEntity)
    private readonly programsRepository: Repository<ProgramsEntity>,
    @InjectRepository(ConferenceProgramsEntity)
    private readonly conferenceProgramsRepository: Repository<ConferenceProgramsEntity>,
    @InjectRepository(EventsEntity)
    private readonly eventsRepository: Repository<EventsEntity>,
    @InjectRepository(SessionsEntity)
    private readonly sessionsRepository: Repository<SessionsEntity>,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    const appPublicUrl = this.config
      .get<string>('app.publicUrl')
      ?.replace(/\/+$/, '');
    this.publicBaseUrl = `${appPublicUrl || 'http://localhost:3300'}/api/v1/media/files`;
  }

  async findForTarget(
    targetType: MediaTargetType,
    targetId: string,
  ): Promise<MediaEntity[]> {
    await this.assertTargetExists(targetType, targetId);
    return this.mediaRepository.find({
      where: { targetType, targetId },
      order: { isFeatured: 'DESC', createdAt: 'DESC' },
    });
  }

  async createExternal(dto: NewExternalMediaDto): Promise<MediaEntity> {
    await this.assertTargetExists(dto.targetType, dto.targetId);
    return this.mediaRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(MediaEntity);
      const media = await repository.save(
        repository.create({
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
      await this.syncFeaturedTargetImage(manager, media);
      return media;
    });
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
        '(media.targetType = :conferenceProgramType AND placement.id = media.targetId) OR placement.id = event.conferenceProgramId',
      )
      .leftJoin(
        ConferencesEntity,
        'conference',
        '(media.targetType = :conferenceType AND conference.id = media.targetId) OR conference.id = placement.conferenceId',
      )
      .leftJoin(
        ProgramsEntity,
        'program',
        'media.targetType = :programType AND program.id = media.targetId',
      )
      .where(
        '(media.targetType = :programType AND program.publicationStatus = :published) OR (media.targetType != :programType AND conference.publicationStatus = :published)',
      )
      .andWhere(
        '(media.targetType NOT IN (:...eventTargets) OR event.publicationStatus = :published)',
      )
      .andWhere(
        '(media.targetType != :sessionType OR session.publicationStatus = :published)',
      )
      .setParameters({
        sessionType: MediaTargetType.SESSION,
        eventType: MediaTargetType.EVENT,
        programType: MediaTargetType.PROGRAM,
        conferenceProgramType: MediaTargetType.CONFERENCE_PROGRAM,
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
            targetType,
            targetId,
            title,
            caption,
            altText,
            url,
            mediaType,
            sourceType,
            mimeType,
            isFeatured,
            createdAt,
          }) => ({
            id,
            targetType,
            targetId,
            title,
            caption,
            altText,
            url,
            mediaType,
            sourceType,
            mimeType,
            isFeatured,
            createdAt,
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
    const stored = await this.storage.upload(
      { fileType: this.fileTypeFor(dto.mediaType) },
      file,
    );
    if (!stored.storageKey) {
      await this.storage.remove(stored.id);
      throw new BadRequestException('The uploaded file was not stored locally');
    }
    const storageKey = stored.storageKey;
    try {
      return await this.mediaRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(MediaEntity);
        const media = await repository.save(
          repository.create({
            ...dto,
            sourceType: MediaSourceType.UPLOAD,
            url: `${this.publicBaseUrl}/${storageKey}`,
            storageKey,
            mimeType: stored.mimeType,
            fileSize: String(stored.fileSize),
            caption: dto.caption ?? null,
            altText: dto.altText ?? null,
            durationSeconds: dto.durationSeconds ?? null,
            isFeatured: dto.isFeatured ?? false,
          }),
        );
        await this.syncFeaturedTargetImage(manager, media);
        return media;
      });
    } catch (error) {
      await this.storage.removeByKey(storageKey);
      throw error;
    }
  }

  async publicFile(key: string) {
    if (
      !/^(?:[a-f0-9-]{36}\.[a-z0-9]+|(images|videos|documents|other)\/[a-f0-9-]{36}\.[a-z0-9]+)$/i.test(
        key,
      )
    ) {
      throw new NotFoundException();
    }
    const media = await this.mediaRepository.findOneBy({ storageKey: key });
    if (!media) throw new NotFoundException();
    if (media.targetType === MediaTargetType.PROGRAM) {
      const program = await this.programsRepository.findOneBy({
        id: media.targetId,
        publicationStatus: PublicationStatus.PUBLISHED,
      });
      if (!program) throw new NotFoundException();
      return {
        path: this.storage.pathForKey(key),
        mediaType: media.mediaType,
        mimeType: media.mimeType,
      };
    }
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
      path: this.storage.pathForKey(key),
      mediaType: media.mediaType,
      mimeType: media.mimeType,
    };
  }

  async update(id: string, dto: UpdateMediaDto): Promise<MediaEntity> {
    const existing = await this.findOne(id);
    if (dto.targetType || dto.targetId) {
      await this.assertTargetExists(
        dto.targetType ?? existing.targetType,
        dto.targetId ?? existing.targetId,
      );
    }
    return this.mediaRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(MediaEntity);
      const media = await this.findOne(id, repository);
      const originalCoverImage = this.isCoverImage(media);
      const originalTargetType = media.targetType;
      const originalTargetId = media.targetId;
      Object.assign(media, dto);
      const saved = await repository.save(media);

      if (
        originalCoverImage &&
        (!this.isCoverImage(saved) ||
          saved.targetType !== originalTargetType ||
          saved.targetId !== originalTargetId ||
          !saved.isFeatured)
      ) {
        await this.clearFeaturedTargetImage(
          manager,
          originalTargetType,
          originalTargetId,
          saved.id,
        );
      }
      await this.syncFeaturedTargetImage(manager, saved);
      return saved;
    });
  }

  async remove(id: string): Promise<void> {
    const storageKey = await this.mediaRepository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(MediaEntity);
        const media = await this.findOne(id, repository);
        if (this.isCoverImage(media)) {
          await this.clearFeaturedTargetImage(
            manager,
            media.targetType,
            media.targetId,
            media.id,
          );
        }
        await repository.remove(media);
        return media.storageKey;
      },
    );
    if (storageKey) {
      await this.storage.removeByKey(storageKey);
    }
  }

  private fileTypeFor(type: MediaType): FileType {
    if (type === MediaType.IMAGE) return FileType.IMAGE;
    if (type === MediaType.VIDEO) return FileType.VIDEO;
    if (type === MediaType.AUDIO || type === MediaType.PODCAST)
      return FileType.AUDIO;
    if (type === MediaType.DOCUMENT) return FileType.DOCUMENT;
    return FileType.OTHER;
  }

  private async findOne(
    id: string,
    repository: Repository<MediaEntity> = this.mediaRepository,
  ): Promise<MediaEntity> {
    const media = await repository.findOneBy({ id });
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }

  private async assertTargetExists(
    type: MediaTargetType,
    id: string,
  ): Promise<void> {
    const repository = {
      [MediaTargetType.CONFERENCE]: this.conferencesRepository,
      [MediaTargetType.PROGRAM]: this.programsRepository,
      [MediaTargetType.CONFERENCE_PROGRAM]: this.conferenceProgramsRepository,
      [MediaTargetType.EVENT]: this.eventsRepository,
      [MediaTargetType.SESSION]: this.sessionsRepository,
    }[type] as Repository<{ id: string }>;
    if (!(await repository.exists({ where: { id } }))) {
      throw new NotFoundException(`${type.toLowerCase()} target not found`);
    }
  }

  private isCoverImage(media: MediaEntity): boolean {
    return (
      (media.targetType === MediaTargetType.CONFERENCE ||
        media.targetType === MediaTargetType.PROGRAM) &&
      media.mediaType === MediaType.IMAGE
    );
  }

  private async syncFeaturedTargetImage(
    manager: EntityManager,
    media: MediaEntity,
  ): Promise<void> {
    if (!this.isCoverImage(media)) return;
    if (!media.isFeatured) {
      await this.clearFeaturedTargetImage(
        manager,
        media.targetType,
        media.targetId,
        media.id,
      );
      return;
    }

    const mediaRepository = manager.getRepository(MediaEntity);
    await mediaRepository.update(
      {
        targetType: media.targetType,
        targetId: media.targetId,
        mediaType: MediaType.IMAGE,
      },
      { isFeatured: false },
    );
    await mediaRepository.update({ id: media.id }, { isFeatured: true });
    if (media.targetType === MediaTargetType.CONFERENCE) {
      await manager.getRepository(ConferencesEntity).update(
        { id: media.targetId },
        { featuredMediaId: media.id },
      );
    } else {
      await manager.getRepository(ProgramsEntity).update(
        { id: media.targetId },
        { featuredMediaId: media.id },
      );
    }
  }

  private clearFeaturedTargetImage(
    manager: EntityManager,
    targetType: MediaTargetType,
    targetId: string,
    mediaId: string,
  ): Promise<UpdateResult> {
    const repository = manager.getRepository(
      targetType === MediaTargetType.PROGRAM ? ProgramsEntity : ConferencesEntity,
    );
    return repository.update(
      { id: targetId, featuredMediaId: mediaId },
      { featuredMediaId: null },
    );
  }
}
