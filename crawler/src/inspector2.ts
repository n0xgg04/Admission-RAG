import { chromium } from 'playwright';

const universities = [
  { url: 'https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-y-ha-noi-YHB.html', label: 'YHB - Y Ha Noi' },
  { url: 'https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-su-pham-ha-noi-SPH.html', label: 'SPH - Su Pham Ha Noi' },
  { url: 'https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-bach-khoa-hcm-QSB.html', label: 'QSB - Bach Khoa HCM' },
  { url: 'https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-cong-nghe-dai-hoc-quoc-gia-ha-noi-QHI.html', label: 'QHI - Cong Nghe QGHN' },
  { url: 'https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-ngoai-thuong-co-so-phia-bac-NTH.html', label: 'NTH - Ngoai Thuong' },
];

async function inspectPage(url: string, label: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('div.content-page__index-content', { timeout: 30000 });
    
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div.content-page__index-content')).map((el) => {
        const id = (el as HTMLElement).id || '(no id)';
        const titleEl = el.querySelector('h2.index-content__title');
        const title = titleEl ? (titleEl as HTMLElement).innerText.trim() : '(no title)';
        const hasTable = el.querySelector('table') !== null;
        const hasPdf = el.querySelector('a[href$=".pdf"]') !== null;
        return { id, title, hasTable, hasPdf };
      });
    });
    
    console.log(`\n=== ${label} ===`);
    sections.forEach((s, i) => {
      console.log(`[${i}] id="${s.id}" title="${s.title}" table=${s.hasTable} pdf=${s.hasPdf}`);
    });
    
  } catch (e) {
    console.error(`Error ${label}:`, e);
  } finally {
    await browser.close();
  }
}

(async () => {
  for (const u of universities) {
    await inspectPage(u.url, u.label);
  }
})();
