import { EventsEntity } from '../../events/entity/events.entity';
import { ConferenceProgramsEntity } from '../../conferences/entity/conference-programs.entity';
import { ConferencesEntity } from '../../conferences/entity/conferences.entity';
import { ProgramsEntity } from '../entity/programs.entity';

export class ProgramResponseDto {
  id!: string;
  slug!: string;
  name!: string;
  summary!: string | null;
  description!: string | null;
  featuredMediaId!: string | null;
  publicationStatus!: string;
  publishedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  version!: number;
  conferences!: Array<{
    id: string;
    conferenceId: string;
    programId: string;
    conferenceSummary: string | null;
    isFeatured: boolean;
    createdAt: Date;
    conference?: {
      id: string;
      year: number;
      slug: string;
      title: string;
      theme: string;
      isCurrent: boolean;
      publicationStatus: string;
    };
    events?: Array<{
      id: string;
      slug: string;
      title: string;
      eventType: string;
      startAt: Date;
      endAt: Date;
      eventStatus: string;
      publicationStatus: string;
    }>;
  }>;

  static fromEntity(program: ProgramsEntity): ProgramResponseDto {
    const response = new ProgramResponseDto();
    Object.assign(response, {
      id: program.id,
      slug: program.slug,
      name: program.name,
      summary: program.summary,
      description: program.description,
      featuredMediaId: program.featuredMediaId,
      publicationStatus: program.publicationStatus,
      publishedAt: program.publishedAt,
      createdAt: program.createdAt,
      updatedAt: program.updatedAt,
      conferences: (program.conferences ?? []).map((conferenceProgram) =>
        ProgramResponseDto.mapConferenceProgram(conferenceProgram),
      ),
    });
    return response;
  }

  private static mapConferenceProgram(
    conferenceProgram: ConferenceProgramsEntity,
  ) {
    return {
      id: conferenceProgram.id,
      conferenceId: conferenceProgram.conferenceId,
      programId: conferenceProgram.programId,
      conferenceSummary: conferenceProgram.conferenceSummary,
      isFeatured: conferenceProgram.isFeatured,
      createdAt: conferenceProgram.createdAt,
      conference: conferenceProgram.conference
        ? ProgramResponseDto.mapConference(conferenceProgram.conference)
        : undefined,
      events: conferenceProgram.events?.map((event) =>
        ProgramResponseDto.mapEvent(event),
      ),
    };
  }

  private static mapConference(conference: ConferencesEntity) {
    return {
      id: conference.id,
      year: conference.year,
      slug: conference.slug,
      title: conference.title,
      theme: conference.theme,
      isCurrent: conference.isCurrent,
      publicationStatus: conference.publicationStatus,
    };
  }

  private static mapEvent(event: EventsEntity) {
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      eventType: event.eventType,
      startAt: event.startAt,
      endAt: event.endAt,
      eventStatus: event.eventStatus,
      publicationStatus: event.publicationStatus,
    };
  }
}
