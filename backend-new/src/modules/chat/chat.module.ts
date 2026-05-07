import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { SearchModule } from '../search/search.module';
import { LlmModule } from '../llm/llm.module';
import { ConversationModule } from '../conversation/conversation.module';
import { AppConfigService } from '../../config/app-config.service';

@Module({
  imports: [SearchModule, LlmModule, ConversationModule],
  controllers: [ChatController],
  providers: [ChatService, AppConfigService],
  exports: [ChatService],
})
export class ChatModule {}
