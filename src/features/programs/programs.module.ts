import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramsEntity } from './entity/programs.entity';
import { MediaEntity } from '../media/entity/media.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProgramsEntity, MediaEntity])],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
