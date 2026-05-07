import { Controller, Post, Body } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { IngestRequestDto } from '../../common/dtos/request.dto';

@Controller('api/v1/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post()
  async ingest(@Body() dto: IngestRequestDto) {
    const filterCodes = dto.university_codes
      ? dto.university_codes.map((c) => c.toUpperCase())
      : undefined;
    const result = await this.ingestService.ingest(dto.rebuild_index ?? false, filterCodes);
    return {
      status: 'success',
      universities_processed: result.filesProcessed,
      chunks_created: result.totalPoints,
      collection_size: result.totalPoints,
      message: `Indexed ${result.totalPoints} chunks from ${result.filesProcessed} universities into ${result.collection}`,
    };
  }
}
