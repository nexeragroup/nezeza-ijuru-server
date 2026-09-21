import { BadRequestException } from '@nestjs/common';
import { PublicationStatus } from '../../common/enums/publication-status.enum';
import { UpdateEntity } from './entity/update.entity';

export function safeActionUrl(value: string): boolean {
  if (
    /[\\\s]/.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32) ||
    /%0[ad]|%5c/i.test(value)
  )
    return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return (
      /^https:\/\//i.test(value) &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function validateUpdate(update: UpdateEntity): void {
  if (!update.title?.trim() || !update.message?.trim())
    throw new BadRequestException('Title and message are required');
  if (!update.category || update.priority == null)
    throw new BadRequestException('Category, priority and order are required');
  if (
    [update.conferenceId, update.eventId, update.sessionId].filter(Boolean)
      .length > 1
  )
    throw new BadRequestException(
      'Choose only one linked conference, event or session',
    );
  if (
    update.visibleFrom &&
    update.visibleUntil &&
    update.visibleUntil <= update.visibleFrom
  )
    throw new BadRequestException('Visibility end must be after its start');
  if (update.actionUrl && !safeActionUrl(update.actionUrl))
    throw new BadRequestException('Use an internal path or a valid HTTPS URL');
  if (update.actionUrl && !update.actionLabel)
    throw new BadRequestException(
      'An action label is required for a custom URL',
    );
  if (
    update.actionUrl &&
    (update.conferenceId || update.eventId || update.sessionId)
  )
    throw new BadRequestException(
      'Linked content generates its own destination; remove the custom URL',
    );
  if (
    update.actionLabel &&
    !update.actionUrl &&
    !update.conferenceId &&
    !update.eventId &&
    !update.sessionId
  )
    throw new BadRequestException('Choose a destination for the action');
  if (/^(live( now)?|happening now)$/i.test(update.label?.trim() ?? ''))
    throw new BadRequestException(
      'Live and happening-now labels are assigned automatically',
    );
}
export function visibility(update: UpdateEntity, now = new Date()): string {
  if (update.publicationStatus === PublicationStatus.DRAFT) return 'Draft';
  if (update.publicationStatus === PublicationStatus.ARCHIVED)
    return 'Archived';
  if (update.visibleUntil && update.visibleUntil <= now) return 'Expired';
  if (
    update.publicationStatus === PublicationStatus.SCHEDULED &&
    !update.visibleFrom
  )
    return 'Missing schedule';
  if (update.visibleFrom && update.visibleFrom > now) return 'Scheduled';
  return 'Visible';
}
export function conferencePhase(
  start: string | null,
  end: string | null,
  now = new Date(),
): 'preparation' | 'upcoming' | 'happening' | 'ended' {
  // Conference dates are inclusive calendar dates in Kigali, not UTC instants.
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Kigali',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  if (end && end < today) return 'ended';
  if (!start) return 'preparation';
  if (start > today) return 'upcoming';
  return end ? 'happening' : 'preparation';
}
