import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationsEntity } from '../invitations/entities/invitation.entity';
import { InviteesEntity } from './entities/invitee.entity';
import { InviteesController } from './invitees.controller';
import { InviteesService } from './invitees.service';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InviteesEntity, InvitationsEntity]),
    CommonModule,
  ],
  controllers: [InviteesController],
  providers: [InviteesService],
  exports: [InviteesService],
})
export class InviteesModule {}
