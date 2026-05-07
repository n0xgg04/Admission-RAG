import { chromium } from 'playwright';

async function inspectPage(url: string, label: string) {
  console.log(`\n=== ${label} ===`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('div.content-page__index-content', { timeout: 30000 });
    
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.content-page__index-content')).map((el, i) => {
        const id = (el as HTMLElement).id || '(no id)';
        const titleEl = el.querySelector('h2.index-content__title');
        const title = titleEl ? (titleEl as HTMLElement).innerText.trim() : '(no title)';
        const hasTable = el.querySelector('table') !== null;
        const textLength = (el as HTMLElement).innerText.length;
        const hasPdf = el.querySelector('a[href$=".pdf"]') !== null;
        return { index: i, id, title, hasTable, hasPdf, textLength };
      });
    });
    
    sections.forEach(s => {
      console.log(`[${s.index}] id="${s.id}" title="${s.title}" table=${s.hasTable} pdf=${s.hasPdf} chars=${s.textLength}`);
    });
    
    const allPdfs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href$=".pdf"]')).map(a => (a as HTMLAnchorElement).href);
    });
    console.log('All PDFs on page:', allPdfs);
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

(async () => {
  await inspectPage('https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-bach-khoa-ha-noi-BKA.html', 'BKA - Bach Khoa Ha Noi');
  await inspectPage('https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-kinh-te-quoc-dan-KHA.html', 'KHA - Kinh Te Quoc Dan');
  await inspectPage('https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/hoc-vien-tai-chinh-HTC.html', 'HTC - Hoc Vien Tai Chinh');
})();
