import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get port(): number {
    return this.configService.get<number>('PORT', 8000);
  }

  get qdrantUrl(): string {
    return this.configService.get<string>('QDRANT_URL', 'http://localhost:6333');
  }

  get qdrantApiKey(): string | undefined {
    return this.configService.get<string>('QDRANT_API_KEY');
  }

  get qdrantCollection(): string {
    return this.configService.get<string>('QDRANT_COLLECTION', 'admission_chunks');
  }

  get embeddingProvider(): string {
    return this.configService.get<string>('EMBEDDING_PROVIDER', 'openai');
  }

  get embeddingModel(): string {
    return this.configService.get<string>('EMBEDDING_MODEL', 'text-embedding-3-small');
  }

  get embeddingDim(): number {
    const val = this.configService.get<string | number>('EMBEDDING_DIM', 1536);
    return typeof val === 'string' ? parseInt(val, 10) : val;
  }

  get openAiApiKey(): string {
    return this.configService.get<string>('OPENAI_API_KEY', '');
  }

  get openAiBaseUrl(): string {
    return this.configService.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1');
  }

  get llmProvider(): string {
    return this.configService.get<string>('LLM_PROVIDER', 'openrouter');
  }

  get openRouterApiKey(): string {
    return this.configService.get<string>('OPENROUTER_API_KEY', '');
  }

  get openRouterModel(): string {
    return this.configService.get<string>('OPENROUTER_MODEL', 'openai/gpt-oss-120b:free');
  }

  get openRouterBaseUrl(): string {
    return this.configService.get<string>('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
  }

  get kimiApiKey(): string {
    return this.configService.get<string>('KIMI_API_KEY', '');
  }

  get kimiModel(): string {
    return this.configService.get<string>('KIMI_MODEL', 'kimi-k2.6');
  }

  get kimiBaseUrl(): string {
    return this.configService.get<string>('KIMI_BASE_URL', 'https://api.moonshot.ai/v1');
  }

  get deepseekApiKey(): string {
    return this.configService.get<string>('DEEPSEEK_API_KEY', '');
  }

  get deepseekModel(): string {
    return this.configService.get<string>('DEEPSEEK_MODEL', 'deepseek-v4-pro');
  }

  get deepseekBaseUrl(): string {
    return this.configService.get<string>('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1');
  }

  get topK(): number {
    const val = this.configService.get<string | number>('TOP_K', 8);
    return typeof val === 'string' ? parseInt(val, 10) : val;
  }

  get candidateK(): number {
    const val = this.configService.get<string | number>('CANDIDATE_K', 100);
    return typeof val === 'string' ? parseInt(val, 10) : val;
  }

  get maxTokens(): number {
    const val = this.configService.get<string | number>('MAX_TOKENS', 1024);
    return typeof val === 'string' ? parseInt(val, 10) : val;
  }

  get temperature(): number {
    const val = this.configService.get<string | number>('TEMPERATURE', 0.4);
    return typeof val === 'string' ? parseFloat(val) : val;
  }

  get dataDir(): string {
    return this.configService.get<string>('DATA_DIR', '../data');
  }
}
