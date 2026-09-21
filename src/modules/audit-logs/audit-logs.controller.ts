import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PERMISSIONS } from '../../common/constants/permission.constants';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_LOGS_READ)
  list(@Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number) {
    return this.service.list({ limit });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.AUDIT_LOGS_READ)
  async findOne(@Param('id') id: string) {
    const entry = await this.service.findById(id);
    if (!entry) throw new NotFoundException('Audit entry not found');
    return entry;
  }
}
