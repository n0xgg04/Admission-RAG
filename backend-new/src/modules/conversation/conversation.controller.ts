import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ConversationService, ChatMessage } from './conversation.service';

@Controller('api/v1/conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  async list() {
    const conversations = await this.conversationService.findAll();
    return { conversations };
  }

  @Post()
  async create(@Body() body: { title?: string }) {
    const conversation = await this.conversationService.create(body?.title);
    return { conversation };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const conversation = await this.conversationService.findById(id);
    if (!conversation) {
      return { statusCode: 404, message: 'Conversation not found' };
    }
    return { conversation };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const deleted = await this.conversationService.delete(id);
    return { success: deleted };
  }

  @Post(':id/messages')
  async addMessage(@Param('id') id: string, @Body() body: { role: string; content: string }) {
    const message: ChatMessage = {
      role: body.role as 'user' | 'assistant' | 'system',
      content: body.content,
      timestamp: new Date().toISOString(),
    };
    const conversation = await this.conversationService.appendMessage(id, message);
    if (!conversation) {
      return { statusCode: 404, message: 'Conversation not found' };
    }
    return { conversation };
  }
}
