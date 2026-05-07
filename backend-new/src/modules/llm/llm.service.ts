import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import axios from 'axios';

@Injectable()
export class LlmService {
  constructor(private readonly config: AppConfigService) {}

  async generate(query: string, contextBlocks: string[]): Promise<string> {
    const systemPrompt = `Bạn là trợ lý tư vấn tuyển sinh đại học Việt Nam năm 2025, hỗ trợ học sinh và phụ huynh tra cứu thông tin tuyển sinh.

QUY TẮC QUAN TRỌNG:
1. Chỉ trả lờn dựa trên context được cung cấp. KHÔNG bịa đặt, KHÔNG suy diễn ngoài dữ liệu.
2. Nếu context không đủ thông tin, hãy nói rõ "Theo dữ liệu hiện có, mình chưa có thông tin đầy đủ về..." và gợi ý nguồn tham khảo khác.
3. Trả lờn bằng tiếng Việt, ngắn gọn, rõ ràng, dùng bullet points khi phù hợp.
4. Không đề cập đến các thuật ngữ kỹ thuật như "vector", "chunk", "embedding", "retrieval".
5. Ưu tiên trả lờn gần đúng và gắn nhãn "tham khảo gần nhất" thay vì từ chối hoàn toàn.
6. Phong cách lịch sự, hữu ích, như một chuyên viên tư vấn tuyển sinh.`;

    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    if (contextBlocks.length > 0) {
      messages.push({
        role: 'user',
        content: `Dựa trên thông tin sau đây:\n\n${contextBlocks.join('\n\n---\n\n')}\n\nHãy trả lờn câu hỏi: ${query}`,
      });
    } else {
      messages.push({ role: 'user', content: query });
    }

    return this.callDeepSeek(messages);
  }

  async generateWithHistory(
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const systemPrompt = `Bạn là trợ lý tư vấn tuyển sinh đại học Việt Nam năm 2025.`;

    const fullMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    return this.callDeepSeek(fullMessages);
  }

  async *generateStream(query: string, contextBlocks: string[]): AsyncGenerator<string> {
    const answer = await this.generate(query, contextBlocks);
    const chunks = answer.split(/(?=\s)/g);
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  private async callDeepSeek(messages: Array<{ role: string; content: string }>): Promise<string> {
    try {
      const response = await axios.post(
        `${this.config.deepseekBaseUrl}/chat/completions`,
        {
          model: this.config.deepseekModel,
          messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.deepseekApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );

      return response.data?.choices?.[0]?.message?.content || 'Không có phản hồi.';
    } catch (error: any) {
      console.error('LLM generation error:', error.response?.status, error.response?.data?.error?.message || error.message);
      return 'Xin lỗi, đã có lỗi khi gọi dịch vụ AI. Bạn vui lòng thử lại sau.';
    }
  }
}
