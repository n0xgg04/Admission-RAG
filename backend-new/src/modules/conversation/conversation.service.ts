import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(title?: string) {
    return this.prisma.conversation.create({
      data: {
        title: title || 'Cuộc trò chuyện mới',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async findAll() {
    return this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async appendMessage(id: string, message: ChatMessage) {
    const conversation = await this.prisma.conversation.update({
      where: { id },
      data: {
        messages: {
          create: {
            role: message.role,
            content: message.content,
          },
        },
        ...(message.role === 'user' && message.content
          ? { title: message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '') }
          : {}),
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return conversation;
  }

  async delete(id: string) {
    try {
      await this.prisma.conversation.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
