import { Injectable } from '@nestjs/common';
import { SearchService } from '../search/search.service';
import { LlmService } from '../llm/llm.service';
import { ConversationService, ChatMessage } from '../conversation/conversation.service';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly searchService: SearchService,
    private readonly llm: LlmService,
    private readonly conversationService: ConversationService,
    private readonly config: AppConfigService,
  ) {}

  async answer(query: string, session_id?: string, university_code?: string): Promise<{
    answer: string;
    session_id: string;
    used_chunks: number;
    data_sufficient: boolean;
    note: string | null;
  }> {
    let conversation: any = session_id ? await this.conversationService.findById(session_id) : null;
    if (!conversation) {
      conversation = await this.conversationService.create();
    }

    const session_id_result = conversation.id;
    const recentQueries = (conversation.messages || [])
      .filter((m) => m.role === 'user')
      .slice(-5)
      .map((m) => m.content);

    const hits = await this.searchService.search(query, university_code, recentQueries);
    const topHits = hits.slice(0, this.config.topK);
    const hasRelevantHits = topHits.length > 0 && topHits[0].score > 0.5;

    let answer: string;
    let data_sufficient: boolean;
    let note: string | null;

    if (hasRelevantHits) {
      const contextBlocks = topHits.map((h) => h.text.slice(0, 700));
      answer = await this.llm.generate(query, contextBlocks);
      data_sufficient = true;
      note = null;
    } else {
      answer = await this.llm.generate(query, []);
      data_sufficient = false;
      note = 'Không tìm thấy thông tin liên quan trong cơ sở dữ liệu.';
    }

    await this.conversationService.appendMessage(conversation.id, {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    });
    await this.conversationService.appendMessage(conversation.id, {
      role: 'assistant',
      content: answer,
      timestamp: new Date().toISOString(),
    });

    return {
      answer,
      session_id: session_id_result,
      used_chunks: topHits.length,
      data_sufficient,
      note,
    };
  }

  async answerWithHistory(session_id: string, query: string, university_code?: string): Promise<string> {
    const conversation = await this.conversationService.findById(session_id);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const hits = await this.searchService.search(query, university_code);
    const topHits = hits.slice(0, this.config.topK);
    const contextBlocks = topHits.map((h) => h.text.slice(0, 700));

    const historyMessages = (conversation.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    historyMessages.push({
      role: 'user',
      content: contextBlocks.length > 0
        ? `Dựa trên thông tin sau:\n\n${contextBlocks.join('\n\n')}\n\nCâu hỏi: ${query}`
        : query,
    });

    return this.llm.generateWithHistory(historyMessages);
  }

  async *answerStream(
    query: string,
    session_id?: string,
    university_code?: string,
  ): AsyncGenerator<
    | { type: 'chunk'; text: string }
    | { type: 'done'; session_id: string; used_chunks: number; data_sufficient: boolean; note: string | null }
  > {
    let conversation: any = session_id ? await this.conversationService.findById(session_id) : null;
    if (!conversation) {
      conversation = await this.conversationService.create();
    }

    const session_id_result = conversation.id;
    const recentQueries = (conversation.messages || [])
      .filter((m) => m.role === 'user')
      .slice(-5)
      .map((m) => m.content);

    const hits = await this.searchService.search(query, university_code, recentQueries);
    const topHits = hits.slice(0, this.config.topK);
    const hasRelevantHits = topHits.length > 0 && topHits[0].score > 0.5;

    const contextBlocks = hasRelevantHits ? topHits.map((h) => h.text.slice(0, 700)) : [];
    let data_sufficient = hasRelevantHits;
    let note: string | null = hasRelevantHits ? null : 'Không tìm thấy thông tin liên quan trong cơ sở dữ liệu.';

    let fullAnswer = '';
    const stream = this.llm.generateStream(query, contextBlocks);
    for await (const chunk of stream) {
      fullAnswer += chunk;
      yield { type: 'chunk', text: chunk };
    }

    await this.conversationService.appendMessage(conversation.id, {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    });
    await this.conversationService.appendMessage(conversation.id, {
      role: 'assistant',
      content: fullAnswer,
      timestamp: new Date().toISOString(),
    });

    yield {
      type: 'done',
      session_id: session_id_result,
      used_chunks: topHits.length,
      data_sufficient,
      note,
    };
  }
}
