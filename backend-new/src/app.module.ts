import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { QdrantModule } from './modules/qdrant/qdrant.module';
import { EmbeddingModule } from './modules/embedding/embedding.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { SearchModule } from './modules/search/search.module';
import { ChatModule } from './modules/chat/chat.module';
import { LlmModule } from './modules/llm/llm.module';
import { QueryTransformModule } from './modules/query-transform/query-transform.module';
import { QueryPreprocessModule } from './modules/query-preprocess/query-preprocess.module';
import { RagToolsModule } from './modules/rag-tools/rag-tools.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RerankerModule } from './modules/reranker/reranker.module';
import { AppConfigService } from './config/app-config.service';
import { DebugController } from './modules/debug/debug.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    QdrantModule,
    EmbeddingModule,
    IngestModule,
    SearchModule,
    ChatModule,
    LlmModule,
    QueryTransformModule,
    QueryPreprocessModule,
    RagToolsModule,
    ConversationModule,
    PrismaModule,
    RerankerModule,
  ],
  controllers: [DebugController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppModule {}
