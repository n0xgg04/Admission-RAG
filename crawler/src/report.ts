import * as fs from 'fs';
import * as path from 'path';

const outputDir = path.join(__dirname, '..', 'output');

interface ReportEntry {
  code: string;
  name: string;
  hasCutoff: boolean;
  cutoffMethods: number;
  hasAdmissionMethods: boolean;
  admissionMethodsCount: number;
  issues: string[];
}

const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.json'));
const reports: ReportEntry[] = [];

for (const file of files) {
  const code = file.replace('.json', '');
  const data = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf-8'));

  const hasCutoff = !!data.cutoff_scores;
  const cutoffMethods = hasCutoff ? data.cutoff_scores.methods.length : 0;
  const hasAdmissionMethods = Array.isArray(data.admission_methods) && data.admission_methods.length > 0;
  const admissionMethodsCount = hasAdmissionMethods ? data.admission_methods.length : 0;

  const issues: string[] = [];

  if (!hasCutoff) {
    issues.push('Thiếu điểm chuẩn');
  } else if (cutoffMethods === 0) {
    issues.push('Có điểm chuẩn nhưng 0 phương thức');
  }

  if (!hasAdmissionMethods) {
    issues.push('Thiếu PTXT (admission_methods)');
  } else if (admissionMethodsCount === 0) {
    issues.push('PTXT rỗng');
  }

  if (hasCutoff && cutoffMethods > 0 && (!hasAdmissionMethods || admissionMethodsCount === 0)) {
    issues.push('CÓ điểm chuẩn nhưng THIẾU PTXT');
  }

  if (issues.length > 0) {
    reports.push({
      code,
      name: data.university?.name || code,
      hasCutoff,
      cutoffMethods,
      hasAdmissionMethods,
      admissionMethodsCount,
      issues,
    });
  }
}

console.log('=== BÁO CÁO: Trường có điểm chuẩn nhưng thiếu PTXT ===\n');
const critical = reports.filter((r) => r.issues.includes('CÓ điểm chuẩn nhưng THIẾU PTXT'));
console.log(`Tổng số trường có vấn đề: ${reports.length}`);
console.log(`Trường CÓ điểm chuẩn nhưng THIẾU PTXT: ${critical.length}\n`);

if (critical.length > 0) {
  console.log('--- DANH SÁCH TRƯỜNG CÓ ĐIỂM CHUẨN NHƯNG THIẾU PTXT ---');
  critical.forEach((r) => {
    console.log(`${r.code} - ${r.name}`);
    console.log(`  Điểm chuẩn: ${r.cutoffMethods} phương thức, PTXT: ${r.admissionMethodsCount} phương thức`);
  });
}

console.log('\n--- DANH SÁCH TRƯỜNG THIẾU ĐIỂM CHUẨN ---');
const missingCutoff = reports.filter((r) => !r.hasCutoff);
console.log(`Số lượng: ${missingCutoff.length}`);
missingCutoff.forEach((r) => {
  console.log(`${r.code} - ${r.name}`);
});

console.log('\n--- DANH SÁCH TRƯỜNG CÓ ĐIỂM CHUẨN NHƯNG 0 PHƯƠNG THỨC ---');
const zeroCutoffMethods = reports.filter((r) => r.hasCutoff && r.cutoffMethods === 0);
console.log(`Số lượng: ${zeroCutoffMethods.length}`);
zeroCutoffMethods.forEach((r) => {
  console.log(`${r.code} - ${r.name}`);
});

console.log('\n--- TỔNG HỢP ---');
console.log(`Tổng file JSON: ${files.length}`);
console.log(`Có điểm chuẩn: ${files.filter((f) => JSON.parse(fs.readFileSync(path.join(outputDir, f), 'utf-8')).cutoff_scores).length}`);
console.log(`Thiếu điểm chuẩn: ${missingCutoff.length}`);
console.log(`Có điểm chuẩn nhưng thiếu PTXT: ${critical.length}`);
console.log(`Có điểm chuẩn nhưng 0 phương thức: ${zeroCutoffMethods.length}`);
