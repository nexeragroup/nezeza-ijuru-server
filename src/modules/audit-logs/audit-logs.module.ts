import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AppLogger } from '../../common/services/app-logger.service';
import { AuditLogEntity } from './entity/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AppLogger],
  exports: [AuditLogsService, AppLogger],
})
export class AuditLogsModule {}
