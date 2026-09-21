import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-request.interface';
import { CreateUpdateDto, EditUpdateDto, PublishUpdateDto } from './dto/update.dto';
import { UpdatesService } from './updates.service';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('feed')
  @Public()
  feed() { return this.updatesService.feed(); }

  @Get('targets')
  @Permissions(PERMISSIONS.UPDATES_READ)
  targets() { return this.updatesService.targets(); }

  @Get()
  @Permissions(PERMISSIONS.UPDATES_READ)
  all() { return this.updatesService.all(); }

  @Post()
  @Permissions(PERMISSIONS.UPDATES_CREATE)
  create(@Body() dto: CreateUpdateDto, @CurrentUser() user: AuthenticatedUser) { return this.updatesService.create(dto, user); }

  @Patch(':id')
  @Permissions(PERMISSIONS.UPDATES_UPDATE)
  edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditUpdateDto, @CurrentUser() user: AuthenticatedUser) { return this.updatesService.edit(id, dto, user); }

  @Patch(':id/publication')
  @Permissions(PERMISSIONS.UPDATES_UPDATE)
  publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishUpdateDto, @CurrentUser() user: AuthenticatedUser) { return this.updatesService.publish(id, dto, user); }
}
