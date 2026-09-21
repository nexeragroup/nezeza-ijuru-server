import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  CheckInAttendee,
  NewAttendee,
  UpdateAttendee,
} from './dto/attendee.dto';
import { AttendeesEntity } from './entity/attendees.entity';
import { AttendeesService } from './attendees.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PublicRegistrationDto } from './dto/public-registration.dto';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { Public } from '../../common/decorators/public.decorator';

@Controller('attendees')
@Permissions(PERMISSIONS.ATTENDEES_READ)
export class AttendeesController {
  constructor(private readonly attendeesService: AttendeesService) {}

  @Post('register')
  @Public()
  register(@Body() dto: PublicRegistrationDto) {
    return this.attendeesService.registerPublic(dto);
  }

  @Post('new')
  @Permissions(PERMISSIONS.ATTENDEES_CREATE)
  createAttendee(@Body() dto: NewAttendee): Promise<AttendeesEntity> {
    return this.attendeesService.createAttendee(dto);
  }

  @Get('all')
  allAttendees(): Promise<AttendeesEntity[]> {
    return this.attendeesService.findAllAttendees();
  }

  @Get('event/:eventId')
  eventAttendees(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<AttendeesEntity[]> {
    return this.attendeesService.findEventAttendees(eventId);
  }

  @Get('session/:sessionId')
  sessionAttendees(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<AttendeesEntity[]> {
    return this.attendeesService.findSessionAttendees(sessionId);
  }

  @Get(':id')
  attendeeByID(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttendeesEntity> {
    return this.attendeesService.findAttendeeByID(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.ATTENDEES_UPDATE)
  updateAttendee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendee,
  ): Promise<AttendeesEntity> {
    return this.attendeesService.updateAttendee(id, dto);
  }

  @Patch(':id/check-in')
  @Permissions(PERMISSIONS.REGISTRATIONS_CHECK_IN)
  checkInAttendee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInAttendee,
  ): Promise<AttendeesEntity> {
    return this.attendeesService.checkInAttendee(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ATTENDEES_UPDATE)
  softDeleteAttendee(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.attendeesService.softDeleteAttendee(id);
  }

  @Patch(':id/restore')
  @Permissions(PERMISSIONS.ATTENDEES_UPDATE)
  restoreAttendee(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttendeesEntity> {
    return this.attendeesService.restoreAttendee(id);
  }
}
