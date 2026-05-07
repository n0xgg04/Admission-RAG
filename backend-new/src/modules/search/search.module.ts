import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { QdrantModule } from '../qdrant/qdrant.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { QueryTransformModule } from '../query-transform/query-transform.module';
import { QueryPreprocessModule } from '../query-preprocess/query-preprocess.module';
import { RagToolsModule } from '../rag-tools/rag-tools.module';
import { RerankerModule } from '../reranker/reranker.module';
import { AppConfigService } from '../../config/app-config.service';

@Module({
  imports: [QdrantModule, EmbeddingModule, QueryTransformModule, QueryPreprocessModule, RagToolsModule, RerankerModule],
  controllers: [SearchController],
  providers: [SearchService, AppConfigService],
  exports: [SearchService],
})
export class SearchModule {}
