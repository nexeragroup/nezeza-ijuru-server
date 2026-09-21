import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import {
  YoutubeService,
  YoutubeStatus,
  youtubeVideoId,
} from './youtube.service';
import {
  MediaProvider,
  YoutubeMediaState,
} from '../../common/enums/media.enum';

export interface PublishedLivestream extends YoutubeStatus {
  sessionId: string;
  title: string;
  startAt: Date;

  provider: MediaProvider;

  videoId: string;
  url: string;
}

@Injectable()
export class LivestreamService {
  constructor(
    @InjectRepository(SessionsEntity)
    private readonly sessionsRepository: Repository<SessionsEntity>,

    private readonly youtubeService: YoutubeService,
  ) {}

  async findPublishedLivestreams(): Promise<PublishedLivestream[]> {
    const sessions = await this.sessionsRepository
      .createQueryBuilder('session')
      .innerJoin('session.event', 'event')
      .innerJoin('event.conferenceProgram', 'conferenceProgram')
      .innerJoin('conferenceProgram.conference', 'conference')
      .innerJoin('conferenceProgram.program', 'program')
      .where('session.publicationStatus = :published', {
        published: PublicationStatus.PUBLISHED,
      })
      .andWhere('event.publicationStatus = :published')
      .andWhere('program.publicationStatus = :published')
      .andWhere('conference.publicationStatus = :published')
      .andWhere('session.streamUrl IS NOT NULL')
      .andWhere(`BTRIM(session.streamUrl) <> ''`)
      .orderBy('session.startAt', 'DESC')
      .getMany();

    const streams = sessions.flatMap((session) => {
      const streamUrl = session.streamUrl?.trim();

      if (!streamUrl) {
        return [];
      }

      const videoId = youtubeVideoId(streamUrl);

      if (!videoId) {
        return [];
      }

      return [
        {
          sessionId: session.id,
          title: session.title,
          startAt: session.startAt,

          provider: MediaProvider.YOUTUBE,

          videoId,

          url: this.youtubeWatchUrl(videoId),
        },
      ];
    });

    if (streams.length === 0) {
      return [];
    }

    const statuses = await this.youtubeService.statuses(
      streams.map((stream) => stream.videoId),
    );

    return streams.map((stream) => ({
      ...stream,

      ...(statuses.get(stream.videoId) ?? this.fallbackStatus()),
    }));
  }

  private youtubeWatchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  private fallbackStatus(): YoutubeStatus {
    return {
      state: YoutubeMediaState.UNKNOWN,
      embeddable: null,
      scheduledStartAt: null,
      actualStartAt: null,
      actualEndAt: null,
      checkedAt: new Date().toISOString(),
    };
  }
}
