import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { AppConfigService } from '../../config/app-config.service';

@Module({
  providers: [EmbeddingService, AppConfigService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
