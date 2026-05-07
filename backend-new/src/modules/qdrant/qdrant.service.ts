import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import axios from 'axios';

@Injectable()
export class QdrantService implements OnModuleInit {
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit() {
    this.baseUrl = this.config.qdrantUrl;
    this.apiKey = this.config.qdrantApiKey;
    await this.ensureCollection();
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['api-key'] = this.apiKey;
    return h;
  }

  private async ensureCollection() {
    try {
      const exists = await this.collectionExists(this.config.qdrantCollection);
      if (!exists) {
        const url = `${this.baseUrl}/collections/${this.config.qdrantCollection}`;
        const body = { vectors: { size: this.config.embeddingDim, distance: 'Cosine' } };
        console.log(`[qdrant] Creating collection at ${url} with body ${JSON.stringify(body)}`);
        await axios.put(url, body, { headers: this.headers });
        console.log(`Created Qdrant collection: ${this.config.qdrantCollection}`);
      }
    } catch (err: any) {
      console.warn(`[qdrant] Collection check/create warning: ${err.response?.status || ''} ${err.message || ''} body=${JSON.stringify(err.response?.data)}`);
    }
  }

  private async collectionExists(name: string): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/collections/${name}`, { headers: this.headers });
      return res.data?.result?.status === 'green' || res.data?.result?.status === 'yellow' || !!res.data?.result;
    } catch {
      return false;
    }
  }

  getCollectionName(): string {
    return this.config.qdrantCollection;
  }

  async upsertPoints(points: Array<{ id: string | number; vector: number[]; payload: Record<string, any> }>) {
    await axios.put(
      `${this.baseUrl}/collections/${this.config.qdrantCollection}/points`,
      { points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })) },
      { headers: this.headers },
    );
  }

  async search(queryVector: number[], topK: number, filters?: Record<string, any>) {
    const must: any[] = [];
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          must.push({ key, match: { value } });
        }
      }
    }

    const body: any = {
      vector: queryVector,
      limit: topK,
      with_payload: true,
    };
    if (must.length > 0) {
      body.filter = { must };
    }

    try {
      const res = await axios.post(
        `${this.baseUrl}/collections/${this.config.qdrantCollection}/points/search`,
        body,
        { headers: this.headers },
      );
      return (res.data?.result || []).map((p: any) => ({
        id: p.id,
        score: p.score,
        text: p.payload?.text || '',
        metadata: { ...p.payload },
      }));
    } catch (err: any) {
      console.error('[qdrant] Search error:', err.response?.status, JSON.stringify(err.response?.data));
      console.error('[qdrant] Search body:', JSON.stringify(body).slice(0, 500));
      throw err;
    }
  }

  async deleteAll() {
    try {
      await axios.delete(`${this.baseUrl}/collections/${this.config.qdrantCollection}`, { headers: this.headers });
    } catch {
      void 0;
    }
    await this.ensureCollection();
  }
}
