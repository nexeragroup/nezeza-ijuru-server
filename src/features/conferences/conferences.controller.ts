import {
  Body,
  Controller,
  Delete,
  Get,
  ParseArrayPipe,
  Param,
  Patch,
  Post,
  Put,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ConferenceProgramDto,
  NewConference,
  UpdateConference,
} from './dto/conference.dto';
import { ConferencesEntity } from './entity/conferences.entity';
import {
  ConferencesService,
  PublishedConferenceProgramDetails,
} from './conferences.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '../../common/constants/permission.constants';

@Controller('conferences')
export class ConferencesController {
  constructor(private readonly conferencesService: ConferencesService) {}

  @Post('new')
  @Permissions(PERMISSIONS.CONFERENCES_CREATE)
  createConference(@Body() dto: NewConference): Promise<ConferencesEntity> {
    return this.conferencesService.createConference(dto);
  }

  @Post('bulk')
  @Permissions(PERMISSIONS.CONFERENCES_CREATE)
  createBulkConferences(
    @Body(new ParseArrayPipe({ items: NewConference }))
    payload: NewConference[],
  ): Promise<ConferencesEntity[]> {
    return this.conferencesService.createBulkConferences(payload);
  }

  @Get('all')
  @Public()
  publicConferences(): Promise<ConferencesEntity[]> {
    return this.conferencesService.findPublishedConferences();
  }

  @Get('published/:slug')
  @Public()
  publishedConference(@Param('slug') slug: string): Promise<ConferencesEntity> {
    return this.conferencesService.findPublishedConferenceBySlug(slug);
  }

  @Get('published/id/:id')
  @Public()
  publishedConferenceById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConferencesEntity> {
    return this.conferencesService.findPublishedConferenceById(id);
  }

  @Get('published/:conferenceId/program/:conferenceProgramId')
  @Public()
  publishedConferenceProgram(
    @Param('conferenceId', ParseUUIDPipe) conferenceId: string,
    @Param('conferenceProgramId', ParseUUIDPipe) conferenceProgramId: string,
  ): Promise<PublishedConferenceProgramDetails> {
    return this.conferencesService.findPublishedConferenceProgram(
      conferenceId,
      conferenceProgramId,
    );
  }

  @Get('current')
  @Public()
  currentConference(): Promise<ConferencesEntity> {
    return this.conferencesService.findCurrentConference();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CONFERENCES_READ)
  conferenceByID(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConferencesEntity> {
    return this.conferencesService.findConferenceByID(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.CONFERENCES_UPDATE)
  updateConference(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConference,
  ): Promise<ConferencesEntity> {
    return this.conferencesService.updateConference(id, dto);
  }

  @Put(':id/programs/:programId')
  @Permissions(PERMISSIONS.CONFERENCES_UPDATE)
  assignProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('programId', ParseUUIDPipe) programId: string,
    @Body() dto: ConferenceProgramDto,
  ): Promise<ConferencesEntity> {
    return this.conferencesService.assignProgram(id, programId, dto);
  }

  @Delete(':id/programs/:programId')
  @Permissions(PERMISSIONS.CONFERENCES_UPDATE)
  removeProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('programId', ParseUUIDPipe) programId: string,
  ): Promise<void> {
    return this.conferencesService.removeProgram(id, programId);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.CONFERENCES_UPDATE)
  softDeleteConference(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.conferencesService.softDeleteConference(id);
  }

  @Patch(':id/restore')
  @Permissions(PERMISSIONS.CONFERENCES_UPDATE)
  restoreConference(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConferencesEntity> {
    return this.conferencesService.restoreConference(id);
  }
}
