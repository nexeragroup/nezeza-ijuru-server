import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteSettingEntity } from './entities/site-setting.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([SiteSettingEntity])],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
