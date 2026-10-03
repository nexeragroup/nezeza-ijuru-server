import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { EventsEntity } from '../events/entity/events.entity';
import { VenuesEntity } from '../venues/entity/venues.entity';
import { NewSession, UpdateSession } from './dto/session.dto';
import { SessionsEntity } from './entity/sessions.entity';
import { BULK_CREATE_LIMIT } from '../../common/constants/bulk.constant';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionsEntity)
    private readonly sessionsRepository: Repository<SessionsEntity>,
    @InjectRepository(EventsEntity)
    private readonly eventsRepository: Repository<EventsEntity>,
    @InjectRepository(VenuesEntity)
    private readonly venuesRepository: Repository<VenuesEntity>,
  ) {}

  async createSession(dto: NewSession): Promise<SessionsEntity> {
    const event = await this.findEvent(dto.eventId);
    await this.validateVenue(dto.venueId);
    this.validateDates(dto.startAt, dto.endAt, event);
    this.validateRegistrationDates(
      dto.registrationOpensAt,
      dto.registrationClosesAt,
    );
    const slug = this.toSlug(dto.slug ?? dto.title);
    await this.ensureUnique(dto.eventId, slug);
    const session = this.sessionsRepository.create({
      ...dto,
      code: dto.code.trim().toUpperCase(),
      slug,
      title: dto.title.trim(),
      description: this.cleanOptionalText(dto.description),
      venueId: dto.venueId ?? null,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      capacity: dto.capacity ?? null,
      registrationOpensAt: dto.registrationOpensAt
        ? new Date(dto.registrationOpensAt)
        : null,
      registrationClosesAt: dto.registrationClosesAt
        ? new Date(dto.registrationClosesAt)
        : null,
      streamUrl: this.cleanOptionalText(dto.streamUrl),
    });
    return this.sessionsRepository.save(session);
  }

  async createBulkSessions(payloads: NewSession[]): Promise<SessionsEntity[]> {
    if (payloads.length === 0 || payloads.length > BULK_CREATE_LIMIT) {
      throw new BadRequestException(
        `Submit between 1 and ${BULK_CREATE_LIMIT} sessions`,
      );
    }
    const sessions: SessionsEntity[] = [];
    for (const payload of payloads) {
      sessions.push(await this.createSession(payload));
    }
    return sessions;
  }

  findAllSessions(): Promise<SessionsEntity[]> {
    return this.sessionsRepository.find({
      relations: {
        event: { conferenceProgram: { conference: true, program: true } },
        venue: true,
      },
      order: { startAt: 'ASC', displayOrder: 'ASC' },
    });
  }

  findSessionsByEvent(eventId: string): Promise<SessionsEntity[]> {
    return this.sessionsRepository.find({
      where: { eventId },
      relations: { venue: true },
      order: { startAt: 'ASC', displayOrder: 'ASC' },
    });
  }

  async findSessionByID(
    id: string,
    withDeleted = false,
  ): Promise<SessionsEntity> {
    const session = await this.sessionsRepository.findOne({
      where: { id },
      withDeleted,
      relations: {
        event: {
          conferenceProgram: { conference: true, program: true },
          defaultVenue: true,
        },
        venue: true,
      },
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
    return session;
  }

  async updateSession(id: string, dto: UpdateSession): Promise<SessionsEntity> {
    const session = await this.findSessionByID(id);
    const eventId = dto.eventId ?? session.eventId;
    const event = await this.findEvent(eventId);
    await this.validateVenue(dto.venueId);
    const startAt = dto.startAt ?? session.startAt.toISOString();
    const endAt = dto.endAt ?? session.endAt.toISOString();
    this.validateDates(startAt, endAt, event);
    const registrationOpensAt =
      dto.registrationOpensAt ?? session.registrationOpensAt?.toISOString();
    const registrationClosesAt =
      dto.registrationClosesAt ?? session.registrationClosesAt?.toISOString();
    this.validateRegistrationDates(registrationOpensAt, registrationClosesAt);
    const slug = dto.slug ? this.toSlug(dto.slug) : session.slug;
    await this.ensureUnique(eventId, slug, id);

    Object.assign(session, {
      ...dto,
      eventId,
      slug,
      ...(dto.code !== undefined
        ? { code: dto.code.trim().toUpperCase() }
        : {}),
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: this.cleanOptionalText(dto.description) }
        : {}),
      ...(dto.startAt !== undefined ? { startAt: new Date(dto.startAt) } : {}),
      ...(dto.endAt !== undefined ? { endAt: new Date(dto.endAt) } : {}),
      ...(dto.streamUrl !== undefined
        ? { streamUrl: this.cleanOptionalText(dto.streamUrl) }
        : {}),
      ...(dto.registrationOpensAt !== undefined
        ? { registrationOpensAt: new Date(dto.registrationOpensAt) }
        : {}),
      ...(dto.registrationClosesAt !== undefined
        ? { registrationClosesAt: new Date(dto.registrationClosesAt) }
        : {}),
    });
    return this.sessionsRepository.save(session);
  }

  async softDeleteSession(id: string): Promise<void> {
    await this.findSessionByID(id);
    await this.sessionsRepository.softDelete(id);
  }

  async restoreSession(id: string): Promise<SessionsEntity> {
    await this.findSessionByID(id, true);
    await this.sessionsRepository.restore(id);
    return this.findSessionByID(id);
  }

  private async findEvent(id: string): Promise<EventsEntity> {
    const event = await this.eventsRepository.findOneBy({ id });
    if (!event) throw new NotFoundException(`Event with ID ${id} not found`);
    return event;
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

  private validateDates(
    startAt: string,
    endAt: string,
    event: EventsEntity,
  ): void {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const eventStart = new Date(event.startAt);
    const eventEnd = new Date(event.endAt);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      Number.isNaN(eventStart.getTime()) ||
      Number.isNaN(eventEnd.getTime())
    ) {
      throw new BadRequestException('One or more schedule dates are invalid');
    }

    if (end <= start) {
      throw new BadRequestException(
        'Session end time must be after start time',
      );
    }

    if (start < eventStart || end > eventEnd) {
      throw new BadRequestException({
        message: 'Session times must be within the parent event schedule',
        sessionSchedule: {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        },
        eventSchedule: {
          startAt: eventStart.toISOString(),
          endAt: eventEnd.toISOString(),
        },
      });
    }
  }

  private async ensureUnique(
    eventId: string,
    slug: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.sessionsRepository.findOne({
      where: {
        eventId,
        slug,
        ...(excludedId ? { id: Not(excludedId) } : {}),
      },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException(
        `Session slug ${slug} already exists in this event`,
      );
    }
  }

  private validateRegistrationDates(opensAt?: string, closesAt?: string): void {
    if (opensAt && closesAt && new Date(closesAt) < new Date(opensAt)) {
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
    if (!slug) throw new BadRequestException('Session slug cannot be empty');
    return slug;
  }

  private cleanOptionalText(value?: string): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }
}
