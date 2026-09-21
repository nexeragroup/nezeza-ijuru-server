import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/types/auth-request.interface';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import { ConferencesEntity } from '../conferences/entity/conferences.entity';
import { EventsEntity } from '../events/entity/events.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import {
  LivestreamService,
  PublishedLivestream,
} from '../media/livestream.service';
import {
  CreateUpdateDto,
  EditUpdateDto,
  PublishUpdateDto,
} from './dto/update.dto';
import { UpdateEntity } from './entity/update.entity';
import { conferencePhase, validateUpdate, visibility } from './updates.rules';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { YoutubeMediaState } from '../../common/enums/media.enum';

export interface FeedUpdate {
  id: string;
  source: 'MANUAL' | 'AUTOMATIC';
  category: string;
  label: string;
  title: string;
  message: string;
  actionLabel: string | null;
  actionUrl: string | null;
  live: boolean;
  priority: number;
}
const published = (
  value:
    | { publicationStatus: PublicationStatus; deletedAt?: Date | null }
    | null
    | undefined,
) =>
  !!value &&
  !value.deletedAt &&
  value.publicationStatus === PublicationStatus.PUBLISHED;
const availableEvent = (
  event: EventsEntity | null | undefined,
): event is EventsEntity =>
  !!event &&
  published(event) &&
  !['CANCELLED', 'COMPLETED'].includes(event.eventStatus) &&
  published(event.conferenceProgram?.conference) &&
  published(event.conferenceProgram?.program);
const availableSession = (
  session: SessionsEntity | null | undefined,
): session is SessionsEntity =>
  !!session &&
  published(session) &&
  !['CANCELLED', 'COMPLETED'].includes(session.sessionStatus) &&
  availableEvent(session.event);
const eventPath = (event: EventsEntity) =>
  `/conferences/${event.conferenceProgram.conferenceId}/program/${event.conferenceProgramId}`;

@Injectable()
export class UpdatesService {
  constructor(
    @InjectRepository(UpdateEntity)
    private readonly updates: Repository<UpdateEntity>,
    @InjectRepository(ConferencesEntity)
    private readonly conferences: Repository<ConferencesEntity>,
    @InjectRepository(EventsEntity)
    private readonly events: Repository<EventsEntity>,
    @InjectRepository(SessionsEntity)
    private readonly sessions: Repository<SessionsEntity>,
    private readonly livestreams: LivestreamService,
  ) {}

  private async context() {
    const [conferences, events, sessions] = await Promise.all([
      this.conferences.find({ order: { year: 'DESC' } }),
      this.events.find({
        relations: { conferenceProgram: { conference: true, program: true } },
        order: { startAt: 'ASC' },
      }),
      this.sessions.find({
        relations: {
          event: { conferenceProgram: { conference: true, program: true } },
        },
        order: { startAt: 'ASC' },
      }),
    ]);
    return { conferences, events, sessions };
  }

  async targets() {
    const context = await this.context();
    return {
      conferences: context.conferences.map((c) => ({
        id: c.id,
        title: `${c.year} — ${c.title}`,
        publicationStatus: c.publicationStatus,
      })),
      events: context.events.map((e) => ({
        id: e.id,
        title: e.title,
        publicationStatus: e.publicationStatus,
      })),
      sessions: context.sessions.map((s) => ({
        id: s.id,
        title: `${s.title} — ${s.event?.title ?? ''}`,
        publicationStatus: s.publicationStatus,
      })),
    };
  }

  async all() {
    const [items, context] = await Promise.all([
      this.updates.find({
        order: { priority: 'DESC', createdAt: 'DESC' },
      }),
      this.context(),
    ]);
    return items.map((item) => ({
      ...item,
      visibility:
        visibility(item) === 'Visible' && !this.targetVisible(item, context)
          ? 'Linked content unavailable'
          : visibility(item) === 'Visible'
            ? 'Eligible for feed'
            : visibility(item),
    }));
  }

  private targetVisible(
    item: UpdateEntity,
    context: Awaited<ReturnType<UpdatesService['context']>>,
  ) {
    if (item.sessionId)
      return availableSession(
        context.sessions.find((s) => s.id === item.sessionId),
      );
    if (item.eventId)
      return availableEvent(context.events.find((e) => e.id === item.eventId));
    if (item.conferenceId)
      return published(
        context.conferences.find((c) => c.id === item.conferenceId),
      );
    return true;
  }

  private async validateLinks(item: UpdateEntity) {
    for (const [id, repository] of [
      [item.conferenceId, this.conferences],
      [item.eventId, this.events],
      [item.sessionId, this.sessions],
    ] as const) {
      if (id && !(await repository.existsBy({ id })))
        throw new BadRequestException('Linked content no longer exists');
    }
  }

  private assign(item: UpdateEntity, dto: CreateUpdateDto | EditUpdateDto) {
    const { visibleFrom, visibleUntil, ...fields } = dto;
    Object.assign(
      item,
      Object.fromEntries(
        Object.entries(fields).filter(
          ([key, value]) => key !== 'version' && value !== undefined,
        ),
      ),
    );
    if (visibleFrom !== undefined)
      item.visibleFrom = visibleFrom ? new Date(visibleFrom) : null;
    if (visibleUntil !== undefined)
      item.visibleUntil = visibleUntil ? new Date(visibleUntil) : null;
    for (const key of [
      'title',
      'message',
      'label',
      'actionLabel',
      'actionUrl',
    ] as const) {
      const value = item[key];
      if (typeof value === 'string') item[key] = value.trim();
    }
    validateUpdate(item);
  }

  private authenticatedUserId(user: AuthenticatedUser): number {
    const userId = Number(user.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Invalid authenticated user identifier');
    }
    return userId;
  }

  async create(dto: CreateUpdateDto, user: AuthenticatedUser) {
    const userId = this.authenticatedUserId(user);
    const item = this.updates.create({
      publicationStatus: PublicationStatus.DRAFT,
      priority: 0,
      createdByUserId: userId,
      updatedByUserId: userId,
    });
    this.assign(item, dto);
    await this.validateLinks(item);
    return this.updates.save(item);
  }

  private async mutate(
    id: string,
    version: number,
    user: AuthenticatedUser,
    change: (item: UpdateEntity) => Promise<void>,
  ) {
    const userId = this.authenticatedUserId(user);
    return this.updates.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UpdateEntity);
      const item = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) {
        throw new NotFoundException('Update not found');
      }
      if (item.version !== version) {
        throw new ConflictException(
          'This update changed. Reload it before saving.',
        );
      }
      await change(item);
      item.updatedByUserId = userId;
      return repository.save(item);
    });
  }

  edit(id: string, dto: EditUpdateDto, user: AuthenticatedUser) {
    return this.mutate(id, dto.version, user, async (item) => {
      if (
        [PublicationStatus.PUBLISHED, PublicationStatus.SCHEDULED].includes(
          item.publicationStatus,
        ) &&
        !user.permissions.includes(PERMISSIONS.UPDATES_UPDATE)
      )
        throw new ForbiddenException(
          'Publishing permission is required to edit published or scheduled updates',
        );
      this.assign(item, dto);
      await this.validateLinks(item);
      if (
        item.publicationStatus === PublicationStatus.SCHEDULED &&
        !item.visibleFrom
      )
        throw new BadRequestException(
          'Scheduled updates require a visibility start',
        );
    });
  }

  publish(id: string, dto: PublishUpdateDto, user: AuthenticatedUser) {
    return this.mutate(id, dto.version, user, async (item) => {
      validateUpdate(item);
      await this.validateLinks(item);
      if (
        dto.publicationStatus === PublicationStatus.SCHEDULED &&
        (!item.visibleFrom || item.visibleFrom <= new Date())
      )
        throw new BadRequestException(
          'Choose a future visibility start before scheduling',
        );
      if (
        [PublicationStatus.SCHEDULED, PublicationStatus.PUBLISHED].includes(
          dto.publicationStatus,
        ) &&
        item.visibleUntil &&
        item.visibleUntil <= new Date()
      )
        throw new BadRequestException('The visibility window has expired');
      item.publicationStatus = dto.publicationStatus;
      if (dto.publicationStatus === PublicationStatus.PUBLISHED)
        item.publishedAt = new Date();
    });
  }

  async feed(): Promise<FeedUpdate[]> {
    const now = new Date();
    const [items, context, streams] = await Promise.all([
      this.updates
        .createQueryBuilder('update')
        .where('update.publicationStatus IN (:...statuses)', {
          statuses: [PublicationStatus.PUBLISHED, PublicationStatus.SCHEDULED],
        })
        .andWhere(
          '(update.visibleFrom IS NULL OR update.visibleFrom <= :now)',
          { now },
        )
        .andWhere(
          '(update.visibleUntil IS NULL OR update.visibleUntil > :now)',
          { now },
        )
        .orderBy('update.priority', 'DESC')
        .addOrderBy('update.displayOrder', 'ASC')
        .addOrderBy('update.created_at', 'DESC')
        .getMany(),

      this.context(),

      this.livestreams
        .findPublishedLivestreams()
        .catch((): PublishedLivestream[] => []),
    ]);
    const liveIds = new Set<string>(
      streams
        .filter((stream) => stream.state === YoutubeMediaState.LIVE)
        .map((stream) => stream.sessionId),
    );
    const results: FeedUpdate[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (
        visibility(item, now) !== 'Visible' ||
        !this.targetVisible(item, context)
      )
        continue;
      const targetKey = item.sessionId
        ? `session:${item.sessionId}`
        : item.eventId
          ? `event:${item.eventId}`
          : item.conferenceId
            ? `conference:${item.conferenceId}`
            : `update:${item.id}`;
      if (seen.has(targetKey)) continue;
      seen.add(targetKey);
      const session = context.sessions.find((s) => s.id === item.sessionId);
      const event =
        session?.event ?? context.events.find((e) => e.id === item.eventId);
      const live = !!item.sessionId && liveIds.has(item.sessionId);
      const timedTarget = session ?? event;
      const ongoing =
        !!timedTarget &&
        new Date(timedTarget.startAt) <= now &&
        new Date(timedTarget.endAt) > now;
      const actionUrl = live
        ? `/media/livestream?session=${item.sessionId}`
        : event
          ? eventPath(event)
          : item.conferenceId
            ? `/conferences/${item.conferenceId}`
            : item.actionUrl || null;
      results.push({
        id: item.id,
        source: 'MANUAL',
        category: item.category,
        label: live
          ? 'Live now'
          : ongoing
            ? 'Happening now'
            : item.label || item.category.toLowerCase().replaceAll('_', ' '),
        title: item.title,
        message: item.message,
        actionUrl,
        actionLabel: live
          ? 'Watch live'
          : item.actionLabel || (actionUrl ? 'Learn more' : null),
        live,
        priority: item.priority,
      });
    }
    const auto = (
      key: string,
      data: Omit<FeedUpdate, 'id' | 'source' | 'displayOrder'>,
    ) => {
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: key,
          source: 'AUTOMATIC',
          ...data,
        });
      }
    };
    for (const session of context.sessions.filter(
      (s) => availableSession(s) && liveIds.has(s.id),
    )) {
      auto(`session:${session.id}`, {
        category: 'EVENT',
        label: 'Live now',
        title: session.title,
        message: 'Join the gathering and worship with us online.',
        actionLabel: 'Watch live',
        actionUrl: `/media/livestream?session=${session.id}`,
        live: true,
        priority: 100,
      });
    }
    for (const event of context.events.filter(
      (e) =>
        availableEvent(e) &&
        new Date(e.startAt) <= now &&
        new Date(e.endAt) > now,
    )) {
      if (
        context.sessions.some(
          (s) => s.eventId === event.id && seen.has(`session:${s.id}`),
        )
      )
        continue;
      auto(`event:${event.id}`, {
        category: 'EVENT',
        label: 'Happening now',
        title: event.title,
        message: event.summary || 'Explore the program and gathering details.',
        actionLabel: 'View event details',
        actionUrl: eventPath(event),
        live: false,
        priority: 50,
      });
    }
    const conference = context.conferences
      .filter(
        (c) =>
          published(c) &&
          conferencePhase(c.startDate, c.endDate, now) !== 'ended',
      )
      .sort(
        (a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.year - b.year,
      )
      .find(
        (c) =>
          c.isCurrent ||
          ['upcoming', 'happening'].includes(
            conferencePhase(c.startDate, c.endDate, now),
          ),
      );
    if (conference) {
      const phase = conferencePhase(
        conference.startDate,
        conference.endDate,
        now,
      );
      auto(`conference:${conference.id}`, {
        category: 'PREPARATION',
        label:
          phase === 'happening'
            ? 'Happening now'
            : phase === 'upcoming'
              ? 'Coming up'
              : 'In preparation',
        title: `${conference.year} conference${phase === 'preparation' ? ' is in preparation' : ''}`,
        message:
          conference.summary ||
          'Explore the conference for the latest theme, program, and gathering details.',
        actionLabel: 'Explore conference',
        actionUrl: `/conferences/${conference.id}`,
        live: false,
        priority: 0,
      });
    }
    return results
      .sort(
        (a, b) =>
          Number(b.live) - Number(a.live) ||
          b.priority - a.priority ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 6);
  }
}
