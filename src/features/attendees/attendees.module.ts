import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsEntity } from '../events/entity/events.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import { AttendeesController } from './attendees.controller';
import { AttendeesService } from './attendees.service';
import { AttendeesEntity } from './entity/attendees.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendeesEntity, EventsEntity, SessionsEntity]),
  ],
  controllers: [AttendeesController],
  providers: [AttendeesService],
  exports: [AttendeesService],
})
export class AttendeesModule {}
