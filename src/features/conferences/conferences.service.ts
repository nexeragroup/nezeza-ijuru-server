import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { ProgramsEntity } from '../programs/entity/programs.entity';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import {
  ConferenceProgramDto,
  NewConference,
  UpdateConference,
} from './dto/conference.dto';
import { ConferenceProgramsEntity } from './entity/conference-programs.entity';
import { ConferencesEntity } from './entity/conferences.entity';
import { MediaEntity } from '../media/entity/media.entity';
import { EventsEntity } from '../events/entity/events.entity';
import { MediaTargetType } from '../../common/enums/media.enum';
import { BULK_CREATE_LIMIT } from '../../common/constants/bulk.constant';

export interface PublishedConferenceProgramDetails {
  conference: ConferencesEntity;
  conferenceProgram: ConferenceProgramsEntity;
  media: MediaEntity[];
}

@Injectable()
export class ConferencesService {
  constructor(
    @InjectRepository(ConferencesEntity)
    private readonly conferencesRepository: Repository<ConferencesEntity>,
    @InjectRepository(ConferenceProgramsEntity)
    private readonly conferenceProgramsRepository: Repository<ConferenceProgramsEntity>,
    @InjectRepository(ProgramsEntity)
    private readonly programsRepository: Repository<ProgramsEntity>,
    @InjectRepository(MediaEntity)
    private readonly mediaRepository: Repository<MediaEntity>,
  ) {}

  async createConference(dto: NewConference): Promise<ConferencesEntity> {
    this.validateDates(dto.startDate, dto.endDate);
    const slug = this.toSlug(dto.slug ?? dto.title);
    await this.ensureUnique(dto.year, slug);

    return this.conferencesRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ConferencesEntity);
      const programRepository = manager.getRepository(ProgramsEntity);
      const conferenceProgramRepository = manager.getRepository(
        ConferenceProgramsEntity,
      );
      const programIds = dto.programs.map((item) => item.programId);
      const uniqueProgramIds = [...new Set(programIds)];
      if (programIds.length !== uniqueProgramIds.length) {
        throw new BadRequestException(
          'A conference cannot contain the same program more than once',
        );
      }
      const programs = await programRepository.findBy({
        id: In(uniqueProgramIds),
      });
      if (programs.length !== uniqueProgramIds.length) {
        const foundIds = new Set(programs.map((program) => program.id));
        const missingIds = uniqueProgramIds.filter((id) => !foundIds.has(id));
        throw new NotFoundException(
          `Programs not found: ${missingIds.join(', ')}`,
        );
      }
      if (dto.isCurrent) {
        await repository.update({ isCurrent: true }, { isCurrent: false });
      }
      const { programs: programAssignments, ...conferenceDto } = dto;
      const conference = repository.create({
        ...conferenceDto,
        slug,
        title: dto.title.trim(),
        theme: dto.theme.trim(),
        summary: this.cleanOptionalText(dto.summary),
        description: this.cleanOptionalText(dto.description),
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        featuredMediaId: dto.featuredMediaId ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      });
      const savedConference = await repository.save(conference);
      const relations = programAssignments.map((assignment) =>
        conferenceProgramRepository.create({
          conferenceId: savedConference.id,
          programId: assignment.programId,
          conferenceSummary: this.cleanOptionalText(
            assignment.conferenceSummary,
          ),
          isFeatured: assignment.isFeatured ?? false,
        }),
      );
      await conferenceProgramRepository.save(relations);
      return savedConference;
    });
  }

  async createBulkConferences(
    payloads: NewConference[],
  ): Promise<ConferencesEntity[]> {
    if (payloads.length === 0 || payloads.length > BULK_CREATE_LIMIT) {
      throw new BadRequestException(
        `Submit between 1 and ${BULK_CREATE_LIMIT} conferences`,
      );
    }
    const conferences: ConferencesEntity[] = [];
    for (const payload of payloads) {
      conferences.push(await this.createConference(payload));
    }
    return conferences;
  }

  findAllConferences(): Promise<ConferencesEntity[]> {
    return this.conferencesRepository.find({
      relations: { programs: { program: true } },
    });
  }

  async findPublishedConferences(): Promise<ConferencesEntity[]> {
    const conferences = await this.conferencesRepository.find({
      where: { publicationStatus: PublicationStatus.PUBLISHED },
      order: { year: 'DESC' },
    });
    return conferences;
  }

  async findPublishedConferenceBySlug(
    slug: string,
  ): Promise<ConferencesEntity> {
    const conference = await this.conferencesRepository.findOne({
      where: {
        slug: this.toSlug(slug),
        publicationStatus: PublicationStatus.PUBLISHED,
      },
      relations: {
        programs: {
          program: true,
          events: { defaultVenue: true, sessions: { venue: true } },
        },
      },
      order: {
        programs: { events: { startAt: 'ASC' } },
      },
    });
    if (!conference)
      throw new NotFoundException('Published conference not found');
    this.filterPublishedConferenceContent(conference);
    conference.media = await this.findMediaForTarget(
      MediaTargetType.CONFERENCE,
      conference.id,
    );
    return conference;
  }

  async findCurrentConference(): Promise<ConferencesEntity> {
    const conference = await this.conferencesRepository.findOne({
      where: {
        isCurrent: true,
        publicationStatus: PublicationStatus.PUBLISHED,
      },
      relations: { programs: { program: true } },
    });
    if (!conference)
      throw new NotFoundException('Current conference not found');
    return conference;
  }

  async findConferenceByID(
    id: string,
    withDeleted = false,
  ): Promise<ConferencesEntity> {
    const conference = await this.conferencesRepository.findOne({
      where: { id },
      withDeleted,
      relations: {
        programs: { program: true, events: { sessions: true } },
      },
    });
    if (!conference)
      throw new NotFoundException(`Conference with ID ${id} not found`);
    return conference;
  }

  async findPublishedConferenceById(id: string): Promise<ConferencesEntity> {
    const conference = await this.conferencesRepository.findOne({
      where: { id, publicationStatus: PublicationStatus.PUBLISHED },
      relations: {
        programs: {
          program: true,
          events: { defaultVenue: true, sessions: { venue: true } },
        },
      },
      order: {
        programs: { events: { startAt: 'ASC' } },
      },
    });
    if (!conference)
      throw new NotFoundException('Published conference not found');
    this.filterPublishedConferenceContent(conference);
    conference.media = await this.findMediaForTarget(
      MediaTargetType.CONFERENCE,
      conference.id,
    );
    return conference;
  }

  async findPublishedConferenceProgram(
    conferenceId: string,
    conferenceProgramId: string,
  ): Promise<PublishedConferenceProgramDetails> {
    const conference = await this.conferencesRepository.findOneBy({
      id: conferenceId,
      publicationStatus: PublicationStatus.PUBLISHED,
    });
    if (!conference)
      throw new NotFoundException('Published conference not found');

    const conferenceProgram = await this.conferenceProgramsRepository.findOne({
      where: { id: conferenceProgramId, conferenceId },
      relations: {
        program: true,
        events: { defaultVenue: true, sessions: { venue: true } },
      },
      order: {
        events: {
          startAt: 'ASC',
          sessions: { displayOrder: 'ASC', startAt: 'ASC' },
        },
      },
    });
    if (!conferenceProgram) {
      throw new NotFoundException(
        'Published program was not found in this conference',
      );
    }

    conferenceProgram.events = this.normalizeConferenceEvents(
      conferenceProgram.events,
    );
    const mediaTargets = [
      {
        targetType: MediaTargetType.CONFERENCE_PROGRAM,
        targetId: conferenceProgram.id,
      },
      ...conferenceProgram.events.map((event) => ({
        targetType: MediaTargetType.EVENT,
        targetId: event.id,
      })),
      ...conferenceProgram.events.flatMap((event) =>
        event.sessions.map((session) => ({
          targetType: MediaTargetType.SESSION,
          targetId: session.id,
        })),
      ),
    ];
    const media = await this.mediaRepository.find({
      where: mediaTargets,
      order: { isFeatured: 'DESC', createdAt: 'DESC' },
    });
    return { conference, conferenceProgram, media };
  }

  async updateConference(
    id: string,
    dto: UpdateConference,
  ): Promise<ConferencesEntity> {
    const conference = await this.findConferenceByID(id);
    const year = dto.year ?? conference.year;
    const slug = dto.slug ? this.toSlug(dto.slug) : conference.slug;
    const startDate = dto.startDate ?? conference.startDate ?? undefined;
    const endDate = dto.endDate ?? conference.endDate ?? undefined;
    this.validateDates(startDate, endDate);
    await this.ensureUnique(year, slug, id);

    await this.conferencesRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ConferencesEntity);
      if (dto.isCurrent) {
        await repository.update({ isCurrent: true }, { isCurrent: false });
      }
      Object.assign(conference, {
        ...dto,
        year,
        slug,
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.theme !== undefined ? { theme: dto.theme.trim() } : {}),
        ...(dto.summary !== undefined
          ? { summary: this.cleanOptionalText(dto.summary) }
          : {}),
        ...(dto.description !== undefined
          ? { description: this.cleanOptionalText(dto.description) }
          : {}),
        ...(dto.scheduledAt !== undefined
          ? { scheduledAt: new Date(dto.scheduledAt) }
          : {}),
      });
      await repository.save(conference);
    });
    return this.findConferenceByID(id);
  }

  async assignProgram(
    conferenceId: string,
    programId: string,
    dto: ConferenceProgramDto,
  ): Promise<ConferencesEntity> {
    await this.findConferenceByID(conferenceId);
    const program = await this.programsRepository.findOneBy({ id: programId });
    if (!program)
      throw new NotFoundException(`Program with ID ${programId} not found`);

    const existing = await this.conferenceProgramsRepository.findOneBy({
      conferenceId,
      programId,
    });
    const relation =
      existing ??
      this.conferenceProgramsRepository.create({ conferenceId, programId });
    Object.assign(relation, {
      conferenceSummary: this.cleanOptionalText(dto.conferenceSummary),
      isFeatured: dto.isFeatured ?? relation.isFeatured ?? false,
    });
    await this.conferenceProgramsRepository.save(relation);
    return this.findConferenceByID(conferenceId);
  }

  async removeProgram(conferenceId: string, programId: string): Promise<void> {
    const result = await this.conferenceProgramsRepository.delete({
      conferenceId,
      programId,
    });
    if (!result.affected) {
      throw new NotFoundException('Program is not assigned to this conference');
    }
  }

  async softDeleteConference(id: string): Promise<void> {
    await this.findConferenceByID(id);
    await this.conferencesRepository.softDelete(id);
  }

  async restoreConference(id: string): Promise<ConferencesEntity> {
    await this.findConferenceByID(id, true);
    await this.conferencesRepository.restore(id);
    return this.findConferenceByID(id);
  }

  private filterPublishedConferenceContent(
    conference: ConferencesEntity,
  ): void {
    conference.programs = (conference.programs ?? []).map((assignment) => ({
      ...assignment,
      events: this.normalizeConferenceEvents(assignment.events),
    }));
  }

  private normalizeConferenceEvents(
    events: EventsEntity[] = [],
  ): EventsEntity[] {
    return events.map((event) => ({
      ...event,
      sessions: event.sessions ?? [],
    }));
  }

  private findMediaForTarget(
    targetType: MediaTargetType,
    targetId: string,
  ): Promise<MediaEntity[]> {
    return this.mediaRepository.find({
      where: { targetType, targetId },
      order: { isFeatured: 'DESC', createdAt: 'DESC' },
    });
  }

  private async ensureUnique(
    year: number,
    slug: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.conferencesRepository.findOne({
      where: [
        { year, ...(excludedId ? { id: Not(excludedId) } : {}) },
        { slug, ...(excludedId ? { id: Not(excludedId) } : {}) },
      ],
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException(
        existing.year === year
          ? `Conference year ${year} already exists`
          : `Conference slug ${slug} already exists`,
      );
    }
  }

  private validateDates(startDate?: string, endDate?: string): void {
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException(
        'Conference end date must be on or after start date',
      );
    }
  }

  private toSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new BadRequestException('Conference slug cannot be empty');
    return slug;
  }

  private cleanOptionalText(value?: string): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }
}
