import { Injectable } from '@nestjs/common';

@Injectable()
export class QueryPreprocessService {
  private readonly abbreviationMap: Map<string, string> = new Map([
    ['đh', 'đại học'],
    ['bk', 'bách khoa'],
    ['bkh', 'bách khoa hà nội'],
    ['hust', 'bách khoa hà nội'],
    ['neu', 'kinh tế quốc dân'],
    ['kha', 'kinh tế quốc dân'],
    ['ftu', 'ngoại thương'],
    ['aof', 'học viện tài chính'],
    ['bav', 'học viện ngân hàng'],
    ['hvtc', 'học viện tài chính'],
    ['hvnh', 'học viện ngân hàng'],
    ['ts', 'tuyển sinh'],
    ['đc', 'điểm chuẩn'],
    ['hp', 'học phí'],
    ['ct', 'chương trình'],
    ['ngành cntt', 'ngành công nghệ thông tin'],
    ['ngành kt', 'ngành kỹ thuật'],
    ['khối a', 'tổ hợp a00'],
    ['khối a1', 'tổ hợp a01'],
    ['khối d', 'tổ hợp d01'],
  ]);

  preprocess(query: string): string {
    let result = query.toLowerCase().trim();
    result = this.normalizeWhitespace(result);
    result = this.expandAbbreviations(result);
    result = this.removeSpecialChars(result);
    return result;
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private expandAbbreviations(text: string): string {
    let result = text;
    for (const [abbr, expansion] of this.abbreviationMap.entries()) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      result = result.replace(regex, expansion);
    }
    return result;
  }

  private removeSpecialChars(text: string): string {
    return text.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
}
