import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AttendeeStatus } from '../../common/enums/attendee-status.enum';
import { AttendeeType } from '../../common/enums/attendee-type.enum';
import { EventsEntity } from '../events/entity/events.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import {
  CheckInAttendee,
  NewAttendee,
  UpdateAttendee,
} from './dto/attendee.dto';
import { AttendeesEntity } from './entity/attendees.entity';
import { PublicRegistrationDto } from './dto/public-registration.dto';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import { EventStatus } from '../../common/enums/event-status.enum';
import { SessionStatus } from '../../common/enums/session-status.enum';

@Injectable()
export class AttendeesService {
  constructor(
    @InjectRepository(AttendeesEntity)
    private readonly attendeesRepository: Repository<AttendeesEntity>,
  ) {}

  async registerPublic(dto: PublicRegistrationDto) {
    const manager = this.attendeesRepository.manager;
    const session =
      dto.targetType === AttendeeType.SESSION
        ? await manager
            .getRepository(SessionsEntity)
            .findOneBy({ id: dto.targetId })
        : null;
    if (dto.targetType === AttendeeType.SESSION && !session) {
      throw new NotFoundException('Registration target not found');
    }
    const event = await manager.getRepository(EventsEntity).findOne({
      where: {
        id:
          dto.targetType === AttendeeType.EVENT
            ? dto.targetId
            : (session?.eventId ?? ''),
      },
      relations: { conferenceProgram: { conference: true } },
    });
    const target = dto.targetType === AttendeeType.EVENT ? event : session;
    if (
      !target ||
      !event ||
      event.publicationStatus !== PublicationStatus.PUBLISHED ||
      (session !== null &&
        session.publicationStatus !== PublicationStatus.PUBLISHED) ||
      event.conferenceProgram.conference.publicationStatus !==
        PublicationStatus.PUBLISHED
    ) {
      throw new NotFoundException('Registration target not found');
    }
    if (
      !target.registrationRequired ||
      event.eventStatus === EventStatus.CANCELLED ||
      session?.sessionStatus === SessionStatus.CANCELLED ||
      new Date(target.endAt) <= new Date()
    ) {
      throw new BadRequestException(
        'Registration is not available for this event or session',
      );
    }
    const [firstName, ...rest] = dto.name.trim().split(/\s+/);
    const attendee = await this.createAttendee({
      firstName,
      lastName: rest.join(' '),
      email: dto.email,
      phone: dto.phone,
      attendeeType: dto.targetType,
      ...(dto.targetType === AttendeeType.EVENT
        ? { eventId: dto.targetId }
        : { sessionId: dto.targetId }),
    });
    return { status: attendee.status };
  }

  createAttendee(dto: NewAttendee): Promise<AttendeesEntity> {
    this.validateTarget(dto);
    return this.attendeesRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(AttendeesEntity);
      const email = dto.email.trim().toLowerCase();
      const targetId =
        dto.attendeeType === AttendeeType.EVENT
          ? (dto.eventId as string)
          : (dto.sessionId as string);

      let capacity: number | null;
      let registrationRequired: boolean;
      let opensAt: Date | null;
      let closesAt: Date | null;

      if (dto.attendeeType === AttendeeType.EVENT) {
        const event = await manager.getRepository(EventsEntity).findOne({
          where: { id: targetId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!event) {
          throw new NotFoundException(`Event with ID ${targetId} not found`);
        }
        capacity = event.capacity;
        registrationRequired = event.registrationRequired;
        opensAt = event.registrationOpensAt;
        closesAt = event.registrationClosesAt;
      } else {
        const session = await manager.getRepository(SessionsEntity).findOne({
          where: { id: targetId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!session) {
          throw new NotFoundException(`Session with ID ${targetId} not found`);
        }
        capacity = session.capacity;
        registrationRequired = session.registrationRequired;
        opensAt = session.registrationOpensAt;
        closesAt = session.registrationClosesAt;
      }

      this.validateRegistrationWindow(registrationRequired, opensAt, closesAt);
      const targetWhere =
        dto.attendeeType === AttendeeType.EVENT
          ? { eventId: targetId }
          : { sessionId: targetId };
      const duplicate = await repository.findOne({
        where: { ...targetWhere, email },
        withDeleted: true,
      });
      if (duplicate) {
        throw new ConflictException(
          'This email is already registered for the selected target',
        );
      }

      const registeredCount = await repository.count({
        where: {
          ...targetWhere,
          status: Not(AttendeeStatus.CANCELLED),
        },
      });
      const status =
        capacity !== null && registeredCount >= capacity
          ? AttendeeStatus.WAITLISTED
          : (dto.status ?? AttendeeStatus.REGISTERED);

      const attendee = repository.create({
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        phone: this.cleanOptionalText(dto.phone),
        organization: this.cleanOptionalText(dto.organization),
        attendeeType: dto.attendeeType,
        eventId: dto.attendeeType === AttendeeType.EVENT ? targetId : null,
        sessionId: dto.attendeeType === AttendeeType.SESSION ? targetId : null,
        status,
        checkedIn: false,
        checkedInAt: null,
        notes: this.cleanOptionalText(dto.notes),
      });
      return repository.save(attendee);
    });
  }

  findAllAttendees(): Promise<AttendeesEntity[]> {
    return this.attendeesRepository.find({
      relations: { event: true, session: { event: true } },
      order: { createdAt: 'DESC' },
    });
  }

  findEventAttendees(eventId: string): Promise<AttendeesEntity[]> {
    return this.attendeesRepository.find({
      where: { attendeeType: AttendeeType.EVENT, eventId },
      relations: { event: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  findSessionAttendees(sessionId: string): Promise<AttendeesEntity[]> {
    return this.attendeesRepository.find({
      where: { attendeeType: AttendeeType.SESSION, sessionId },
      relations: { session: { event: true } },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async findAttendeeByID(
    id: string,
    withDeleted = false,
  ): Promise<AttendeesEntity> {
    const attendee = await this.attendeesRepository.findOne({
      where: { id },
      withDeleted,
      relations: { event: true, session: { event: true } },
    });
    if (!attendee) {
      throw new NotFoundException(`Attendee with ID ${id} not found`);
    }
    return attendee;
  }

  async updateAttendee(
    id: string,
    dto: UpdateAttendee,
  ): Promise<AttendeesEntity> {
    const attendee = await this.findAttendeeByID(id);
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const targetWhere =
        attendee.attendeeType === AttendeeType.EVENT
          ? { eventId: attendee.eventId as string }
          : { sessionId: attendee.sessionId as string };
      const duplicate = await this.attendeesRepository.findOne({
        where: { ...targetWhere, email, id: Not(id) },
        withDeleted: true,
      });
      if (duplicate) {
        throw new ConflictException(
          'This email is already registered for the selected target',
        );
      }
    }
    Object.assign(attendee, {
      ...dto,
      ...(dto.firstName !== undefined
        ? { firstName: dto.firstName.trim() }
        : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
      ...(dto.email !== undefined
        ? { email: dto.email.trim().toLowerCase() }
        : {}),
      ...(dto.phone !== undefined
        ? { phone: this.cleanOptionalText(dto.phone) }
        : {}),
      ...(dto.organization !== undefined
        ? { organization: this.cleanOptionalText(dto.organization) }
        : {}),
      ...(dto.notes !== undefined
        ? { notes: this.cleanOptionalText(dto.notes) }
        : {}),
    });
    return this.attendeesRepository.save(attendee);
  }

  async checkInAttendee(
    id: string,
    dto: CheckInAttendee,
  ): Promise<AttendeesEntity> {
    const attendee = await this.findAttendeeByID(id);
    if (attendee.status === AttendeeStatus.CANCELLED) {
      throw new BadRequestException('A cancelled attendee cannot check in');
    }
    if (attendee.status === AttendeeStatus.WAITLISTED && dto.checkedIn) {
      throw new BadRequestException('A waitlisted attendee cannot check in');
    }
    attendee.checkedIn = dto.checkedIn;
    attendee.checkedInAt = dto.checkedIn ? new Date() : null;
    return this.attendeesRepository.save(attendee);
  }

  async softDeleteAttendee(id: string): Promise<void> {
    await this.findAttendeeByID(id);
    await this.attendeesRepository.softDelete(id);
  }

  async restoreAttendee(id: string): Promise<AttendeesEntity> {
    await this.findAttendeeByID(id, true);
    await this.attendeesRepository.restore(id);
    return this.findAttendeeByID(id);
  }

  private validateTarget(dto: NewAttendee): void {
    const isEvent = dto.attendeeType === AttendeeType.EVENT;
    if (isEvent && (!dto.eventId || dto.sessionId)) {
      throw new BadRequestException(
        'EVENT attendees require eventId and cannot include sessionId',
      );
    }
    if (!isEvent && (!dto.sessionId || dto.eventId)) {
      throw new BadRequestException(
        'SESSION attendees require sessionId and cannot include eventId',
      );
    }
  }

  private validateRegistrationWindow(
    registrationRequired: boolean,
    opensAt: Date | null,
    closesAt: Date | null,
  ): void {
    if (!registrationRequired) return;
    const now = new Date();
    if (opensAt && now < opensAt) {
      throw new BadRequestException('Registration has not opened yet');
    }
    if (closesAt && now > closesAt) {
      throw new BadRequestException('Registration is closed');
    }
  }

  private cleanOptionalText(value?: string): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }
}
