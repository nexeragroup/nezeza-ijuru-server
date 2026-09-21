import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsEntity } from '../../features/events/entity/events.entity';
import { SessionsEntity } from '../../features/sessions/entity/sessions.entity';
import { InviteesEntity } from '../invitees/entities/invitee.entity';
import { InvitationRolesEntity } from './entities/invitation-role.entity';
import { InvitationsEntity } from './entities/invitation.entity';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InvitationsEntity,
      InvitationRolesEntity,
      InviteesEntity,
      EventsEntity,
      SessionsEntity,
    ]),
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
