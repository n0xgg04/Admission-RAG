import { Controller, Get } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { LlmService } from '../llm/llm.service';

@Controller('api/v1/debug')
export class DebugController {
  constructor(
    private readonly embedding: EmbeddingService,
    private readonly qdrant: QdrantService,
    private readonly llm: LlmService,
  ) {}

  @Get('env')
  env() {
    return {
      has_openai_key: !!process.env.OPENAI_API_KEY,
      has_qdrant_url: !!process.env.QDRANT_URL,
      has_deepseek_key: !!process.env.DEEPSEEK_API_KEY,
      has_database_url: !!process.env.DATABASE_URL,
      node_env: process.env.NODE_ENV,
    };
  }

  @Get('embedding')
  async testEmbedding() {
    try {
      const vector = await this.embedding.embedSingle('test query');
      return { success: true, dim: vector.length };
    } catch (err: any) {
      return { success: false, error: err.message, status: err.response?.status };
    }
  }

  @Get('qdrant')
  async testQdrant() {
    try {
      const vector = Array(1536).fill(0).map(() => Math.random() * 2 - 1);
      const hits = await this.qdrant.search(vector, 3);
      return { success: true, hits: hits.length };
    } catch (err: any) {
      return { success: false, error: err.message, status: err.response?.status, data: err.response?.data };
    }
  }

  @Get('llm')
  async testLlm() {
    try {
      const answer = await this.llm.generate('Hello', []);
      return { success: true, answer: answer.slice(0, 50) };
    } catch (err: any) {
      return { success: false, error: err.message, status: err.response?.status };
    }
  }
}
