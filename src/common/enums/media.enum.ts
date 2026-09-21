export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  PODCAST = 'PODCAST',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}

export enum MediaTargetType {
  CONFERENCE = 'CONFERENCE',
  CONFERENCE_PROGRAM = 'CONFERENCE_PROGRAM',
  EVENT = 'EVENT',
  SESSION = 'SESSION',
}

export enum MediaSourceType {
  UPLOAD = 'UPLOAD',
  EXTERNAL = 'EXTERNAL',
}

/**
 * Identifies the system/provider responsible for the media.
 *
 * Examples:
 *
 * UPLOAD + INTERNAL
 * EXTERNAL + YOUTUBE
 * EXTERNAL + EXTERNAL
 */
export enum MediaProvider {
  INTERNAL = 'INTERNAL',
  YOUTUBE = 'YOUTUBE',
  EXTERNAL = 'EXTERNAL',
}

export enum YoutubeMediaState {
  LIVE = 'LIVE',
  UPCOMING = 'UPCOMING',
  ENDED = 'ENDED',
  VIDEO = 'VIDEO',
  UNAVAILABLE = 'UNAVAILABLE',
  UNKNOWN = 'UNKNOWN',
}
