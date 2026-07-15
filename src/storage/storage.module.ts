import { Module } from '@nestjs/common';
import { PhotoStorageService } from './photo-storage.service';

@Module({
  providers: [PhotoStorageService],
  exports: [PhotoStorageService],
})
export class StorageModule {}
