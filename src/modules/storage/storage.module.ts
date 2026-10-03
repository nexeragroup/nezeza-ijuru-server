import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageController } from './controllers/storage.controller';
import { StorageFileEntity } from './entities/storage-file.entity';
import { LocalStorageService } from './services/local-storage.service';
import { StorageService } from './services/storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([StorageFileEntity])],
  controllers: [StorageController],
  providers: [LocalStorageService, StorageService],
  exports: [LocalStorageService, StorageService],
})
export class StorageModule {}
