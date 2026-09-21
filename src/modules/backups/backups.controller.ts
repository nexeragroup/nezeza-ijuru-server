import { ROLES } from '../../common/constants/roles.constant';
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { BackupsService } from './backups.service';
@ApiTags('backups')
@ApiBearerAuth()
@Controller('backups')
@Roles(ROLES.DEVELOPER, ROLES.ADMIN)
export class BackupsController {
  constructor(private readonly service: BackupsService) {}
  @Get('status') status() {
    return this.service.status();
  }
}
