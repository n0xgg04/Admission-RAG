import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import axios from 'axios';

export interface TransformedQueries {
  original: string;
  variants: string[];
  strategy: string;
}

@Injectable()
export class QueryTransformService {
  constructor(private readonly config: AppConfigService) {}

  async transform(query: string, recentQueries: string[]): Promise<TransformedQueries> {
    const strategy = this.classifyQuery(query);

    switch (strategy) {
      case 'multi_query':
        return this.multiQuery(query);
      case 'hyde':
        return this.hyde(query);
      case 'step_back':
        return this.stepBack(query);
      case 'rewrite':
        return this.rewrite(query, recentQueries);
      default:
        return { original: query, variants: [query], strategy: 'raw' };
    }
  }

  private classifyQuery(query: string): string {
    const lower = query.toLowerCase().trim();
    const words = lower.split(/\s+/);

    if (words.length <= 3) return 'multi_query';
    if (lower.startsWith('tại sao') || lower.startsWith('why') || lower.startsWith('how')) return 'step_back';
    if (this.hasSpecificDetail(lower)) return 'hyde';
    return 'raw';
  }

  private hasSpecificDetail(query: string): boolean {
    const patterns = [
      /\b(it\d+|bf\d+|ch\d+|me\d+|ee\d+|ep\d+|pohe\d+|troy-[a-z]+|\d{6,})\b/i,
      /\b(điểm chuẩn|học phí|chỉ tiêu|tổ hợp|mã ngành)\b/i,
    ];
    return patterns.some((p) => p.test(query));
  }

  private async rewrite(query: string, recentQueries: string[]): Promise<TransformedQueries> {
    if (!recentQueries || recentQueries.length === 0) {
      return { original: query, variants: [query], strategy: 'raw' };
    }

    const context = recentQueries.slice(-3).join('\n');
    const prompt = `Dựa trên lịch sử hội thoại gần đây, viết lại câu hỏi sau cho rõ ràng và đầy đủ. Giữ nguyên tiếng Việt. Chỉ trả về câu hỏi đã viết lại, không giải thích.

Lịch sử:
${context}

Câu hỏi cần viết lại: ${query}`;

    const rewritten = await this.callLlm(prompt, 0.3);
    return {
      original: query,
      variants: [rewritten || query],
      strategy: 'rewrite',
    };
  }

  private async hyde(query: string): Promise<TransformedQueries> {
    const prompt = `Viết một đoạn văn ngắn (2-3 câu) trả lờn câu hỏi sau. Đoạn văn có thể không chính xác hoàn toàn, chỉ dùng để tìm kiếm thông tin liên quan. Viết bằng tiếng Việt.

Câu hỏi: ${query}`;

    const hypothetical = await this.callLlm(prompt, 0.5);
    const variants = hypothetical ? [query, hypothetical] : [query];
    return { original: query, variants, strategy: 'hyde' };
  }

  private async multiQuery(query: string): Promise<TransformedQueries> {
    const prompt = `Viết 2-3 cách diễn đạt khác nhau cho câu hỏi sau, giúp tìm kiếm thông tin đa dạng hơn. Mỗi cách trên một dòng. Giữ nguyên tiếng Việt.

Câu hỏi gốc: ${query}`;

    const expanded = await this.callLlm(prompt, 0.5);
    const variants = expanded
      ? [query, ...expanded.split('\n').map((s) => s.trim()).filter((s) => s.length > 0)]
      : [query];
    return { original: query, variants: variants.slice(0, 4), strategy: 'multi_query' };
  }

  private async stepBack(query: string): Promise<TransformedQueries> {
    const prompt = `Câu hỏi sau khá cụ thể. Hãy viết lại thành một câu hỏi tổng quát hơn để tìm thêm ngữ cảnh. Giữ nguyên tiếng Việt. Chỉ trả về câu hỏi tổng quát.

Câu hỏi cụ thể: ${query}`;

    const general = await this.callLlm(prompt, 0.3);
    const variants = general ? [query, general] : [query];
    return { original: query, variants, strategy: 'step_back' };
  }

  private async callLlm(prompt: string, temperature: number): Promise<string | null> {
    try {
      const isKimi = this.config.llmProvider === 'kimi';
      const baseUrl = isKimi ? this.config.kimiBaseUrl : this.config.openRouterBaseUrl;
      const apiKey = isKimi ? this.config.kimiApiKey : this.config.openRouterApiKey;
      const model = isKimi ? this.config.kimiModel : 'openai/gpt-4o-mini';

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (!isKimi) {
        headers['HTTP-Referer'] = 'http://localhost:3000';
        headers['X-Title'] = 'Admission RAG Chatbot';
      }

      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 256,
          temperature,
        },
        { headers, timeout: 30000 },
      );

      return response.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }
}
