import { Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { AppConfigService } from '../../config/app-config.service';

@Module({
  providers: [QdrantService, AppConfigService],
  exports: [QdrantService],
})
export class QdrantModule {}
