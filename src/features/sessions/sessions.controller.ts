import {
  Body,
  Controller,
  Delete,
  Get,
  ParseArrayPipe,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { NewSession, UpdateSession } from './dto/session.dto';
import { SessionsEntity } from './entity/sessions.entity';
import { SessionsService } from './sessions.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permission.constants';

@Controller('sessions')
@Permissions(PERMISSIONS.SESSIONS_READ)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('new')
  @Permissions(PERMISSIONS.SESSIONS_CREATE)
  createSession(@Body() dto: NewSession): Promise<SessionsEntity> {
    return this.sessionsService.createSession(dto);
  }

  @Post('bulk')
  @Permissions(PERMISSIONS.SESSIONS_CREATE)
  createBulkSessions(
    @Body(new ParseArrayPipe({ items: NewSession })) payload: NewSession[],
  ): Promise<SessionsEntity[]> {
    return this.sessionsService.createBulkSessions(payload);
  }

  @Get('all')
  allSessions(): Promise<SessionsEntity[]> {
    return this.sessionsService.findAllSessions();
  }

  @Get('event/:eventId')
  sessionsByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<SessionsEntity[]> {
    return this.sessionsService.findSessionsByEvent(eventId);
  }

  @Get(':id')
  sessionByID(@Param('id', ParseUUIDPipe) id: string): Promise<SessionsEntity> {
    return this.sessionsService.findSessionByID(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.SESSIONS_UPDATE)
  updateSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSession,
  ): Promise<SessionsEntity> {
    return this.sessionsService.updateSession(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.SESSIONS_UPDATE)
  softDeleteSession(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sessionsService.softDeleteSession(id);
  }

  @Patch(':id/restore')
  @Permissions(PERMISSIONS.SESSIONS_UPDATE)
  restoreSession(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionsEntity> {
    return this.sessionsService.restoreSession(id);
  }
}
