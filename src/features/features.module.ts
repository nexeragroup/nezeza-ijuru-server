import { UpdatesModule } from './updates/updates.module';
import { Module } from '@nestjs/common';
import { ConferencesModule } from './conferences/conferences.module';
import { ProgramsModule } from './programs/programs.module';
import { EventsModule } from './events/events.module';
import { VenuesModule } from './venues/venues.module';
import { SessionsModule } from './sessions/sessions.module';
import { InvitationsModule } from './invitations/invitations.module';
import { InviteesModule } from './invitees/invitees.module';
import { AttendeesModule } from './attendees/attendees.module';
import { MediaModule } from './media/media.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    UpdatesModule,
    ConferencesModule,
    ProgramsModule,
    EventsModule,
    VenuesModule,
    SessionsModule,
    InvitationsModule,
    InviteesModule,
    AttendeesModule,
    MediaModule,
    SettingsModule,
  ],
  controllers: [],
  providers: [],
})
export class FeaturesModule {}
