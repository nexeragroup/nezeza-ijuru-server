import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConferenceProgramsEntity } from '../conferences/entity/conference-programs.entity';
import { ConferencesEntity } from '../conferences/entity/conferences.entity';
import { EventsEntity } from '../events/entity/events.entity';
import { SessionsEntity } from '../sessions/entity/sessions.entity';
import { MediaEntity } from './entity/media.entity';
import { LivestreamService } from './livestream.service';
import { YoutubeService } from './youtube.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MediaEntity,
      ConferencesEntity,
      ConferenceProgramsEntity,
      EventsEntity,
      SessionsEntity,
    ]),
  ],
  exports: [LivestreamService, MediaService],
  controllers: [MediaController],
  providers: [MediaService, YoutubeService, LivestreamService],
})
export class MediaModule {}
