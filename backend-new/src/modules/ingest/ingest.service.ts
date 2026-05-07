import { Injectable } from '@nestjs/common';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { AppConfigService } from '../../config/app-config.service';
import * as fs from 'fs';
import * as path from 'path';

interface TruongEntry {
  'ma-truong': string;
  'ten-truong': string;
  'ten-viet-tat'?: string;
  'dia-chi-tinh'?: string;
  'dia-chi-cu-the'?: string;
  'de-an-tuyen-sinh'?: string;
  'hoc-phi'?: string;
  'gioi-thieu'?: string;
}

interface CutoffEntry {
  'ma-truong': string;
  'ma-nganh': string;
  'ten-nganh': string;
  'to-hop'?: string;
  'diem-chuan': number;
  'ghi-chu'?: string;
}

interface ChunkDef {
  id: string;
  text: string;
  metadata: Record<string, any>;
  parentText?: string;
}

@Injectable()
export class IngestService {
  constructor(
    private readonly qdrant: QdrantService,
    private readonly embedding: EmbeddingService,
    private readonly config: AppConfigService,
  ) {}

  async ingest(rebuildIndex = false, filterCodes?: string[]) {
    if (rebuildIndex) {
      await this.qdrant.deleteAll();
    }

    const dataDir = path.join(process.cwd(), '..', 'data');
    const truongPath = path.join(dataDir, 'truong.json');
    const cutoffPath = path.join(dataDir, 'diem_chuan_THPT.json');

    const schools: TruongEntry[] = JSON.parse(fs.readFileSync(truongPath, 'utf-8'));
    const cutoffs: CutoffEntry[] = JSON.parse(fs.readFileSync(cutoffPath, 'utf-8'));

    const targetSchools = filterCodes && filterCodes.length > 0
      ? schools.filter((s) => filterCodes.includes(s['ma-truong'].toUpperCase()))
      : schools;

    const cutoffMap = new Map<string, CutoffEntry[]>();
    for (const c of cutoffs) {
      const code = c['ma-truong'].toUpperCase();
      if (!cutoffMap.has(code)) cutoffMap.set(code, []);
      cutoffMap.get(code)!.push(c);
    }

    const allChunks: ChunkDef[] = [];

    for (const school of targetSchools) {
      const code = school['ma-truong'].toUpperCase();
      const schoolCutoffs = cutoffMap.get(code) || [];
      const chunks = this.buildChunks(school, schoolCutoffs);
      allChunks.push(...chunks);
      console.log(`[ingest] ${code} (${school['ten-truong']}): ${chunks.length} chunks`);
    }

    for (let idx = 0; idx < allChunks.length; idx++) {
      allChunks[idx].metadata.chunk_id = allChunks[idx].id;
      allChunks[idx].id = String(idx + 1);
    }

    const batchSize = 50;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const vectors = await this.embedding.embed(batch.map((c) => c.text));
      const points = batch.map((c, idx) => ({
        id: parseInt(c.id, 10),
        vector: vectors[idx],
        payload: {
          text: c.text,
          ...c.metadata,
          ...(c.parentText ? { parent_text: c.parentText } : {}),
        },
      }));
      await this.qdrant.upsertPoints(points);
      console.log(`[ingest] Upserted ${Math.min(i + batchSize, allChunks.length)}/${allChunks.length}`);
    }

    return {
      totalPoints: allChunks.length,
      collection: this.qdrant.getCollectionName(),
      filesProcessed: targetSchools.length,
    };
  }

  private buildChunks(school: TruongEntry, cutoffs: CutoffEntry[]): ChunkDef[] {
    const chunks: ChunkDef[] = [];
    const code = school['ma-truong'].toUpperCase();
    const name = school['ten-truong'] || '';
    const shortName = school['ten-viet-tat'] || '';
    const location = school['dia-chi-tinh'] || '';
    const address = school['dia-chi-cu-the'] || '';

    const profileText = `Trường ${name}${shortName ? ` (${shortName})` : ''}. Mã trường: ${code}. Địa chỉ: ${address}. Khu vực: ${location}.`;
    chunks.push({
      id: `${code}:profile`,
      text: profileText,
      metadata: {
        university_code: code,
        university_name: name,
        chunk_type: 'profile',
        domain: 'profile',
        intent: 'university_profile',
        source: 'truong_json',
        confidence: 0.98,
      },
    });

    if (school['de-an-tuyen-sinh']) {
      const admissionText = school['de-an-tuyen-sinh'];
      const admissionChunks = this.chunkText(admissionText, 700, 100);
      for (let i = 0; i < admissionChunks.length; i++) {
        chunks.push({
          id: `${code}:admission:${i}`,
          text: admissionChunks[i],
          metadata: {
            university_code: code,
            university_name: name,
            chunk_type: 'admission_text',
            domain: 'admission',
            intent: 'admission_overview',
            section_index: i,
            source: 'de_an_tuyen_sinh',
            confidence: 0.9,
          },
          parentText: admissionText,
        });
      }

      const qaPairs = this.extractQaFromAdmission(name, code, admissionText);
      for (const qa of qaPairs) {
        chunks.push({
          id: qa.id,
          text: qa.text,
          metadata: {
            university_code: code,
            university_name: name,
            chunk_type: 'qa_pair',
            domain: 'admission',
            intent: qa.intent,
            source: 'de_an_tuyen_sinh_extracted',
            confidence: 0.88,
          },
        });
      }
    }

    if (school['hoc-phi']) {
      const tuitionChunks = this.chunkText(school['hoc-phi'], 500, 50);
      for (let i = 0; i < tuitionChunks.length; i++) {
        chunks.push({
          id: `${code}:tuition:${i}`,
          text: tuitionChunks[i],
          metadata: {
            university_code: code,
            university_name: name,
            chunk_type: 'raw_document',
            domain: 'tuition',
            intent: 'tuition_segment',
            section_index: i,
            source: 'hoc_phi',
            confidence: 0.85,
          },
        });
      }
    }

    if (school['gioi-thieu']) {
      const introChunks = this.chunkText(school['gioi-thieu'], 700, 100);
      for (let i = 0; i < introChunks.length; i++) {
        chunks.push({
          id: `${code}:intro:${i}`,
          text: introChunks[i],
          metadata: {
            university_code: code,
            university_name: name,
            chunk_type: 'raw_document',
            domain: 'introduction',
            intent: 'introduction_segment',
            section_index: i,
            source: 'gioi_thieu',
            confidence: 0.85,
          },
        });
      }
    }

    for (const cutoff of cutoffs) {
      const qaText = `Hỏi: Điểm chuẩn ngành ${cutoff['ten-nganh']} (mã ${cutoff['ma-nganh']}) của ${name} là bao nhiêu? Tổ hợp xét tuyển: ${cutoff['to-hop'] || 'N/A'}. Đáp: Điểm chuẩn là ${cutoff['diem-chuan']}.${cutoff['ghi-chu'] ? ' Ghi chú: ' + cutoff['ghi-chu'] + '.' : ''}`;
      chunks.push({
        id: `${code}:cutoff:${cutoff['ma-nganh']}`,
        text: qaText,
        metadata: {
          university_code: code,
          university_name: name,
          chunk_type: 'cutoff_qa',
          domain: 'cutoff',
          intent: 'cutoff_score',
          program_code: cutoff['ma-nganh'],
          program_name: cutoff['ten-nganh'],
          subject_groups: cutoff['to-hop'] || '',
          score: cutoff['diem-chuan'],
          source: 'diem_chuan_THPT',
          confidence: 0.95,
        },
      });
    }

    return chunks;
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > chunkSize && current.length > 0) {
        chunks.push(current.trim());
        const overlapText = current.slice(-overlap);
        current = overlapText + ' ' + sentence;
      } else {
        current += (current ? ' ' : '') + sentence;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  private extractQaFromAdmission(schoolName: string, code: string, text: string): Array<{ id: string; text: string; intent: string }> {
    const qaPairs: Array<{ id: string; text: string; intent: string }> = [];
    const lower = text.toLowerCase();

    if (lower.includes('chỉ tiêu') || lower.includes('tuyển sinh')) {
      const match = text.match(/(\d{1,2}[.,]?\d{3}|\d{3,4})\s*chỉ\s*tiêu/i);
      if (match) {
        qaPairs.push({
          id: `${code}:qa:quota`,
          text: `Hỏi: Trường ${schoolName} tuyển bao nhiêu chỉ tiêu năm 2025? Đáp: Trường ${schoolName} dự kiến tuyển ${match[1]} chỉ tiêu.`,
          intent: 'total_quota',
        });
      }
    }

    if (lower.includes('phương thức') || lower.includes('xét tuyển')) {
      const methods = [];
      if (lower.includes('xét tuyển thẳng')) methods.push('xét tuyển thẳng');
      if (lower.includes('đánh giá năng lực') || lower.includes('đgnl') || lower.includes('hsa')) methods.push('xét đánh giá năng lực');
      if (lower.includes('điểm thi tốt nghiệp') || lower.includes('thpt')) methods.push('xét điểm thi THPT');
      if (lower.includes('học bạ')) methods.push('xét học bạ');
      if (lower.includes('chứng chỉ quốc tế') || lower.includes('sat') || lower.includes('act')) methods.push('xét chứng chỉ quốc tế');
      if (lower.includes('tài năng') || lower.includes('năng lực vượt trội')) methods.push('xét tuyển tài năng');
      if (lower.includes('kết hợp')) methods.push('xét tuyển kết hợp');

      if (methods.length > 0) {
        qaPairs.push({
          id: `${code}:qa:methods`,
          text: `Hỏi: Trường ${schoolName} có những phương thức xét tuyển nào? Đáp: Trường ${schoolName} xét tuyển qua các phương thức: ${methods.join(', ')}.`,
          intent: 'admission_methods_list',
        });
      }
    }

    const subjectGroupMatches = text.match(/tổ hợp[^.:]*?([A-Z]\d{2}[^a-zA-Z0-9]?)+/gi);
    if (subjectGroupMatches && subjectGroupMatches.length > 0) {
      const uniqueGroups = [...new Set(subjectGroupMatches.join(' ').match(/[A-Z]\d{2}/g) || [])];
      if (uniqueGroups.length > 0) {
        qaPairs.push({
          id: `${code}:qa:subject_groups`,
          text: `Hỏi: Trường ${schoolName} xét tuyển theo những tổ hợp môn nào? Đáp: Các tổ hợp môn xét tuyển gồm: ${uniqueGroups.join(', ')}.`,
          intent: 'subject_groups',
        });
      }
    }

    return qaPairs;
  }
}
