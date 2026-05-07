import { Controller, Post, Body, Sse } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChatService } from './chat.service';
import { ChatRequestDto } from '../../common/dtos/request.dto';

@Controller('api/v1/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() dto: ChatRequestDto) {
    return this.chatService.answer(dto.query, dto.session_id, dto.university_code);
  }

  @Post('stream')
  @Sse()
  chatStream(@Body() dto: ChatRequestDto): Observable<MessageEvent> {
    const generator = this.chatService.answerStream(
      dto.query,
      dto.session_id,
      dto.university_code,
    );

    return from(generator).pipe(
      map((item) => {
        if (item.type === 'chunk') {
          return { data: { chunk: item.text } } as MessageEvent;
        }
        return {
          data: {
            done: true,
            session_id: item.session_id,
            used_chunks: item.used_chunks,
            data_sufficient: item.data_sufficient,
            note: item.note,
          },
        } as MessageEvent;
      }),
    );
  }
}
