import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { AppConfigService } from '../../config/app-config.service';

@Module({
  providers: [LlmService, AppConfigService],
  exports: [LlmService],
})
export class LlmModule {}
