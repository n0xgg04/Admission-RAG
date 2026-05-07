import { Injectable } from '@nestjs/common';

export interface QueryAnalysis {
  intent: 'fact_lookup' | 'open_ended' | 'comparison' | 'list';
  universityCode?: string;
  programName?: string;
  needsCutoffData: boolean;
  needsTuitionData: boolean;
  needsAdmissionMethodData: boolean;
}

@Injectable()
export class RagToolsService {
  private readonly universityPatterns: Array<{ code: string; names: string[] }> = [
    { code: 'BKA', names: ['bách khoa', 'bkh', 'hust', 'đại học bách khoa hà nội'] },
    { code: 'KHA', names: ['kinh tế quốc dân', 'neu', 'đại học kinh tế quốc dân'] },
    { code: 'HTC', names: ['học viện tài chính', 'aof', 'hvtc'] },
    { code: 'NHH', names: ['học viện ngân hàng', 'bav', 'hvnh'] },
    { code: 'NTH', names: ['ngoại thương', 'ftu', 'đại học ngoại thương'] },
  ];

  private readonly cutoffKeywords = ['điểm chuẩn', 'điểm trúng tuyển', 'điểm xét tuyển', 'điểm đầu vào', 'điểm ngành'];
  private readonly tuitionKeywords = ['học phí', 'chi phí', 'tiền học', 'đóng tiền'];
  private readonly admissionMethodKeywords = ['phương thức', 'xét tuyển', 'tuyển sinh', 'đề án', 'chỉ tiêu'];

  analyzeQuery(query: string): QueryAnalysis {
    const lower = query.toLowerCase();

    const universityCode = this.extractUniversityCode(lower);
    const programName = this.extractProgramName(lower);

    const needsCutoffData = this.cutoffKeywords.some((k) => lower.includes(k));
    const needsTuitionData = this.tuitionKeywords.some((k) => lower.includes(k));
    const needsAdmissionMethodData = this.admissionMethodKeywords.some((k) => lower.includes(k));

    let intent: QueryAnalysis['intent'] = 'open_ended';
    if (needsCutoffData || needsTuitionData) {
      intent = 'fact_lookup';
    } else if (lower.includes('so sánh') || lower.includes('khác gì') || lower.includes('hay hơn')) {
      intent = 'comparison';
    } else if (lower.includes('những ngành') || lower.includes('danh sách') || lower.includes('có mấy')) {
      intent = 'list';
    }

    return {
      intent,
      universityCode,
      programName,
      needsCutoffData,
      needsTuitionData,
      needsAdmissionMethodData,
    };
  }

  expandQuery(query: string, analysis: QueryAnalysis): string[] {
    const variants: string[] = [query];

    if (analysis.universityCode && !query.toLowerCase().includes(analysis.universityCode.toLowerCase())) {
      const uni = this.universityPatterns.find((u) => u.code === analysis.universityCode);
      if (uni) {
        variants.push(`${query} ${uni.names[0]}`);
      }
    }

    if (analysis.needsCutoffData && !query.toLowerCase().includes('điểm chuẩn')) {
      variants.push(query.replace(/điểm/gi, 'điểm chuẩn'));
    }

    return [...new Set(variants)];
  }

  private extractUniversityCode(query: string): string | undefined {
    for (const uni of this.universityPatterns) {
      for (const name of uni.names) {
        if (query.includes(name)) {
          return uni.code;
        }
      }
    }
    return undefined;
  }

  private extractProgramName(query: string): string | undefined {
    const programPatterns = [
      /ngành\s+([\p{L}\s]+?)(?:\s+củas|$)/u,
      /(?:học|xét)\s+([\p{L}\s]+?)(?:\s+củas|$)/u,
    ];
    for (const pattern of programPatterns) {
      const match = query.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return undefined;
  }
}
