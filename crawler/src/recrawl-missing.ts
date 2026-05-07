import { chromium, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { parseUniversityPage } from './parser';

const outputDir = path.join(__dirname, '..', 'output');

async function main() {
  const csvPath = path.join(__dirname, '..', 'DeAnTongHop.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Array<{ 'Tên trường': string; 'Link đề án': string; 'Địa chỉ': string }>;

  const existing = new Set(
    fs.readdirSync(outputDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
  );

  const missing = records.filter((r) => {
    const codeMatch = r['Tên trường'].match(/^([A-Z0-9]+)\s*-/);
    const code = codeMatch ? codeMatch[1] : null;
    return code && !existing.has(code);
  });

  console.log(`Found ${missing.length} missing universities to re-crawl`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const concurrency = 3;
  const delayMs = 2000;
  let completed = 0;
  let failed = 0;

  async function processBatch(batch: typeof missing) {
    const promises = batch.map(async (record, idx) => {
      const fullName = record['Tên trường'];
      const url = record['Link đề án'];
      const location = record['Địa chỉ'];
      const codeMatch = fullName.match(/^([A-Z0-9]+)\s*-/);
      const code = codeMatch ? codeMatch[1] : null;
      const name = fullName.replace(/^([A-Z0-9]+)\s*-\s*/, '');

      if (!code) {
        console.warn(`⚠️ Could not extract code from: ${fullName}`);
        failed++;
        return;
      }

      const page = await context.newPage();

      try {
        const data = await parseUniversityPage(page, url, code, name, location);
        const outputPath = path.join(outputDir, `${code}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        completed++;
        console.log(`✅ [${completed}/${missing.length}] ${code}: ${data.admission_methods.length} methods`);
      } catch (e) {
        failed++;
        console.error(`❌ [${code}] Error:`, (e as Error).message);
      } finally {
        await page.close();
      }

      await new Promise((r) => setTimeout(r, delayMs));
    });

    await Promise.all(promises);
  }

  for (let i = 0; i < missing.length; i += concurrency) {
    const batch = missing.slice(i, i + concurrency);
    await processBatch(batch);
  }

  await browser.close();

  console.log(`\n=== Re-crawl Done ===`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
