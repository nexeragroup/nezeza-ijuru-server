import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Put,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NewProgram, UpdateProgram } from './dto/program.dto';
import { ProgramResponseDto } from './dto/program-response.dto';
import { ProgramsService } from './programs.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { Public } from '../../common/decorators/public.decorator';

@Controller('programs')
@Permissions(PERMISSIONS.PROGRAMS_READ)
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Post('new')
  @Permissions(PERMISSIONS.PROGRAMS_CREATE)
  createProgram(@Body() dto: NewProgram): Promise<ProgramResponseDto> {
    return this.programsService.createProgram(dto);
  }

  @Post('bulk')
  @Permissions(PERMISSIONS.PROGRAMS_CREATE)
  createBulkPrograms(
    @Body(new ParseArrayPipe({ items: NewProgram })) payload: NewProgram[],
  ): Promise<ProgramResponseDto[]> {
    return this.programsService.createBulkPrograms(payload);
  }

  @Get('published')
  @Public()
  publishedPrograms(): Promise<ProgramResponseDto[]> {
    return this.programsService.findPublishedPrograms();
  }

  @Get('all')
  @Permissions(PERMISSIONS.PROGRAMS_READ)
  allPrograms(): Promise<ProgramResponseDto[]> {
    return this.programsService.findAllPrograms();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PROGRAMS_READ)
  programByID(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProgramResponseDto> {
    return this.programsService.findProgramByID(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.PROGRAMS_UPDATE)
  updateProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgram,
  ): Promise<ProgramResponseDto> {
    return this.programsService.updateProgram(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PROGRAMS_UPDATE)
  softDeleteProgram(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.programsService.softDeleteProgram(id);
  }

  @Patch(':id/restore')
  @Permissions(PERMISSIONS.PROGRAMS_UPDATE)
  restoreProgram(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProgramResponseDto> {
    return this.programsService.restoreProgram(id);
  }
}
