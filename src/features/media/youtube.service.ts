import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YoutubeMediaState } from '../../common/enums/media.enum';

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

const YOUTUBE_NO_COOKIE_HOSTS = new Set(['youtube-nocookie.com']);

const YOUTUBE_BATCH_SIZE = 50;

export interface YoutubeStatus {
  state: YoutubeMediaState;
  embeddable: boolean | null;
  scheduledStartAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  checkedAt: string;
}

interface YoutubeVideo {
  id: string;

  snippet?: {
    liveBroadcastContent?: 'live' | 'upcoming' | 'none';
  };

  status?: {
    embeddable?: boolean;
    privacyStatus?: string;
  };

  liveStreamingDetails?: {
    actualEndTime?: string;
    actualStartTime?: string;
    scheduledStartTime?: string;
  };
}

interface YoutubeVideosResponse {
  items?: YoutubeVideo[];
}

/**
 * Extracts a valid YouTube video ID from a supported YouTube URL.
 *
 * Supported examples:
 *
 * https://youtu.be/VIDEO_ID
 * https://youtube.com/watch?v=VIDEO_ID
 * https://youtube.com/live/VIDEO_ID
 * https://youtube.com/embed/VIDEO_ID
 * https://youtube.com/shorts/VIDEO_ID
 */
export function youtubeVideoId(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const input = value.trim();

  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    let videoId: string | null = null;

    if (hostname === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (
      YOUTUBE_HOSTS.has(hostname) ||
      YOUTUBE_NO_COOKIE_HOSTS.has(hostname)
    ) {
      videoId =
        url.searchParams.get('v') ??
        url.pathname.match(/^\/(?:live|embed|shorts)\/([^/?]+)/)?.[1] ??
        null;
    }

    if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      return null;
    }

    return videoId;
  } catch {
    return null;
  }
}

export function youtubeVideoStatus(
  video: YoutubeVideo | undefined,
): YoutubeStatus {
  const checkedAt = new Date().toISOString();

  if (!video || video.status?.privacyStatus === 'private') {
    return {
      state: YoutubeMediaState.UNAVAILABLE,
      embeddable: false,
      scheduledStartAt: null,
      actualStartAt: null,
      actualEndAt: null,
      checkedAt,
    };
  }

  const live = video.liveStreamingDetails;

  let state: YoutubeMediaState;

  if (live?.actualEndTime) {
    state = YoutubeMediaState.ENDED;
  } else if (video.snippet?.liveBroadcastContent === 'live') {
    state = YoutubeMediaState.LIVE;
  } else if (video.snippet?.liveBroadcastContent === 'upcoming') {
    state = YoutubeMediaState.UPCOMING;
  } else if (live?.actualStartTime) {
    state = YoutubeMediaState.UNKNOWN;
  } else {
    state = YoutubeMediaState.VIDEO;
  }

  return {
    state,
    embeddable: video.status?.embeddable ?? null,
    scheduledStartAt: live?.scheduledStartTime ?? null,
    actualStartAt: live?.actualStartTime ?? null,
    actualEndAt: live?.actualEndTime ?? null,
    checkedAt,
  };
}

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  private readonly cache = new Map<
    string,
    {
      expiresAt: number;
      value: YoutubeStatus;
    }
  >();

  private refreshPromise?: Promise<void>;

  constructor(private readonly config: ConfigService) {}

  async statuses(ids: readonly string[]): Promise<Map<string, YoutubeStatus>> {
    const normalizedIds = [
      ...new Set(ids.filter((id) => YOUTUBE_VIDEO_ID_PATTERN.test(id))),
    ];

    if (normalizedIds.length === 0) {
      return new Map();
    }

    /*
     * Allow an existing refresh to finish first.
     *
     * This prevents simultaneous public requests from consuming
     * unnecessary YouTube API quota.
     */
    if (this.refreshPromise) {
      await this.refreshPromise;
    }

    const now = Date.now();

    const missingIds = normalizedIds.filter((id) => {
      const cached = this.cache.get(id);

      return !cached || cached.expiresAt <= now;
    });

    if (missingIds.length > 0) {
      this.refreshPromise = this.refresh(missingIds);

      try {
        await this.refreshPromise;
      } finally {
        this.refreshPromise = undefined;
      }
    }

    const result = new Map<string, YoutubeStatus>();

    for (const id of normalizedIds) {
      result.set(id, this.cache.get(id)?.value ?? this.unknownStatus());
    }

    return result;
  }

  private async refresh(ids: readonly string[]): Promise<void> {
    this.removeExpiredCacheEntries();

    const apiKey = this.config.get<string>('YOUTUBE_API_KEY')?.trim();

    if (!apiKey) {
      this.logger.warn(
        'YouTube status integration is disabled because YOUTUBE_API_KEY is not configured.',
      );

      for (const id of ids) {
        this.cacheStatus(id, this.unknownStatus());
      }

      return;
    }

    for (let offset = 0; offset < ids.length; offset += YOUTUBE_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + YOUTUBE_BATCH_SIZE);

      await this.refreshBatch(batch, apiKey);
    }
  }

  private async refreshBatch(
    ids: readonly string[],
    apiKey: string,
  ): Promise<void> {
    try {
      const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');

      endpoint.searchParams.set('part', 'snippet,liveStreamingDetails,status');

      endpoint.searchParams.set('id', ids.join(','));

      endpoint.searchParams.set('key', apiKey);

      const timeoutMs = this.config.get<number>('youtube.timeoutMs', 8_000);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`YouTube API returned HTTP ${response.status}.`);

        this.cacheUnknownStatuses(ids);

        return;
      }

      const body = (await response.json()) as YoutubeVideosResponse;

      if (!Array.isArray(body.items)) {
        this.logger.warn('YouTube API returned an unexpected response.');

        this.cacheUnknownStatuses(ids);

        return;
      }

      const videosById = new Map(body.items.map((video) => [video.id, video]));

      for (const id of ids) {
        this.cacheStatus(id, youtubeVideoStatus(videosById.get(id)));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.logger.warn(`YouTube status request failed: ${message}`);

      this.cacheUnknownStatuses(ids);
    }
  }

  private cacheUnknownStatuses(ids: readonly string[]): void {
    for (const id of ids) {
      this.cacheStatus(id, this.unknownStatus());
    }
  }

  private cacheStatus(id: string, value: YoutubeStatus): void {
    this.cache.set(id, {
      value,
      expiresAt: Date.now() + this.cacheTtl(value.state),
    });
  }

  private cacheTtl(state: YoutubeMediaState): number {
    switch (state) {
      case YoutubeMediaState.LIVE:
      case YoutubeMediaState.UPCOMING:
        return 30_000;

      case YoutubeMediaState.VIDEO:
      case YoutubeMediaState.ENDED:
        return 5 * 60_000;

      case YoutubeMediaState.UNAVAILABLE:
        return 60_000;

      case YoutubeMediaState.UNKNOWN:
      default:
        return 15_000;
    }
  }

  private removeExpiredCacheEntries(): void {
    const now = Date.now();

    for (const [id, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(id);
      }
    }
  }

  private unknownStatus(): YoutubeStatus {
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
