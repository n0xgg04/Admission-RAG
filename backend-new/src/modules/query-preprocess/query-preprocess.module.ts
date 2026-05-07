import { Module } from '@nestjs/common';
import { QueryPreprocessService } from './query-preprocess.service';

@Module({
  providers: [QueryPreprocessService],
  exports: [QueryPreprocessService],
})
export class QueryPreprocessModule {}
