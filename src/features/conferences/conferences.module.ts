import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramsEntity } from '../programs/entity/programs.entity';
import { ConferencesService } from './conferences.service';
import { ConferenceProgramsEntity } from './entity/conference-programs.entity';
import { ConferencesEntity } from './entity/conferences.entity';
import { ConferencesController } from './conferences.controller';
import { MediaEntity } from '../media/entity/media.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConferencesEntity,
      ConferenceProgramsEntity,
      ProgramsEntity,
      MediaEntity,
    ]),
  ],
  controllers: [ConferencesController],
  providers: [ConferencesService],
  exports: [ConferencesService],
})
export class ConferencesModule {}
