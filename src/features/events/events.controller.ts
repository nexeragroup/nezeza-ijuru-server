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
import { NewEvent, UpdateEvent } from './dto/event.dto';
import { EventsService } from './events.service';
import { EventsEntity } from './entity/events.entity';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permission.constants';

@Controller('events')
@Permissions(PERMISSIONS.EVENTS_READ)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('new')
  @Permissions(PERMISSIONS.EVENTS_CREATE)
  createEvent(@Body() dto: NewEvent): Promise<EventsEntity> {
    return this.eventsService.createEvent(dto);
  }

  @Post('bulk')
  @Permissions(PERMISSIONS.EVENTS_CREATE)
  createBulkEvents(
    @Body(new ParseArrayPipe({ items: NewEvent })) payload: NewEvent[],
  ): Promise<EventsEntity[]> {
    return this.eventsService.createBulkEvents(payload);
  }

  @Get('all')
  allEvents(): Promise<EventsEntity[]> {
    return this.eventsService.findAllEvents();
  }

  @Get('program/:programId')
  eventsByProgram(
    @Param('programId', ParseUUIDPipe) programId: string,
  ): Promise<EventsEntity[]> {
    return this.eventsService.findEventsByProgram(programId);
  }

  @Get(':id')
  eventByID(@Param('id', ParseUUIDPipe) id: string): Promise<EventsEntity> {
    return this.eventsService.findEventByID(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.EVENTS_UPDATE)
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEvent,
  ): Promise<EventsEntity> {
    return this.eventsService.updateEvent(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.EVENTS_UPDATE)
  softDeleteEvent(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.eventsService.softDeleteEvent(id);
  }

  @Patch(':id/restore')
  @Permissions(PERMISSIONS.EVENTS_UPDATE)
  restoreEvent(@Param('id', ParseUUIDPipe) id: string): Promise<EventsEntity> {
    return this.eventsService.restoreEvent(id);
  }
}
