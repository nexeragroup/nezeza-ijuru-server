import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SiteSettingEntity } from './entities/site-setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SiteSettingEntity)
    private readonly repository: Repository<SiteSettingEntity>,
  ) {}

  findAll(): Promise<SiteSettingEntity[]> {
    return this.repository.find({ order: { settingKey: 'ASC' } });
  }

  findPublic(): Promise<SiteSettingEntity[]> {
    return this.repository.find({ where: { isPublic: true }, order: { settingKey: 'ASC' } });
  }

  async update(key: string, dto: UpdateSettingDto): Promise<SiteSettingEntity> {
    const setting = await this.repository.findOneBy({ settingKey: key });
    if (!setting) throw new NotFoundException('Setting not found');
    Object.assign(setting, {
      value: dto.value,
      ...(dto.isPublic === undefined ? {} : { isPublic: dto.isPublic }),
      ...(dto.description === undefined ? {} : { description: dto.description.trim() || null }),
    });
    return this.repository.save(setting);
  }
}
