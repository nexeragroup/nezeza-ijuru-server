import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { PERMISSIONS } from '../../common/constants/permission.constants';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  @Public()
  publicSettings() { return this.settings.findPublic(); }

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_READ)
  all() { return this.settings.findAll(); }

  @Put(':key')
  @Permissions(PERMISSIONS.SETTINGS_UPDATE)
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto) { return this.settings.update(key, dto); }
}
