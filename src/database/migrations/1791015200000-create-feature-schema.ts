// @ts-nocheck
// Restored from the last verified compiled migration artifact.
'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateFeatureSchema1791015200000 = void 0;
class CreateFeatureSchema1791015200000 {
  name = 'CreateFeatureSchema1791015200000';
  async up(queryRunner) {
    await queryRunner.query(
      'CREATE TABLE "venues" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying NOT NULL, "address" character varying, "city" text, "active" boolean NOT NULL DEFAULT true, "district" character varying, "country" character varying NOT NULL DEFAULT \'Rwanda\', "latitude" numeric(10,7), "longitude" numeric(10,7), "map" text, "capacity" integer, "phone" character varying, "email" character varying, "instructions" text, "website" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cb0f885278d12384eb7a81818be" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      "CREATE TYPE \"public\".\"invitation_roles_role_enum\" AS ENUM('HOST', 'CO_HOST', 'MC', 'MODERATOR', 'FACILITATOR', 'ORGANIZER', 'COORDINATOR', 'PREACHER', 'GUEST_PREACHER', 'MINISTER', 'PRAYER_LEADER', 'WORSHIP_LEADER', 'CHOIR_MEMBER', 'SPEAKER', 'GUEST_SPEAKER', 'KEYNOTE_SPEAKER', 'PANELIST', 'INTERVIEWER', 'INTERVIEWEE', 'GUEST', 'SPECIAL_GUEST', 'CHIEF_GUEST', 'VIP', 'DELEGATE', 'PERFORMER', 'ARTIST', 'MUSICIAN', 'SINGER', 'CHOIR', 'WORSHIP_TEAM', 'BAND', 'DANCER', 'DANCE_GROUP', 'POET', 'VOLUNTEER', 'TRANSLATOR', 'INTERPRETER', 'MEDIA_PERSON', 'PHOTOGRAPHER', 'VIDEOGRAPHER', 'TECHNICAL_SUPPORT', 'OTHER')",
    );
    await queryRunner.query(
      'CREATE TABLE "invitation_roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "role" "public"."invitation_roles_role_enum" NOT NULL, "roleLabel" character varying(150), "isPrimary" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "invitationId" uuid NOT NULL, CONSTRAINT "PK_5e607c36778cb88544883936cb2" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      "CREATE TYPE \"public\".\"invitees_inviteetype_enum\" AS ENUM('PERSON', 'CHOIR', 'MINISTRY', 'BAND', 'WORSHIP_TEAM', 'DANCE_GROUP', 'ORGANIZATION', 'CHURCH', 'DELEGATION', 'MEDIA_HOUSE', 'OTHER_GROUP')",
    );
    await queryRunner.query(
      "CREATE TYPE \"public\".\"invitees_title_enum\" AS ENUM('PASTOR', 'REVEREND', 'BISHOP', 'ARCHBISHOP', 'APOSTLE', 'EVANGELIST', 'PROPHET', 'DEACON', 'ELDER', 'DOCTOR', 'PROFESSOR', 'HONORABLE', 'OTHER')",
    );
    await queryRunner.query(
      'CREATE TABLE "invitees" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "inviteetype" "public"."invitees_inviteetype_enum" NOT NULL, "displayName" character varying(180) NOT NULL, "active" boolean NOT NULL DEFAULT true, "title" "public"."invitees_title_enum", "customTitle" character varying(80), "name" character varying(255), "firstName" character varying(100), "lastName" character varying(100), "slug" character varying(200), "description" text, "bio" text, "biography" text, "organization" character varying(180), "contactPerson" character varying(180), "email" character varying(180), "phone" character varying(40), "publicEmail" character varying(180), "publicPhone" character varying(40), "country" character varying(100), "city" character varying(100), "website" character varying(500), "social" jsonb, "media" uuid, "logo_media_id" uuid, "notes" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_49807fe943a4c77bff2e1dea72d" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TYPE "public"."invitations_scope_enum" AS ENUM(\'EVENT\', \'SESSION\')',
    );
    await queryRunner.query(
      "CREATE TYPE \"public\".\"invitations_status_enum\" AS ENUM('DRAFT', 'PENDING', 'SENT', 'DELIVERED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')",
    );
    await queryRunner.query(
      "CREATE TYPE \"public\".\"invitations_attendancestatus_enum\" AS ENUM('NOT_RECORDED', 'EXPECTED', 'ARRIVED', 'ATTENDED', 'ABSENT', 'CANCELLED')",
    );
    await queryRunner.query(
      "CREATE TYPE \"public\".\"invitations_publicationstatus_enum\" AS ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')",
    );
    await queryRunner.query(
      'CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "reference" character varying(40) NOT NULL, "scope" "public"."invitations_scope_enum" NOT NULL, "status" "public"."invitations_status_enum" NOT NULL DEFAULT \'DRAFT\', "attendanceStatus" "public"."invitations_attendancestatus_enum" NOT NULL DEFAULT \'NOT_RECORDED\', "invitedAt" TIMESTAMP WITH TIME ZONE, "invitationMessage" text, "expectedArrivalAt" TIMESTAMP WITH TIME ZONE, "expectedDepartureAt" TIMESTAMP WITH TIME ZONE, "confirmedAt" TIMESTAMP WITH TIME ZONE, "declinedAt" TIMESTAMP WITH TIME ZONE, "cancelledAt" TIMESTAMP WITH TIME ZONE, "respondedAt" TIMESTAMP WITH TIME ZONE, "checkedInAt" TIMESTAMP WITH TIME ZONE, "numberOfPeople" integer, "accommodationRequired" boolean NOT NULL DEFAULT false, "transportRequired" boolean NOT NULL DEFAULT false, "specialRequirements" text, "internalNotes" text, "publicNotes" text, "isFeatured" boolean NOT NULL DEFAULT false, "publicationStatus" "public"."invitations_publicationstatus_enum" NOT NULL DEFAULT \'DRAFT\', "notificationSentAt" TIMESTAMP WITH TIME ZONE, "lastReminderAt" TIMESTAMP WITH TIME ZONE, "metadata" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "inviteeId" uuid NOT NULL, "eventId" uuid NOT NULL, "sessionId" uuid, CONSTRAINT "UQ_234c5abc6c4a676bb3a4edea27b" UNIQUE ("reference"), CONSTRAINT "chk_invitations_scope" CHECK ((scope = \'EVENT\' AND "sessionId" IS NULL) OR (scope = \'SESSION\' AND "sessionId" IS NOT NULL)), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" character varying NOT NULL, "slug" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "startAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endAt" TIMESTAMP WITH TIME ZONE NOT NULL, "capacity" integer, "registrationRequired" boolean NOT NULL DEFAULT false, "registrationOpensAt" TIMESTAMP WITH TIME ZONE, "registrationClosesAt" TIMESTAMP WITH TIME ZONE, "stream_url" text, "sessionStatus" character varying NOT NULL DEFAULT \'PLANNED\', "publicationStatus" character varying NOT NULL DEFAULT \'DRAFT\', "displayOrder" integer NOT NULL DEFAULT \'0\', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "eventId" uuid NOT NULL, "venueId" uuid, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_sessions_id_event" ON "sessions"  ("id", "eventId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "programs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "slug" character varying NOT NULL, "name" character varying NOT NULL, "summary" text, "description" text, "featuredMediaId" uuid, "publicationStatus" character varying NOT NULL DEFAULT \'DRAFT\', "publishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_4180c2bfa0402878a63b70cb4a4" UNIQUE ("slug"), CONSTRAINT "PK_d43c664bcaafc0e8a06dfd34e05" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "conferences" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "year" integer NOT NULL, "slug" character varying NOT NULL, "title" character varying NOT NULL, "theme" character varying NOT NULL, "summary" text, "description" text, "startDate" date, "endDate" date, "isCurrent" boolean NOT NULL DEFAULT false, "publicationStatus" character varying NOT NULL DEFAULT \'DRAFT\', "featuredMediaId" uuid, "publishedAt" TIMESTAMP WITH TIME ZONE, "scheduledAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_715d1a1f84c00f8837158595457" UNIQUE ("year"), CONSTRAINT "UQ_1d3f5f80c848e6d8f5a0f3b825e" UNIQUE ("slug"), CONSTRAINT "PK_d28afb89755d548215ce4e7667b" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "conference_programs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "conferenceSummary" text, "isFeatured" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "conferenceId" uuid NOT NULL, "programId" uuid NOT NULL, CONSTRAINT "PK_e6588233abe88636690122bf72c" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "slug" character varying NOT NULL, "title" character varying NOT NULL, "eventType" character varying NOT NULL, "summary" text, "description" text, "locationMode" character varying NOT NULL, "timezone" character varying NOT NULL DEFAULT \'Africa/Kigali\', "startAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endAt" TIMESTAMP WITH TIME ZONE NOT NULL, "capacity" integer, "registrationRequired" boolean NOT NULL DEFAULT false, "registrationOpensAt" TIMESTAMP WITH TIME ZONE, "registrationClosesAt" TIMESTAMP WITH TIME ZONE, "eventStatus" character varying NOT NULL DEFAULT \'PLANNED\', "publicationStatus" character varying NOT NULL DEFAULT \'DRAFT\', "isFeatured" boolean NOT NULL DEFAULT false, "featuredMediaId" uuid, "publishedAt" TIMESTAMP WITH TIME ZONE, "scheduledAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "conferenceProgramId" uuid NOT NULL, "defaultVenueId" uuid, CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "attendees" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying, "organization" character varying, "attendeeType" character varying NOT NULL, "status" character varying NOT NULL DEFAULT \'REGISTERED\', "checkedIn" boolean NOT NULL DEFAULT false, "checkedInAt" TIMESTAMP WITH TIME ZONE, "notes" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "eventId" uuid, "sessionId" uuid, CONSTRAINT "chk_attendees_target" CHECK (("attendeeType" = \'EVENT\' AND "eventId" IS NOT NULL AND "sessionId" IS NULL) OR ("attendeeType" = \'SESSION\' AND "sessionId" IS NOT NULL AND "eventId" IS NULL)), CONSTRAINT "PK_0d01acb0e67860db61a6fb61a4a" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_attendees_session_email" ON "attendees"  ("sessionId", "email") WHERE "sessionId" IS NOT NULL AND "deletedAt" IS NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_attendees_event_email" ON "attendees"  ("eventId", "email") WHERE "eventId" IS NOT NULL AND "deletedAt" IS NULL',
    );
    await queryRunner.query(
      'CREATE TABLE "media" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "targetType" character varying NOT NULL, "targetId" uuid NOT NULL, "mediaType" character varying NOT NULL, "sourceType" character varying NOT NULL, "title" character varying NOT NULL, "caption" text, "altText" text, "url" text NOT NULL, "storageKey" text, "mimeType" text, "fileSize" bigint, "durationSeconds" integer, "isFeatured" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f4e0fcac36e050de337b670d8bd" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_media_target" ON "media"  ("targetType", "targetId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "site_settings" ("setting_key" character varying(160) NOT NULL, "value" jsonb NOT NULL, "is_public" boolean NOT NULL DEFAULT false, "description" text, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1934695e327dbd254a6d0319947" PRIMARY KEY ("setting_key"))',
    );
    await queryRunner.query(
      'CREATE TABLE "updates" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "title" character varying(160) NOT NULL, "message" text NOT NULL, "category" character varying NOT NULL DEFAULT \'ANNOUNCEMENT\', "label" character varying(40), "publicationStatus" character varying NOT NULL DEFAULT \'DRAFT\', "visibleFrom" TIMESTAMP WITH TIME ZONE, "visibleUntil" TIMESTAMP WITH TIME ZONE, "publishedAt" TIMESTAMP WITH TIME ZONE, "priority" integer NOT NULL DEFAULT \'0\', "actionLabel" character varying(50), "actionUrl" character varying(2000), "version" integer NOT NULL, "createdByUserId" uuid, "updatedByUserId" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "conferenceId" uuid, "eventId" uuid, "sessionId" uuid, CONSTRAINT "ck_updates_category" CHECK ("category" IN (\'ANNOUNCEMENT\', \'PREPARATION\', \'REGISTRATION\', \'EVENT\', \'GENERAL\')), CONSTRAINT "ck_updates_status" CHECK ("publicationStatus" IN (\'DRAFT\', \'SCHEDULED\', \'PUBLISHED\', \'ARCHIVED\')), CONSTRAINT "ck_updates_window" CHECK ("visibleUntil" IS NULL OR "visibleFrom" IS NULL OR "visibleUntil" > "visibleFrom"), CONSTRAINT "ck_updates_target" CHECK (num_nonnulls("conferenceId", "eventId", "sessionId") <= 1), CONSTRAINT "PK_6029912acac4189b62b8b57c880" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_updates_visibility" ON "updates"  ("publicationStatus", "visibleFrom", "visibleUntil") ',
    );
    await queryRunner.query(
      'ALTER TABLE "invitation_roles" ADD CONSTRAINT "FK_32e9157dd516fe786b1d7687ab0" FOREIGN KEY ("invitationId") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "invitations" ADD CONSTRAINT "FK_f486f35d305965a473eaee90feb" FOREIGN KEY ("inviteeId") REFERENCES "invitees"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "invitations" ADD CONSTRAINT "FK_8dfdd031adb35b7e19733430b6f" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "invitations" ADD CONSTRAINT "FK_0eb234af456cac8bf6d1dad516d" FOREIGN KEY ("sessionId", "eventId") REFERENCES "sessions"("id","eventId") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "sessions" ADD CONSTRAINT "FK_61e25b191dd6844e30ff86e91ff" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "sessions" ADD CONSTRAINT "FK_0978abed1ad5792554fdb75467d" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" ADD CONSTRAINT "FK_494ea44da394a1bcc3ca67c2c20" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" ADD CONSTRAINT "FK_9c9f7cc9bc5451c581e6d08686c" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "events" ADD CONSTRAINT "FK_192a68de310d4ca81ca1a901832" FOREIGN KEY ("conferenceProgramId") REFERENCES "conference_programs"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "events" ADD CONSTRAINT "FK_85d88b64f37c338990cc5a16cd4" FOREIGN KEY ("defaultVenueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "attendees" ADD CONSTRAINT "FK_4925989ece225c9c203da5c225c" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "attendees" ADD CONSTRAINT "FK_9745dcd0e4dfb72736a9b7256a0" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" ADD CONSTRAINT "fk_updates_conference" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" ADD CONSTRAINT "fk_updates_event" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" ADD CONSTRAINT "fk_updates_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" ADD CONSTRAINT "fk_updates_creator" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" ADD CONSTRAINT "fk_updates_editor" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }
  async down(queryRunner) {
    await queryRunner.query(
      'ALTER TABLE "updates" DROP CONSTRAINT "fk_updates_editor"',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" DROP CONSTRAINT "fk_updates_creator"',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" DROP CONSTRAINT "fk_updates_session"',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" DROP CONSTRAINT "fk_updates_event"',
    );
    await queryRunner.query(
      'ALTER TABLE "updates" DROP CONSTRAINT "fk_updates_conference"',
    );
    await queryRunner.query(
      'ALTER TABLE "attendees" DROP CONSTRAINT "FK_9745dcd0e4dfb72736a9b7256a0"',
    );
    await queryRunner.query(
      'ALTER TABLE "attendees" DROP CONSTRAINT "FK_4925989ece225c9c203da5c225c"',
    );
    await queryRunner.query(
      'ALTER TABLE "events" DROP CONSTRAINT "FK_85d88b64f37c338990cc5a16cd4"',
    );
    await queryRunner.query(
      'ALTER TABLE "events" DROP CONSTRAINT "FK_192a68de310d4ca81ca1a901832"',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" DROP CONSTRAINT "FK_9c9f7cc9bc5451c581e6d08686c"',
    );
    await queryRunner.query(
      'ALTER TABLE "conference_programs" DROP CONSTRAINT "FK_494ea44da394a1bcc3ca67c2c20"',
    );
    await queryRunner.query(
      'ALTER TABLE "sessions" DROP CONSTRAINT "FK_0978abed1ad5792554fdb75467d"',
    );
    await queryRunner.query(
      'ALTER TABLE "sessions" DROP CONSTRAINT "FK_61e25b191dd6844e30ff86e91ff"',
    );
    await queryRunner.query(
      'ALTER TABLE "invitations" DROP CONSTRAINT "FK_0eb234af456cac8bf6d1dad516d"',
    );
    await queryRunner.query(
      'ALTER TABLE "invitations" DROP CONSTRAINT "FK_8dfdd031adb35b7e19733430b6f"',
    );
    await queryRunner.query(
      'ALTER TABLE "invitations" DROP CONSTRAINT "FK_f486f35d305965a473eaee90feb"',
    );
    await queryRunner.query(
      'ALTER TABLE "invitation_roles" DROP CONSTRAINT "FK_32e9157dd516fe786b1d7687ab0"',
    );
    await queryRunner.query('DROP INDEX "public"."idx_updates_visibility"');
    await queryRunner.query('DROP TABLE "updates"');
    await queryRunner.query('DROP TABLE "site_settings"');
    await queryRunner.query('DROP INDEX "public"."idx_media_target"');
    await queryRunner.query('DROP TABLE "media"');
    await queryRunner.query('DROP INDEX "public"."uq_attendees_event_email"');
    await queryRunner.query('DROP INDEX "public"."uq_attendees_session_email"');
    await queryRunner.query('DROP TABLE "attendees"');
    await queryRunner.query('DROP TABLE "events"');
    await queryRunner.query('DROP TABLE "conference_programs"');
    await queryRunner.query('DROP TABLE "conferences"');
    await queryRunner.query('DROP TABLE "programs"');
    await queryRunner.query('DROP INDEX "public"."uq_sessions_id_event"');
    await queryRunner.query('DROP TABLE "sessions"');
    await queryRunner.query('DROP TABLE "invitations"');
    await queryRunner.query(
      'DROP TYPE "public"."invitations_publicationstatus_enum"',
    );
    await queryRunner.query(
      'DROP TYPE "public"."invitations_attendancestatus_enum"',
    );
    await queryRunner.query('DROP TYPE "public"."invitations_status_enum"');
    await queryRunner.query('DROP TYPE "public"."invitations_scope_enum"');
    await queryRunner.query('DROP TABLE "invitees"');
    await queryRunner.query('DROP TYPE "public"."invitees_title_enum"');
    await queryRunner.query('DROP TYPE "public"."invitees_inviteetype_enum"');
    await queryRunner.query('DROP TABLE "invitation_roles"');
    await queryRunner.query('DROP TYPE "public"."invitation_roles_role_enum"');
    await queryRunner.query('DROP TABLE "venues"');
  }
}
exports.CreateFeatureSchema1791015200000 = CreateFeatureSchema1791015200000;
