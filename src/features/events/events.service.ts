import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ConferenceProgramsEntity } from '../conferences/entity/conference-programs.entity';
import { VenuesEntity } from '../venues/entity/venues.entity';
import { NewEvent, UpdateEvent } from './dto/event.dto';
import { EventsEntity } from './entity/events.entity';
import { BULK_CREATE_LIMIT } from '../../common/constants/bulk.constant';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventsEntity)
    private readonly eventsRepository: Repository<EventsEntity>,
    @InjectRepository(ConferenceProgramsEntity)
    private readonly conferenceProgramsRepository: Repository<ConferenceProgramsEntity>,
    @InjectRepository(VenuesEntity)
    private readonly venuesRepository: Repository<VenuesEntity>,
  ) {}

  async createEvent(dto: NewEvent): Promise<EventsEntity> {
    this.validateDates(dto);
    await this.findConferenceProgram(dto.conferenceProgramId);
    await this.validateVenue(dto.defaultVenueId);
    const slug = this.toSlug(dto.slug ?? dto.title);
    await this.ensureUnique(dto.conferenceProgramId, slug);

    const event = this.eventsRepository.create({
      ...dto,
      slug,
      title: dto.title.trim(),
      eventType: dto.eventType.trim().toUpperCase(),
      summary: this.cleanOptionalText(dto.summary),
      description: this.cleanOptionalText(dto.description),
      defaultVenueId: dto.defaultVenueId ?? null,
      timezone: dto.timezone?.trim() || 'Africa/Kigali',
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      capacity: dto.capacity ?? null,
      registrationOpensAt: dto.registrationOpensAt
        ? new Date(dto.registrationOpensAt)
        : null,
      registrationClosesAt: dto.registrationClosesAt
        ? new Date(dto.registrationClosesAt)
        : null,
      featuredMediaId: dto.featuredMediaId ?? null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    });
    return this.eventsRepository.save(event);
  }

  async createBulkEvents(payloads: NewEvent[]): Promise<EventsEntity[]> {
    if (payloads.length === 0 || payloads.length > BULK_CREATE_LIMIT) {
      throw new BadRequestException(
        `Submit between 1 and ${BULK_CREATE_LIMIT} events`,
      );
    }
    const events: EventsEntity[] = [];
    for (const payload of payloads) {
      events.push(await this.createEvent(payload));
    }
    return events;
  }

  findAllEvents(): Promise<EventsEntity[]> {
    return this.eventsRepository.find({
      relations: {
        conferenceProgram: { conference: true, program: true },
        defaultVenue: true,
        sessions: { venue: true },
      },
      order: { startAt: 'ASC' },
    });
  }

  findEventsByProgram(programId: string): Promise<EventsEntity[]> {
    return this.eventsRepository.find({
      where: { conferenceProgram: { programId } },
      relations: {
        conferenceProgram: { conference: true, program: true },
        defaultVenue: true,
        sessions: { venue: true },
      },
      order: { startAt: 'ASC' },
    });
  }

  async findEventByID(id: string, withDeleted = false): Promise<EventsEntity> {
    const event = await this.eventsRepository.findOne({
      where: { id },
      withDeleted,
      relations: {
        conferenceProgram: { conference: true, program: true },
        defaultVenue: true,
        sessions: { venue: true },
      },
    });
    if (!event) throw new NotFoundException(`Event with ID ${id} not found`);
    return event;
  }

  async updateEvent(id: string, dto: UpdateEvent): Promise<EventsEntity> {
    const event = await this.findEventByID(id);
    const conferenceProgramId =
      dto.conferenceProgramId ?? event.conferenceProgramId;
    const startAt = dto.startAt ?? event.startAt.toISOString();
    const endAt = dto.endAt ?? event.endAt.toISOString();
    const registrationOpensAt =
      dto.registrationOpensAt ?? event.registrationOpensAt?.toISOString();
    const registrationClosesAt =
      dto.registrationClosesAt ?? event.registrationClosesAt?.toISOString();
    this.validateDates({
      startAt,
      endAt,
      registrationOpensAt,
      registrationClosesAt,
    });
    await this.findConferenceProgram(conferenceProgramId);
    await this.validateVenue(dto.defaultVenueId);
    const slug = dto.slug ? this.toSlug(dto.slug) : event.slug;
    await this.ensureUnique(conferenceProgramId, slug, id);

    Object.assign(event, {
      ...dto,
      conferenceProgramId,
      slug,
      ...(dto.code !== undefined
        ? { code: dto.code.trim().toUpperCase() }
        : {}),
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.eventType !== undefined
        ? { eventType: dto.eventType.trim().toUpperCase() }
        : {}),
      ...(dto.summary !== undefined
        ? { summary: this.cleanOptionalText(dto.summary) }
        : {}),
      ...(dto.description !== undefined
        ? { description: this.cleanOptionalText(dto.description) }
        : {}),
      ...(dto.startAt !== undefined ? { startAt: new Date(dto.startAt) } : {}),
      ...(dto.endAt !== undefined ? { endAt: new Date(dto.endAt) } : {}),
      ...(dto.registrationOpensAt !== undefined
        ? { registrationOpensAt: new Date(dto.registrationOpensAt) }
        : {}),
      ...(dto.registrationClosesAt !== undefined
        ? { registrationClosesAt: new Date(dto.registrationClosesAt) }
        : {}),
      ...(dto.scheduledAt !== undefined
        ? { scheduledAt: new Date(dto.scheduledAt) }
        : {}),
    });
    return this.eventsRepository.save(event);
  }

  async softDeleteEvent(id: string): Promise<void> {
    await this.findEventByID(id);
    await this.eventsRepository.softDelete(id);
  }

  async restoreEvent(id: string): Promise<EventsEntity> {
    await this.findEventByID(id, true);
    await this.eventsRepository.restore(id);
    return this.findEventByID(id);
  }

  private async findConferenceProgram(
    id: string,
  ): Promise<ConferenceProgramsEntity> {
    const conferenceProgram = await this.conferenceProgramsRepository.findOne({
      where: { id },
      relations: { conference: true, program: true },
    });
    if (!conferenceProgram) {
      throw new NotFoundException(`Conference program with ID ${id} not found`);
    }
    return conferenceProgram;
  }

  private async validateVenue(venueId?: string): Promise<void> {
    if (!venueId) return;
    const venue = await this.venuesRepository.findOneBy({
      id: venueId,
      active: true,
    });
    if (!venue) {
      throw new NotFoundException(`Active venue with ID ${venueId} not found`);
    }
  }

  private async ensureUnique(
    conferenceProgramId: string,
    slug: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.eventsRepository.findOne({
      where: {
        conferenceProgramId,
        slug,
        ...(excludedId ? { id: Not(excludedId) } : {}),
      },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException(
        `Event slug ${slug} already exists for this conference program`,
      );
    }
  }

  private validateDates(dto: {
    startAt: string;
    endAt: string;
    registrationOpensAt?: string;
    registrationClosesAt?: string;
  }): void {
    if (new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('Event end time must be after start time');
    }
    if (
      dto.registrationOpensAt &&
      dto.registrationClosesAt &&
      new Date(dto.registrationClosesAt) < new Date(dto.registrationOpensAt)
    ) {
      throw new BadRequestException(
        'Registration closing time must be on or after opening time',
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
    if (!slug) throw new BadRequestException('Event slug cannot be empty');
    return slug;
  }

  private cleanOptionalText(value?: string): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }
}
