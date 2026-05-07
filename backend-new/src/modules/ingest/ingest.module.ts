import { Module } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { QdrantModule } from '../qdrant/qdrant.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { AppConfigService } from '../../config/app-config.service';
import { IngestController } from './ingest.controller';

@Module({
  imports: [QdrantModule, EmbeddingModule],
  controllers: [IngestController],
  providers: [IngestService, AppConfigService],
  exports: [IngestService],
})
export class IngestModule {}
