import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsEntity } from '../events/entity/events.entity';
import { VenuesEntity } from '../venues/entity/venues.entity';
import { SessionsEntity } from './entity/sessions.entity';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SessionsEntity, EventsEntity, VenuesEntity]),
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
