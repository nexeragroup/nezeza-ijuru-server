import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { InviteeQueryDto } from './dto/invitee-query.dto';
import { CreateInviteeDto, UpdateInviteeDto } from './dto/invitee.dto';
import { InviteesService } from './invitees.service';
import { Permissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Invitees')
@ApiBearerAuth()
@Controller('invitees')
export class InviteesController {
  constructor(private readonly inviteesService: InviteesService) {}

  @Post()
  @Permissions(PERMISSIONS.INVITEES_CREATE)
  create(@Body() dto: CreateInviteeDto) {
    return this.inviteesService.create(dto);
  }

  @Get()
  @Permissions(PERMISSIONS.INVITEES_READ)
  findAll(@Query() query: InviteeQueryDto) {
    return this.inviteesService.findAll(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVITEES_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inviteesService.findOne(id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.INVITEES_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInviteeDto,
  ) {
    return this.inviteesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.INVITEES_DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.inviteesService.remove(id);
  }

  @Post(':id/restore')
  @Permissions(PERMISSIONS.INVITEES_UPDATE)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.inviteesService.restore(id);
  }
}
