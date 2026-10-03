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
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { NewVenue, UpdateVenue } from './dto/venue.dto';
import { VenuesService } from './venues.service';

@Controller('venues')
@Permissions(PERMISSIONS.VENUES_READ)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post('new')
  @Permissions(PERMISSIONS.VENUES_CREATE)
  create(@Body() dto: NewVenue) {
    return this.venuesService.createVenue(dto);
  }

  @Get('all')
  findAll() {
    return this.venuesService.findAllVenues();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.findVenueByID(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.VENUES_UPDATE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVenue) {
    return this.venuesService.updateVenue(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.VENUES_UPDATE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.softDeleteVenue(id);
  }

  @Patch(':id/restore')
  @Permissions(PERMISSIONS.VENUES_UPDATE)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.restoreVenue(id);
  }
}
