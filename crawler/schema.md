# University Admission Data Schema (RAG-Optimized)

## Overview

Each university admission page from `tuyensinh247.com` is parsed into a single JSON file.
Data is structured for **Retrieval-Augmented Generation (RAG)** chatbot use-case:
- Flat top-level metadata for fast filtering
- Text-heavy sections preserved as raw strings for semantic search
- Structured program lists for precise retrieval

---

## Page Sections → JSON Mapping

After inspecting live pages across 8 universities (BKA, KHA, HTC, YHB, SPH, QSB, QHI, NTH), all pages contain these DOM sections with class `div.content-page__index-content`:

### Required Sections (all universities)

| # | Section ID | Title | Table? | Maps To |
|---|-----------|-------|--------|---------|
| 1 | *(empty)* | Phương thức xét tuyển năm 2026 | Yes | `admission_methods[]` |
| 2 | `nganh-dao-tao` | Danh sách ngành đào tạo | Yes | `programs[]` |
| 3 | `diem-chuan` | Điểm chuẩn | No | `cutoff_scores` |
| 4 | `file-pdf-de-an` | File PDF đề án | No | `pdf_urls[]` |
| 5 | `gioi-thieu` | Giới thiệu trường | No | `university` |

### Optional Sections (varies by university)

| # | Section ID | Title | Table? | Maps To | Example Schools |
|---|-----------|-------|--------|---------|-----------------|
| 6 | `thoi-gian-ho-so-xet-tuyen` | Thờigian & hồ sơ xét tuyển | No* | `timeline` | BKA, KHA, SPH, QHI, NTH |
| 7 | `hoc-phi` | Học phí | No* | `tuition` | KHA, HTC, QSB, QHI |
| 8 | `quy-doi-diem` | Quy đổi điểm | Yes | `score_conversion` | HTC, NTH |

\* Occasionally contains table (e.g. QSB `hoc-phi` has table; NTH `thoi-gian-ho-so-xet-tuyen` has table)

---

## Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `university` | `UniversityInfo` | School identity and contact info |
| `admission_year` | `number \| null` | Academic year (e.g. 2026) |
| `total_quota` | `number \| null` | Total enrollment quota |
| `source_url` | `string` | Original crawled URL |
| `pdf_urls` | `string[]` | **All** PDF links (3-5 per school) |
| `admission_overview` | `string \| null` | Executive summary from top of page |
| `admission_methods` | `AdmissionMethod[]` | List of admission methods with programs |
| `programs` | `ProgramInfo[]` | **All** programs from `nganh-dao-tao` section |
| `cutoff_scores` | `CutoffInfo \| null` | Structured cutoff info |
| `timeline` | `TimelineInfo \| null` | Timeline and registration info |
| `tuition` | `TuitionInfo \| null` | Tuition fee info |
| `score_conversion` | `ScoreConversionInfo \| null` | Score conversion table (IELTS/SAT/etc) |
| `scraped_at` | `string` | ISO 8601 timestamp |

---

## `UniversityInfo`

```typescript
interface UniversityInfo {
  code: string;                    // e.g. "BKA", "KHA"
  name: string;                    // Full Vietnamese name
  short_name: string | null;       // Abbreviation: "HUST", "NEU", "AOF"
  english_name: string | null;     // English name from gioi-thieu
  location: string[];              // ["Hà Nội"]
  address: string | null;
  website: string | null;
  phone: string | null;            // From gioi-thieu
  email: string | null;            // From gioi-thieu
  type: string | null;             // "Đại học", "Học viện", etc.
  founded_year: number | null;     // Year established
  description: string | null;      // Short description
  achievements: string[];          // Awards, rankings, honors
}
```

---

## `AdmissionMethod`

```typescript
interface AdmissionMethod {
  method_id: string;               // slugified: "diem-thi-thpt"
  method_name: string;             // "ĐIỂM THI THPT"
  description: string | null;      // General rules
  eligibility: string | null;      // Đối tượng xét tuyển
  rules: string | null;            // Quy chế / conditions
  admission_blocks: string[];      // Tổ hợp: ["A00", "A01", "D07"]
  programs: ProgramInfo[];         // Programs for this method
}
```

---

## `ProgramInfo`

```typescript
interface ProgramInfo {
  program_code: string;            // e.g. "BF1", "7220201"
  program_name: string;            // e.g. "Kỹ thuật Sinh học"
  subject_groups: string[];        // ["A00", "A01", "D07"]
  program_type: ProgramType;
  quota: number | null;            // Chỉ tiêu (if in table)
  note: string | null;             // Additional remarks
  admission_methods: string[];     // Method IDs applicable
}

type ProgramType =
  | "chuẩn"
  | "chất_lượng_cao"
  | "tiên_tiến"
  | "liên_kết_quốc_tế"
  | "việt_pháp"
  | "liên_kết_troy"
  | "định_hướng_nghề_nghiệp"
  | string;
```

---

## `CutoffInfo`

```typescript
interface CutoffInfo {
  raw_text: string | null;         // Raw text from diem-chuan section
  external_url: string | null;     // Link to detailed cutoff page
  year: number | null;             // Year mentioned
}
```

---

## `TimelineInfo`

```typescript
interface TimelineInfo {
  raw_text: string | null;         // Raw text
  events: TimelineEvent[];         // Parsed events
  pdf_urls: string[];              // PDFs in this section
}

interface TimelineEvent {
  date_range: string | null;       // "01/03 - 15/05/2026"
  title: string | null;            // "Đăng ký xét tuyển"
  description: string | null;
}
```

---

## `TuitionInfo`

```typescript
interface TuitionInfo {
  raw_text: string | null;         // Raw text from hoc-phi section
  programs: TuitionProgram[];      // If table present
}

interface TuitionProgram {
  program_name: string;
  tuition_per_year: string | null; // "25.000.000 đồng/năm"
  currency: string;                // "VND"
  note: string | null;
}
```

---

## `ScoreConversionInfo`

```typescript
interface ScoreConversionInfo {
  raw_text: string | null;         // Raw text from quy-doi-diem
  table: ConversionRow[];          // Conversion table
}

interface ConversionRow {
  certificate_type: string;        // "IELTS", "SAT", "VSTEP"
  score_range: string;             // "6.5 - 7.0"
  converted_score: string;         // Converted score
  note: string | null;
}
```

---

## Data Coverage per Page Section

| DOM Section | Extracted To | Status |
|-------------|-------------|--------|
| Overview text (before first section) | `admission_overview` | ✅ Full text |
| Phương thức xét tuyển (no id) | `admission_methods[]` | ✅ Each method split |
| Danh sách ngành đào tạo | `programs[]` + methods | ✅ All programs |
| Điểm chuẩn | `cutoff_scores` | ✅ Raw text + link |
| Thờigian & hồ sơ | `timeline` | ✅ Raw text (if present) |
| Học phí | `tuition` | ✅ Raw text (if present) |
| Quy đổi điểm | `score_conversion` | ❌ **NOT IMPLEMENTED** |
| File PDF | `pdf_urls[]` | ⚠️ Only first PDF captured |
| Giới thiệu trường | `university` | ✅ Basic info |

---

## Known Gaps (To Fix)

1. **`quy-doi-diem` section**: Completely missing from parser. Present in HTC, NTH, possibly others.
2. **Only 1 PDF saved**: Each school has 3-5 PDFs. Need to capture all into `pdf_urls[]`.
3. **`university` incomplete**: Missing `english_name`, `phone`, `email`, `founded_year`, `achievements`.
4. **`program.quota`**: Not parsed from `nganh-dao-tao` table.
5. **`note` field pollution**: Often captures STT ("1", "2", "3") instead of real notes.
6. **`total_quota`**: BKA has "9.880" in overview but not extracted.

---

## RAG Chunking Recommendation

Chunk each JSON into document units for vector DB:

1. **University metadata** — `university` + `admission_overview` + year + quota
2. **Per-method chunk** — Each `AdmissionMethod` standalone with its `programs[]`
3. **All-programs chunk** — `programs[]` for cross-method search
4. **Raw-text chunks** — `cutoff_scores.raw_text`, `tuition.raw_text`, `timeline.raw_text`, `score_conversion.raw_text`

---

## Sample JSON (BKA - Condensed)

```json
{
  "university": {
    "code": "BKA",
    "name": "Đại học Bách khoa Hà Nội",
    "short_name": "HUST",
    "english_name": "Hanoi University of Science and Technology",
    "location": ["Hà Nội"],
    "address": "Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội",
    "website": "https://hust.edu.vn/",
    "phone": null,
    "email": null,
    "type": "Đại học",
    "founded_year": 1956,
    "description": "Trường đại học kỹ thuật hàng đầu Việt Nam...",
    "achievements": ["Top 400 QS Asia", "ĐHQG trọng điểm"]
  },
  "admission_year": 2026,
  "total_quota": 9880,
  "source_url": "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-bach-khoa-ha-noi-BKA.html",
  "pdf_urls": [
    "https://images.tuyensinh247.com/picture/2026/0225/thong-tin-tuyen-sinh-dai-hoc-bach-khoa-ha-noi-2026.pdf",
    "https://images.tuyensinh247.com/picture/2026/0115/flyer-tuyen-sinh-2026.pdf",
    "https://images.tuyensinh247.com/picture/2025/0408/hust-2025-1_1.pdf"
  ],
  "admission_overview": "ĐỀ ÁN TUYỂN SINH ĐẠI HỌC BÁCH KHOA HÀ NỘI 2026...",
  "admission_methods": [
    {
      "method_id": "diem-thi-thpt",
      "method_name": "ĐIỂM THI THPT",
      "description": "Xét tuyển dựa trên điểm thi tốt nghiệp THPT...",
      "eligibility": "Thí sinh tham dự kỳ thi tốt nghiệp THPT năm 2026...",
      "rules": "Tổ hợp: K01, A00, A01, B00, D01, D04, D07, DD2...",
      "admission_blocks": ["K01", "A00", "A01", "B00", "D01", "D04", "D07", "DD2"],
      "programs": [{ "program_code": "BF1", "program_name": "Kỹ thuật Sinh học", ... }]
    }
  ],
  "programs": [
    { "program_code": "BF1", "program_name": "Kỹ thuật Sinh học", "subject_groups": ["A00", "B00", ...], "program_type": "chuẩn", "quota": null, "note": null, "admission_methods": ["diem-thi-thpt", "diem-thi-dgtd"] }
  ],
  "cutoff_scores": {
    "raw_text": "Xem điểm chuẩn... TẠI ĐÂY",
    "external_url": "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-bach-khoa-ha-noi-BKA.html",
    "year": null
  },
  "timeline": { "raw_text": "THỜI GIAN VÀ HỒ SƠ XÉT TUYỂN HUST...", "events": [], "pdf_urls": [] },
  "tuition": null,
  "score_conversion": null,
  "scraped_at": "2026-04-29T10:00:00.000Z"
}
```
