import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvitationsEntity } from './entities/invitation.entity';
import { InvitationRolesEntity } from './entities/invitation-role.entity';
import { InviteesEntity } from '../invitees/entities/invitee.entity';
import { EventsEntity } from '../events/entity/events.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import { CreateInvitationDto } from './dto/invitation.dto';
import { InvitationScope } from '../../common/enums/invitation-scope.enum';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(InvitationsEntity)
    private readonly repository: Repository<InvitationsEntity>,
    @InjectRepository(InviteesEntity)
    private readonly invitees: Repository<InviteesEntity>,
    @InjectRepository(EventsEntity)
    private readonly events: Repository<EventsEntity>,
    @InjectRepository(SessionsEntity)
    private readonly sessions: Repository<SessionsEntity>,
  ) {}

  async create(dto: CreateInvitationDto): Promise<InvitationsEntity> {
    const [invitee, event] = await Promise.all([
      this.invitees.findOne({ where: { id: dto.inviteeId } }),
      this.events.findOne({ where: { id: dto.eventId } }),
    ]);
    if (!invitee) throw new NotFoundException('Invitee not found');
    if (!event) throw new NotFoundException('Event not found');
    if (dto.scope === InvitationScope.EVENT && dto.sessionId) throw new BadRequestException('Event invitations cannot include a session');
    if (dto.scope === InvitationScope.SESSION && !dto.sessionId) throw new BadRequestException('Session invitations require a session');

    let session: SessionsEntity | null = null;
    if (dto.sessionId) {
      session = await this.sessions.findOne({ where: { id: dto.sessionId, eventId: dto.eventId } });
      if (!session) throw new NotFoundException('Session not found for this event');
    }
    if (dto.roles.filter((role) => role.isPrimary).length > 1) throw new BadRequestException('Only one invitation role can be primary');

    const invitation = this.repository.create({
      reference: `INV-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      scope: dto.scope,
      inviteeId: dto.inviteeId,
      eventId: dto.eventId,
      sessionId: dto.sessionId ?? null,
      invitationMessage: dto.invitationMessage ?? null,
      expectedArrivalAt: dto.expectedArrivalAt ? new Date(dto.expectedArrivalAt) : null,
      expectedDepartureAt: dto.expectedDepartureAt ? new Date(dto.expectedDepartureAt) : null,
      numberOfPeople: dto.numberOfPeople ?? null,
      accommodationRequired: dto.accommodationRequired ?? false,
      transportRequired: dto.transportRequired ?? false,
      specialRequirements: dto.specialRequirements ?? null,
      internalNotes: dto.internalNotes ?? null,
      publicNotes: dto.publicNotes ?? null,
      isFeatured: dto.isFeatured ?? false,
      publicationStatus: dto.publicationStatus,
      metadata: dto.metadata ?? null,
      invitee,
      event,
      session,
      roles: dto.roles.map((role, index) => ({
        role: role.role,
        roleLabel: role.roleLabel ?? null,
        isPrimary: role.isPrimary ?? (index === 0),
      }) as InvitationRolesEntity),
    });
    const saved = await this.repository.save(invitation);
    return this.findById(saved.id);
  }

  findAll(): Promise<InvitationsEntity[]> {
    return this.repository.find({
      relations: { invitee: true, event: true, session: true, roles: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<InvitationsEntity> {
    const invitation = await this.repository.findOne({
      where: { id },
      relations: { invitee: true, event: true, session: true, roles: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }
}
