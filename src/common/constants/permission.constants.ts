/**
 * Application permission codes.
 *
 * Naming convention:
 *   resource.action
 *
 * Examples:
 *   users.read
 *   registrations.check-in
 *   invitations.check_in
 *
 * Keep this object as the single source of truth for permissions.
 */
export const PERMISSIONS = {
  UPDATES_READ: 'updates.read',
  UPDATES_CREATE: 'updates.create',
  UPDATES_UPDATE: 'updates.update',

  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DISABLE: 'users.disable',

  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_ASSIGN: 'roles.assign',

  PERMISSIONS_READ: 'permissions.read',

  CONFERENCES_READ: 'conferences.read',
  CONFERENCES_CREATE: 'conferences.create',
  CONFERENCES_UPDATE: 'conferences.update',
  CONFERENCES_PUBLISH: 'conferences.publish',

  PROGRAMS_READ: 'programs.read',
  PROGRAMS_CREATE: 'programs.create',
  PROGRAMS_UPDATE: 'programs.update',

  EVENTS_READ: 'events.read',
  EVENTS_CREATE: 'events.create',
  EVENTS_UPDATE: 'events.update',
  EVENTS_PUBLISH: 'events.publish',

  SESSIONS_READ: 'sessions.read',
  SESSIONS_CREATE: 'sessions.create',
  SESSIONS_UPDATE: 'sessions.update',

  VENUES_READ: 'venues.read',
  VENUES_CREATE: 'venues.create',
  VENUES_UPDATE: 'venues.update',

  ATTENDEES_READ: 'attendees.read',
  ATTENDEES_CREATE: 'attendees.create',
  ATTENDEES_UPDATE: 'attendees.update',

  REGISTRATIONS_READ: 'registrations.read',
  REGISTRATIONS_UPDATE: 'registrations.update',
  REGISTRATIONS_EXPORT: 'registrations.export',
  REGISTRATIONS_CHECK_IN: 'registrations.check-in',

  MEDIA_READ: 'media.read',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',

  CONTENT_MANAGE: 'content.manage',

  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',

  CONTACT_READ: 'contact.read',
  CONTACT_UPDATE: 'contact.update',

  VOLUNTEERS_READ: 'volunteers.read',
  VOLUNTEERS_MANAGE: 'volunteers.manage',

  AUDIT_LOGS_READ: 'audit-logs.read',

  REPORTS_READ: 'reports.read',

  INVITEES_READ: 'invitees.read',
  INVITEES_CREATE: 'invitees.create',
  INVITEES_UPDATE: 'invitees.update',
  INVITEES_DELETE: 'invitees.delete',

  INVITATIONS_READ: 'invitations.read',
  INVITATIONS_CREATE: 'invitations.create',
  INVITATIONS_UPDATE: 'invitations.update',
  INVITATIONS_DELETE: 'invitations.delete',
  INVITATIONS_SEND: 'invitations.send',
  INVITATIONS_CHECK_IN: 'invitations.check_in',
} as const;

/**
 * Union of every valid application permission.
 *
 * Example:
 *   'users.read' | 'users.create' | ...
 */
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Canonical permission format.
 *
 * Allows:
 *   users.read
 *   audit-logs.read
 *   registrations.check-in
 *   invitations.check_in
 *
 * Rejects:
 *   USERS.READ
 *   users
 *   users..read
 *   .users.read
 *   users.
 */
export const PERMISSION_NAME_PATTERN =
  /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*)+$/;

/**
 * Default permissions installed by the application.
 *
 * Derived from PERMISSIONS so that adding a new permission to
 * PERMISSIONS automatically makes it part of the default set.
 */
export const DEFAULT_PERMISSIONS: readonly PermissionCode[] =
  Object.values(PERMISSIONS);
