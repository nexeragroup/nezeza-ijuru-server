import { ROLES } from '../../common/constants/roles.constant';
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BackupsService } from './backups.service';
@ApiTags('backups')
@ApiBearerAuth()
@Controller('backups')
export class BackupsController {
  constructor(private readonly service: BackupsService) {}
  @Get('status') status() {
    return this.service.status();
  }
}
