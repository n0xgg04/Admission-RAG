import { Module } from '@nestjs/common';
import { QueryTransformService } from './query-transform.service';
import { AppConfigService } from '../../config/app-config.service';

@Module({
  providers: [QueryTransformService, AppConfigService],
  exports: [QueryTransformService],
})
export class QueryTransformModule {}
