import { Module } from '@nestjs/common';
import { RagToolsService } from './rag-tools.service';

@Module({
  providers: [RagToolsService],
  exports: [RagToolsService],
})
export class RagToolsModule {}
