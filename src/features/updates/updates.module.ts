import { Module } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { UpdatesController } from './updates.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConferencesEntity } from '../conferences/entity/conferences.entity';
import { EventsEntity } from '../events/entity/events.entity';
import { MediaModule } from '../media/media.module';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import { UpdateEntity } from './entity/update.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UpdateEntity,
      ConferencesEntity,
      EventsEntity,
      SessionsEntity,
    ]),
    MediaModule,
  ],
  controllers: [UpdatesController],
  providers: [UpdatesService],
})
export class UpdatesModule {}
