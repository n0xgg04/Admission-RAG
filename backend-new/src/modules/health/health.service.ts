import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return { status: 'ok', app: 'admission-rag-chatbot', env: 'development' };
  }
}
