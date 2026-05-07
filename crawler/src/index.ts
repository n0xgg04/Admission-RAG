import { runCrawler } from './crawler';
import path from 'path';

async function main(): Promise<void> {
  const csvPath = path.resolve(__dirname, '..', 'DeAnTongHop.csv');
  const outputDir = path.resolve(__dirname, '..', 'output');

  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  await runCrawler({
    csvPath,
    outputDir,
    limit,
    concurrency: 3,
    delayMs: 2000,
  });
}

main().catch((err) => {
  throw err;
});
