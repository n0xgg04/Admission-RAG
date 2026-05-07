import { Page } from 'playwright';
import {
  UniversityAdmissionData,
  UniversityInfo,
  AdmissionMethod,
  ProgramInfo,
} from './types';

function parseSubjectGroups(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function detectProgramType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('tiên tiến') || lower.includes('elitech')) return 'tiên_tiến';
  if (lower.includes('chất lượng cao') || lower.includes('clc')) return 'chất_lượng_cao';
  if (lower.includes('liên kết') || lower.includes('hợp tác') || lower.includes('quốc tế')) return 'liên_kết_quốc_tế';
  if (lower.includes('pfiev')) return 'việt_pháp';
  if (lower.includes('troy')) return 'liên_kết_troy';
  return 'chuẩn';
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

export async function parseUniversityPage(
  page: Page,
  url: string,
  code: string,
  name: string,
  location: string
): Promise<UniversityAdmissionData> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('div.content-page__index-content', { timeout: 30000 });

  const rawData = await page.evaluate(() => {
    const result: {
      overview: string | null;
      methods: Array<{
        title: string;
        content: string;
        table: Array<Array<string>>;
      }>;
      programTable: Array<Array<string>>;
      cutoffText: string | null;
      tuitionText: string | null;
      timelineText: string | null;
      pdfLinks: string[];
      schoolInfo: Record<string, string>;
      quotaText: string | null;
      yearText: string | null;
    } = {
      overview: null,
      methods: [],
      programTable: [],
      cutoffText: null,
      tuitionText: null,
      timelineText: null,
      pdfLinks: [],
      schoolInfo: {},
      quotaText: null,
      yearText: null,
    };

    const getSection = (id: string): HTMLElement | null =>
      document.querySelector(`div.content-page__index-content#${id}`);

    const getText = (el: HTMLElement | null): string | null => {
      if (!el) return null;
      const sub = el.querySelector('.index-content__sub-content');
      return sub
        ? (sub as HTMLElement).innerText.trim().replace(/\s+/g, ' ')
        : el.innerText.trim().replace(/\s+/g, ' ');
    };

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

    const allSections = document.querySelectorAll('div.content-page__index-content');

    const firstSection = allSections[0];
    if (firstSection) {
      const prev = firstSection.previousElementSibling as HTMLElement | null;
      if (prev) {
        result.overview = prev.innerText.trim().replace(/\s+/g, ' ');
      }
    }

    if (!result.overview) {
      const heading = document.querySelector('h1');
      if (heading) {
        let el = heading.nextElementSibling as HTMLElement | null;
        while (el && !el.classList.contains('content-page__index-content')) {
          if (el.innerText && el.innerText.trim().length > 50) {
            result.overview = el.innerText.trim().replace(/\s+/g, ' ');
            break;
          }
          el = el.nextElementSibling as HTMLElement | null;
        }
      }
    }

    if (firstSection) {
      const subContents = firstSection.querySelectorAll('.index-content__sub-content');
      subContents.forEach((sub) => {
        const el = sub as HTMLElement;

        for (const child of el.children) {
          const methodDiv = child as HTMLElement;
          const titleEl = methodDiv.querySelector(':scope > div:first-child');
          const contentEl = methodDiv.querySelector(':scope > div:last-child');

          const title = titleEl ? (titleEl as HTMLElement).innerText.trim().replace(/\s+/g, ' ') : '';
          const content = contentEl ? (contentEl as HTMLElement).innerText.trim().replace(/\s+/g, ' ') : '';
          const table = contentEl ? contentEl.querySelector('table') : null;

          result.methods.push({
            title,
            content,
            table: table ? parseTable(table as HTMLTableElement) : [],
          });
        }
      });
    }

    const nganhDaoTao = getSection('nganh-dao-tao');
    if (nganhDaoTao) {
      const table = nganhDaoTao.querySelector('table');
      if (table) {
        result.programTable = parseTable(table as HTMLTableElement);
      }
    }

    const diemChuan = getSection('diem-chuan');
    if (diemChuan) result.cutoffText = getText(diemChuan);

    const hocPhi = getSection('hoc-phi');
    if (hocPhi) result.tuitionText = getText(hocPhi);

    const thoiGian = getSection('thoi-gian-ho-so-xet-tuyen');
    if (thoiGian) result.timelineText = getText(thoiGian);

    const pdfSection = getSection('file-pdf-de-an');
    if (pdfSection) {
      pdfSection.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href');
        if (href && href.endsWith('.pdf')) result.pdfLinks.push(href);
      });
    }

    const gioiThieu = getSection('gioi-thieu');
    if (gioiThieu) {
      const infoList = gioiThieu.querySelector('.basic-info__info ul');
      if (infoList) {
        infoList.querySelectorAll('li').forEach((li) => {
          const text = li.textContent?.trim() || '';
          const match = text.match(/^(.+?):\s*(.+)$/);
          if (match) {
            result.schoolInfo[match[1].trim().toLowerCase()] = match[2].trim();
          }
        });
      }
      if (Object.keys(result.schoolInfo).length === 0) {
        gioiThieu.querySelectorAll('ul li').forEach((li) => {
          const text = li.textContent?.trim() || '';
          const match = text.match(/^(.+?):\s*(.+)$/);
          if (match) {
            result.schoolInfo[match[1].trim().toLowerCase()] = match[2].trim();
          }
        });
      }
    }

    if (result.overview) {
      const yearMatch = result.overview.match(/năm\s+(\d{4})/i);
      if (yearMatch) result.yearText = yearMatch[1];
      const quotaMatch = result.overview.match(/(\d{1,3}(?:\.\d{3})*)\s*chỉ\s*tiêu/i);
      if (quotaMatch) result.quotaText = quotaMatch[1].replace(/\./g, '');
    }

    return result;
  });

  const schoolInfo = rawData.schoolInfo;
  const universityInfo: UniversityInfo = {
    code,
    name: schoolInfo['tên trường'] || name,
    short_name: schoolInfo['tên viết tắt'] || schoolInfo['mã trường'] || null,
    location: location ? [location] : [],
    address: schoolInfo['địa chỉ'] || null,
    website: schoolInfo['website'] || null,
    type: null,
    description: null,
  };

  const admissionMethods: AdmissionMethod[] = [];

  for (const method of rawData.methods) {
    const methodId = slugify(method.title || 'phuong-thuc');
    const methodName = method.title || 'Phương thức xét tuyển';

    let eligibility: string | null = null;
    let rules: string | null = null;

    const doiTuongMatch = method.content.match(/đối tượng[\s\S]*?(?=quy chế|điều kiện|danh sách|$)/i);
    if (doiTuongMatch) eligibility = doiTuongMatch[0].trim();

    const quyCheMatch = method.content.match(/quy chế[\s\S]*?(?=đối tượng|danh sách|$)/i);
    if (quyCheMatch) rules = quyCheMatch[0].trim();

    const programs: ProgramInfo[] = [];
    const table = method.table;
    if (table.length > 0) {
      const headerRow = table[0];
      const hasHeader = headerRow.some((cell: string) =>
        /stt|mã ngành|tên ngành|tổ hợp|ghi chú/i.test(cell)
      );
      const dataRows = hasHeader ? table.slice(1) : table;

      for (const row of dataRows) {
        if (row.length < 3) continue;
        const codeIdx = row.findIndex((cell: string) => /^\d{6,8}$|^[A-Z]{2,}\d*$/.test(cell));
        const nameIdx = row.findIndex(
          (cell: string, i: number) => i !== codeIdx && cell.length > 5 && !cell.includes(';') && !/^\d+$/.test(cell)
        );
        const groupIdx = row.findIndex((cell: string) => cell.includes(';') || /^[A-Z]\d{2}(;|$)/.test(cell));
        const noteIdx = row.findIndex(
          (cell: string, i: number) => i !== codeIdx && i !== nameIdx && i !== groupIdx && cell.length > 0
        );

        if (codeIdx === -1 || nameIdx === -1) continue;

        programs.push({
          program_code: row[codeIdx],
          program_name: row[nameIdx],
          subject_groups: groupIdx !== -1 ? parseSubjectGroups(row[groupIdx]) : [],
          program_type: detectProgramType(row[nameIdx]),
          note: noteIdx !== -1 && row[noteIdx] !== row[nameIdx] ? row[noteIdx] : null,
        });
      }
    }

    admissionMethods.push({
      method_id: methodId,
      method_name: methodName,
      description: method.content.substring(0, 500),
      eligibility,
      rules,
      programs,
    });
  }

  if (rawData.programTable.length > 0) {
    const hasHeader = rawData.programTable[0].some((cell: string) =>
      /stt|mã ngành|tên ngành|tổ hợp|chỉ tiêu|phương thức/i.test(cell)
    );
    const dataRows = hasHeader ? rawData.programTable.slice(1) : rawData.programTable;

    const programs: ProgramInfo[] = [];
    for (const row of dataRows) {
      if (row.length < 3) continue;
      const codeIdx = row.findIndex((cell: string) => /^\d{6,8}$|^[A-Z]{2,}\d*$/.test(cell));
      const nameIdx = row.findIndex(
        (cell: string, i: number) => i !== codeIdx && cell.length > 5 && !cell.includes(';') && !/^\d+$/.test(cell)
      );
      const groupIdx = row.findIndex((cell: string) => cell.includes(';') || /^[A-Z]\d{2}(;|$)/.test(cell));
      const noteIdx = row.findIndex(
        (cell: string, i: number) => i !== codeIdx && i !== nameIdx && i !== groupIdx && cell.length > 0
      );

      if (codeIdx === -1 || nameIdx === -1) continue;

      programs.push({
        program_code: row[codeIdx],
        program_name: row[nameIdx],
        subject_groups: groupIdx !== -1 ? parseSubjectGroups(row[groupIdx]) : [],
        program_type: detectProgramType(row[nameIdx]),
        note: noteIdx !== -1 && row[noteIdx] !== row[nameIdx] ? row[noteIdx] : null,
      });
    }

    if (programs.length > 0) {
      admissionMethods.push({
        method_id: 'danh-sach-nganh-dao-tao',
        method_name: 'Danh sách ngành đào tạo',
        description: null,
        eligibility: null,
        rules: null,
        programs,
      });
    }
  }

  const admissionYear = rawData.yearText ? parseInt(rawData.yearText, 10) : null;
  const totalQuota = rawData.quotaText ? parseInt(rawData.quotaText, 10) : null;

  return {
    university: universityInfo,
    admission_year: admissionYear,
    total_quota: totalQuota,
    source_url: url,
    pdf_url: rawData.pdfLinks[0] || null,
    admission_overview: rawData.overview,
    admission_methods: admissionMethods,
    cutoff_scores_text: rawData.cutoffText,
    tuition_text: rawData.tuitionText,
    timeline_text: rawData.timelineText,
  };
}
