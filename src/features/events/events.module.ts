import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConferenceProgramsEntity } from '../conferences/entity/conference-programs.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import { VenuesEntity } from '../venues/entity/venues.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsEntity } from './entity/events.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventsEntity,
      ConferenceProgramsEntity,
      VenuesEntity,
      SessionsEntity,
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
