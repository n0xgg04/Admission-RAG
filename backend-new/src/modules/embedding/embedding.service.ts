import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import axios from 'axios';

@Injectable()
export class EmbeddingService {
  constructor(private readonly config: AppConfigService) {}

  async embed(texts: string[]): Promise<number[][]> {
    const response = await axios.post(
      `${this.config.openAiBaseUrl}/embeddings`,
      {
        model: this.config.embeddingModel,
        input: texts,
      },
      {
        headers: {
          Authorization: `Bearer ${this.config.openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const data = response.data?.data || [];
    return data.map((item: any) => item.embedding);
  }

  async embedSingle(text: string): Promise<number[]> {
    const vectors = await this.embed([text]);
    return vectors[0];
  }
}
