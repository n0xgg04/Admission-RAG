import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface CutoffEntry {
  program_code: string;
  program_name: string;
  subject_groups: string[];
  score: number;
  note: string | null;
}

interface CutoffMethod {
  method_id: string;
  method_name: string;
  year: number;
  entries: CutoffEntry[];
}

interface CutoffScores {
  year: number;
  source_url: string;
  methods: CutoffMethod[];
}

function parseSubjectGroups(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

async function parseCutoffPage(page: Page, url: string): Promise<CutoffScores> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  const rawData = await page.evaluate(() => {
    const result: Array<{
      methodName: string;
      table: Array<Array<string>>;
    }> = [];

    function parseTable(table: HTMLTableElement): Array<Array<string>> {
      const rows = table.querySelectorAll('tr');
      let maxCols = 0;
      rows.forEach((row) => {
        let colCount = 0;
        row.querySelectorAll('td, th').forEach((cell) => {
          const colspan = (cell as HTMLTableCellElement).colSpan || 1;
          colCount += colspan;
        });
        if (colCount > maxCols) maxCols = colCount;
      });

      const grid: Array<Array<string>> = [];
      for (let i = 0; i < rows.length; i++) {
        grid[i] = new Array(maxCols).fill('');
      }

      for (let i = 0; i < rows.length; i++) {
        let col = 0;
        rows[i].querySelectorAll('td, th').forEach((cell) => {
          while (col < maxCols && grid[i][col] !== '') {
            col++;
          }
          if (col >= maxCols) return;

          const text = (cell as HTMLElement).innerText.trim().replace(/\s+/g, ' ');
          const rowspan = (cell as HTMLTableCellElement).rowSpan || 1;
          const colspan = (cell as HTMLTableCellElement).colSpan || 1;

          for (let r = 0; r < rowspan; r++) {
            for (let c = 0; c < colspan; c++) {
              if (i + r < rows.length && col + c < maxCols) {
                grid[i + r][col + c] = text;
              }
            }
          }
          col += colspan;
        });
      }

      return grid;
    }

    const cutoffTables = document.querySelectorAll('div.cutoff-table');
    cutoffTables.forEach((section) => {
      const titleEl = section.querySelector('h3.table__title');
      const methodName = titleEl ? (titleEl as HTMLElement).innerText.trim() : 'Unknown';
      const table = section.querySelector('table');
      if (table) {
        result.push({
          methodName,
          table: parseTable(table as HTMLTableElement),
        });
      }
    });

    return result;
  });

  const methods: CutoffMethod[] = [];

  for (const method of rawData) {
    const methodName = method.methodName;
    const yearMatch = methodName.match(/năm\s+(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 2025;
    const methodId = slugify(methodName.replace(/năm\s+\d{4}/, '').trim());

    const entries: CutoffEntry[] = [];
    const table = method.table;
    if (table.length === 0) continue;

    const headerRow = table[0];
    const colMap: Record<string, number> = {};
    headerRow.forEach((cell, idx) => {
      const lower = cell.toLowerCase();
      if (/stt/.test(lower)) colMap['stt'] = idx;
      if (/mã ngành/.test(lower)) colMap['code'] = idx;
      if (/tên ngành/.test(lower)) colMap['name'] = idx;
      if (/tổ hợp/.test(lower)) colMap['groups'] = idx;
      if (/điểm chuẩn/.test(lower)) colMap['score'] = idx;
      if (/ghi chú/.test(lower)) colMap['note'] = idx;
    });

    if (colMap['score'] === undefined || colMap['name'] === undefined) {
      console.warn(`  Could not detect columns for "${methodName}". Headers: ${headerRow.join(' | ')}`);
      continue;
    }

    const dataRows = table.slice(1);
    for (const row of dataRows) {
      if (row.length < 3) continue;

      const code = colMap['code'] !== undefined ? row[colMap['code']] : '';
      const name = row[colMap['name']];
      const groupsText = colMap['groups'] !== undefined ? row[colMap['groups']] : '';
      const scoreText = row[colMap['score']].replace(',', '.');
      const note = colMap['note'] !== undefined ? row[colMap['note']] : null;

      const score = parseFloat(scoreText);
      if (isNaN(score) || !name) continue;

      entries.push({
        program_code: code || name,
        program_name: name,
        subject_groups: groupsText ? parseSubjectGroups(groupsText) : [],
        score,
        note: note || null,
      });
    }

    if (entries.length > 0) {
      methods.push({
        method_id: methodId,
        method_name: methodName,
        year,
        entries,
      });
    }
  }

  return {
    year: 2025,
    source_url: url,
    methods,
  };
}

async function main() {
  const csvPath = path.join(__dirname, '..', 'DiemChuan.csv');
  const outputDir = path.join(__dirname, '..', 'output');

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Array<{ 'Tên trường': string; 'Link điểm chuẩn': string; 'Địa chỉ': string }>;

  console.log(`Found ${records.length} universities in DiemChuan.csv`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const concurrency = 3;
  const delayMs = 2000;
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  async function processBatch(batch: typeof records) {
    const pages: Page[] = [];
    for (let i = 0; i < batch.length; i++) {
      pages.push(await context.newPage());
    }

    const promises = batch.map(async (record, idx) => {
      const fullName = record['Tên trường'];
      const url = record['Link điểm chuẩn'];
      const codeMatch = fullName.match(/^([A-Z0-9]+)\s*-/);
      const code = codeMatch ? codeMatch[1] : null;

      if (!code) {
        console.warn(`⚠️ Could not extract code from: ${fullName}`);
        skipped++;
        return;
      }

      const outputPath = path.join(outputDir, `${code}.json`);
      if (!fs.existsSync(outputPath)) {
        console.warn(`⚠️ No existing JSON for ${code}, skipping`);
        skipped++;
        return;
      }

      const existingData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      if (existingData.cutoff_scores) {
        skipped++;
        return;
      }

      const page = pages[idx];

      try {
        const cutoffScores = await parseCutoffPage(page, url);

        existingData.cutoff_scores = cutoffScores;
        fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2));

        completed++;
        console.log(`✅ [${completed}/${records.length}] ${code}: ${cutoffScores.methods.length} methods, ${cutoffScores.methods.reduce((a, m) => a + m.entries.length, 0)} entries`);
      } catch (e) {
        failed++;
        console.error(`❌ [${code}] Error:`, (e as Error).message);
      }

      await new Promise((r) => setTimeout(r, delayMs));
    });

    await Promise.all(promises);

    for (const page of pages) {
      await page.close();
    }
  }

  for (let i = 0; i < records.length; i += concurrency) {
    const batch = records.slice(i, i + concurrency);
    await processBatch(batch);
  }

  await browser.close();

  console.log(`\n=== Done ===`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
