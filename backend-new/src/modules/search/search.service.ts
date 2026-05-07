import { Injectable } from '@nestjs/common';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { QueryTransformService } from '../query-transform/query-transform.service';
import { QueryPreprocessService } from '../query-preprocess/query-preprocess.service';
import { RagToolsService } from '../rag-tools/rag-tools.service';
import { RerankerService } from '../reranker/reranker.service';
import { AppConfigService } from '../../config/app-config.service';

export interface SearchHit {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, any>;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly qdrant: QdrantService,
    private readonly embedding: EmbeddingService,
    private readonly queryTransform: QueryTransformService,
    private readonly queryPreprocess: QueryPreprocessService,
    private readonly ragTools: RagToolsService,
    private readonly reranker: RerankerService,
    private readonly config: AppConfigService,
  ) {}

  async search(query: string, universityCode?: string, sessionQueries?: string[]): Promise<SearchHit[]> {
    const preprocessed = this.queryPreprocess.preprocess(query);
    const analysis = this.ragTools.analyzeQuery(preprocessed);
    console.log(`[search] original="${query}" preprocessed="${preprocessed}" intent=${analysis.intent} uni=${analysis.universityCode || 'none'}`);

    const autoUniversityCode = universityCode || analysis.universityCode;
    const expandedQueries = this.ragTools.expandQuery(preprocessed, analysis);

    const transformed = await this.queryTransform.transform(preprocessed, sessionQueries || []);
    console.log(`[search] strategy=${transformed.strategy}, variants=${transformed.variants.length}`);

    let allHits: SearchHit[] = [];

    const searchVariants = [...new Set([...transformed.variants, ...expandedQueries])].slice(0, 4);

    for (const variant of searchVariants) {
      const vector = await this.embedding.embedSingle(variant);
      const filters: Record<string, any> = {};
      if (autoUniversityCode) {
        filters.university_code = autoUniversityCode.toUpperCase();
      }

      const hits = await this.qdrant.search(vector, this.config.candidateK, filters);
      const variantWeight = transformed.strategy === 'raw' ? 1.0 : 0.92;

      for (const h of hits) {
        const existing = allHits.find((e) => e.id === h.id);
        if (existing) {
          existing.score = Math.max(existing.score, h.score * variantWeight);
        } else {
          allHits.push({
            id: h.id,
            score: h.score * variantWeight,
            text: h.text,
            metadata: h.metadata,
          });
        }
      }
    }

    allHits.sort((a, b) => b.score - a.score);

    const reranked = await this.reranker.rerank(query, allHits, this.config.topK);

    return reranked.map((h) => ({
      ...h,
      text: this.resolveContext(h),
    }));
  }

  private resolveContext(hit: SearchHit): string {
    const parentText = hit.metadata?.parent_text;
    if (parentText && typeof parentText === 'string' && parentText.length > hit.text.length) {
      return parentText.slice(0, 1200);
    }
    return hit.text;
  }
}
