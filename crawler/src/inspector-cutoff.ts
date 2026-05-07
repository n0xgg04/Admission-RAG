import { chromium } from 'playwright';

async function inspectCutoffPage(url: string, label: string) {
  console.log(`\n=== ${label} ===`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    
    const tables = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table')).map((t, i) => {
        const headers = Array.from(t.querySelectorAll('thead th, tr:first-child td, tr:first-child th')).map(h => (h as HTMLElement).innerText.trim());
        const rows = Array.from(t.querySelectorAll('tbody tr, tr:not(:first-child)')).slice(0, 3).map(r => 
          Array.from(r.querySelectorAll('td, th')).map(c => (c as HTMLElement).innerText.trim())
        );
        const section = t.closest('div[class*="content"]')?.className || t.closest('section')?.className || '';
        return { index: i, headers, rowCount: t.querySelectorAll('tr').length, sampleRows: rows, sectionContext: section.substring(0, 100) };
      });
    });
    
    tables.forEach(t => {
      console.log(`\nTable [${t.index}] - ${t.rowCount} rows`);
      console.log('Headers:', t.headers);
      console.log('Sample rows:', JSON.stringify(t.sampleRows, null, 2));
    });
    
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.content-page__index-content')).map(el => {
        const id = (el as HTMLElement).id || '(no id)';
        const title = el.querySelector('h2') ? (el.querySelector('h2') as HTMLElement).innerText.trim() : '';
        return { id, title };
      });
    });
    console.log('\nSections:', sections);
    
    const yearTabs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="tab"], [class*="year"], button, a')).filter(el => 
        /202[0-9]/.test((el as HTMLElement).innerText)
      ).map(el => ({
        text: (el as HTMLElement).innerText.trim(),
        tag: el.tagName,
        className: el.className
      }));
    });
    console.log('\nYear tabs:', yearTabs.slice(0, 10));
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

(async () => {
  await inspectCutoffPage('https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-bach-khoa-ha-noi-BKA.html', 'BKA Cutoff');
})();
