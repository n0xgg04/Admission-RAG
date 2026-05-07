import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { parse } from 'csv-parse/sync';
import { parseUniversityPage } from './parser';
import { UniversityAdmissionData } from './types';

interface CsvRow {
  'Tên trường': string;
  'Link đề án': string;
  'Địa chỉ': string;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as CsvRow[];
  return records;
}

function extractCode(fullName: string): string {
  const parts = fullName.split(' - ');
  return parts[0].trim();
}

function extractName(fullName: string): string {
  const parts = fullName.split(' - ');
  return parts.slice(1).join(' - ').trim() || fullName;
}

export async function runCrawler(options: {
  csvPath: string;
  outputDir: string;
  limit?: number;
  concurrency?: number;
  delayMs?: number;
}): Promise<void> {
  const records = parseCsv(options.csvPath);
  const targets = options.limit ? records.slice(0, options.limit) : records;

  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const concurrency = options.concurrency ?? 3;
  const delayMs = options.delayMs ?? 2000;

  const queue = [...targets];
  const total = queue.length;
  let completed = 0;

  async function worker(): Promise<void> {
    let page = await context.newPage();
    try {
      while (queue.length > 0) {
        const row = queue.shift();
        if (!row) break;

        const fullName = row['Tên trường'];
        const url = row['Link đề án'];
        const location = row['Địa chỉ'] || '';
        const code = extractCode(fullName);
        const name = extractName(fullName);

        const outputPath = path.join(options.outputDir, `${code}.json`);
        if (fs.existsSync(outputPath)) {
          completed++;
          continue;
        }

        try {
          const data = await parseUniversityPage(page, url, code, name, location);
          fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
          completed++;
          process.stdout.write(`\r[${completed}/${total}] ${code} - ${name}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          completed++;
          process.stdout.write(`\r[${completed}/${total}] ${code} - ERROR: ${message}`);
          try {
            await page.close();
          } catch {}
          page = await context.newPage();
        }

        if (queue.length > 0 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    } finally {
      try {
        await page.close();
      } catch {}
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  await context.close();
  await browser.close();

  process.stdout.write('\n');
}
