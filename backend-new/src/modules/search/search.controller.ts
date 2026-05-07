import { Controller, Post, Body } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchRequestDto } from '../../common/dtos/request.dto';

@Controller('api/v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  async search(@Body() dto: SearchRequestDto) {
    const hits = await this.searchService.search(dto.query, dto.university_code);
    return {
      hits: hits.map((h) => ({
        chunk_id: h.id,
        score: h.score,
        text: h.text,
        metadata: h.metadata,
      })),
    };
  }
}
