import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/invitation.dto';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @Permissions(PERMISSIONS.INVITATIONS_CREATE)
  create(@Body() payload: CreateInvitationDto) { return this.invitationsService.create(payload); }

  @Get()
  @Permissions(PERMISSIONS.INVITATIONS_READ)
  findAll() { return this.invitationsService.findAll(); }

  @Get(':id')
  @Permissions(PERMISSIONS.INVITATIONS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.invitationsService.findById(id); }
}
