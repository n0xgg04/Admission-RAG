import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import axios from 'axios';

export interface RankedHit {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, any>;
}

@Injectable()
export class RerankerService {
  constructor(private readonly config: AppConfigService) {}

  async rerank(query: string, hits: RankedHit[], topK = 8): Promise<RankedHit[]> {
    if (hits.length <= topK) return hits;

    const keywordScores = this.scoreByKeywords(query, hits.map((h) => h.text));
    let llmScores: number[] | null = null;

    if (this.config.llmProvider) {
      try {
        llmScores = await this.scorePairsByLlm(query, hits.map((h) => h.text));
      } catch {
        llmScores = null;
      }
    }

    const scored = hits.map((h, i) => {
      const kwScore = keywordScores[i];
      const llmScore = llmScores ? llmScores[i] : null;
      const blended = llmScore !== null ? kwScore * 0.4 + llmScore * 0.6 : kwScore;
      return { ...h, rerankScore: blended };
    });

    scored.sort((a, b) => b.rerankScore - a.rerankScore);
    return scored.slice(0, topK);
  }

  private scoreByKeywords(query: string, documents: string[]): number[] {
    const queryTerms = this.extractTerms(query);
    if (queryTerms.length === 0) return documents.map(() => 0.5);

    return documents.map((doc) => {
      const docTerms = this.extractTerms(doc);
      let matches = 0;
      for (const term of queryTerms) {
        if (docTerms.includes(term)) matches++;
      }
      const precision = matches / queryTerms.length;
      const recall = docTerms.length > 0 ? matches / docTerms.length : 0;
      return 0.5 + 0.5 * (2 * precision * recall) / (precision + recall + 0.001);
    });
  }

  private extractTerms(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  private async scorePairsByLlm(query: string, documents: string[]): Promise<number[]> {
    const isKimi = this.config.llmProvider === 'kimi';
    const baseUrl = isKimi ? this.config.kimiBaseUrl : this.config.openRouterBaseUrl;
    const apiKey = isKimi ? this.config.kimiApiKey : this.config.openRouterApiKey;
    const model = isKimi ? this.config.kimiModel : 'openai/gpt-4o-mini';

    if (!apiKey) throw new Error('No LLM API key configured');

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (!isKimi) {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'Admission RAG Chatbot';
    }

    const prompt = `Đánh giá độ liên quan của từng đoạn văn bản sau đối với câu hỏi. Trả về JSON array các số từ 0-10, mỗi số tương ứng với một đoạn văn. 10 = rất liên quan, 0 = không liên quan.

Câu hỏi: ${query}

Các đoạn văn:
${documents.map((d, i) => `${i + 1}. ${d.slice(0, 300)}`).join('\n\n')}

JSON array:`;

    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 128,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      },
      { headers, timeout: 30000 },
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response');

    const parsed = JSON.parse(content);
    const scores = Array.isArray(parsed) ? parsed : parsed.scores || parsed.ratings || [];
    return scores.map((s: any) => (typeof s === 'number' ? s / 10 : 0.5));
  }
}
