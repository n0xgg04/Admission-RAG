import { Module } from '@nestjs/common';
import { RerankerService } from './reranker.service';
import { AppConfigService } from '../../config/app-config.service';

@Module({
  providers: [RerankerService, AppConfigService],
  exports: [RerankerService],
})
export class RerankerModule {}
