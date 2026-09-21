import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesEntity } from './entity/roles.entity';
import { PermissionsModule } from '../permissions/permissions.module';
@Module({
  imports: [TypeOrmModule.forFeature([RolesEntity]), PermissionsModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
