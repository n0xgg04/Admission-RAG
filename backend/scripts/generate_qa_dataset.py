from __future__ import annotations

import argparse
import re
import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class QAItem:
    question: str
    answer: str
    intent: str
    university_code: str
    university_name: str
    admission_year: int | None
    data_status: str
    confidence: float
    tags: list[str]
    method_id: str | None = None
    program_code: str | None = None
    program_type: str | None = None
    entity_type: str | None = None
    entity_field: str | None = None
    is_contrastive: bool = False


def compact_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def preserve_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = [" ".join(line.split()) for line in text.split("\n")]
    cleaned = "\n".join([line for line in lines if line])
    return cleaned.strip()


def variants(*qs: str) -> list[str]:
    return [q.strip() for q in qs if q and q.strip()]


def unique_qa(items: list[QAItem]) -> list[QAItem]:
    seen: set[tuple[str, str, str]] = set()
    out: list[QAItem] = []
    for item in items:
        key = (item.university_code, item.intent, item.question.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def is_hard_negative(item: QAItem) -> bool:
    if item.intent.startswith("hard_negative"):
        return True
    if "hard_negative" in item.tags:
        return True
    if item.intent.startswith("negative_"):
        return True
    if "negative" in item.tags:
        return True
    return False


def balance_hard_negative_ratio(
    items: list[QAItem],
    min_ratio: float,
    max_ratio: float,
    seed: int,
) -> list[QAItem]:
    if not items:
        return items
    if min_ratio < 0 or max_ratio <= 0 or min_ratio >= max_ratio or max_ratio >= 1:
        return items

    negatives = [x for x in items if is_hard_negative(x)]
    positives = [x for x in items if not is_hard_negative(x)]
    n_neg = len(negatives)
    n_pos = len(positives)
    total = n_neg + n_pos
    if total == 0:
        return items

    current_ratio = n_neg / total
    if current_ratio <= max_ratio:
        return items

    target_ratio = (min_ratio + max_ratio) / 2.0
    max_neg_keep = int((target_ratio * n_pos) / (1.0 - target_ratio))
    max_neg_keep = max(0, min(max_neg_keep, n_neg))

    rng = random.Random(seed)
    kept_neg = rng.sample(negatives, max_neg_keep)
    balanced = positives + kept_neg
    rng.shuffle(balanced)
    return balanced


def fallback_missing_message(topic: str, school: str) -> str:
    return f"Xin lỗi, hiện tại thông tin {topic} của {school} chưa được cung cấp."


def qa_item(
    question: str,
    answer: str,
    intent: str,
    code: str,
    name: str,
    data_status: str,
    confidence: float,
    tags: list[str],
    method_id: str | None = None,
    program_code: str | None = None,
    program_type: str | None = None,
    entity_type: str | None = None,
    entity_field: str | None = None,
    is_contrastive: bool = False,
) -> QAItem:
    return QAItem(
        question=question,
        answer=answer,
        intent=intent,
        university_code=code,
        university_name=name,
        admission_year=None,
        data_status=data_status,
        confidence=confidence,
        tags=tags,
        method_id=method_id,
        program_code=program_code,
        program_type=program_type,
        entity_type=entity_type,
        entity_field=entity_field,
        is_contrastive=is_contrastive,
    )


def school_aliases(name: str, short_name: str, code: str) -> list[str]:
    aliases = {name, short_name, code}
    aliases.add(name.replace("Đại Học", "ĐH"))
    aliases.add(name.replace("Đại học", "ĐH"))
    aliases.add(name.replace("Học Viện", "HV"))
    aliases.add(name.replace("Học viện", "HV"))
    aliases.add(name.replace("Trường Đại Học", "ĐH"))
    aliases.add(name.replace("Trường Đại học", "ĐH"))
    aliases.add(name.replace("Học Viện", "" ).strip())
    aliases.add(name.replace("Học viện", "" ).strip())
    aliases.add(name.replace("Trường", "" ).strip())
    return [a for a in aliases if compact_text(a)]


def split_paragraphs(text: str) -> list[str]:
    if not text:
        return []
    parts = [p.strip() for p in text.split("\n") if p.strip()]
    out: list[str] = []
    for p in parts:
        if len(p) <= 1000:
            out.append(p)
            continue
        step = 900
        for i in range(0, len(p), step):
            out.append(p[i : i + step].strip())
    return [p for p in out if p]


def lines_with_keywords(text: str, keywords: list[str]) -> list[str]:
    if not text:
        return []
    hits: list[str] = []
    for line in text.split("\n"):
        low = line.lower()
        if any(k in low for k in keywords):
            c = compact_text(line)
            if c:
                hits.append(c)
    return hits


def extract_program_candidates(text: str) -> list[str]:
    if not text:
        return []

    cleaned = preserve_text(text)
    if not cleaned:
        return []

    # gom theo cac mau: "nganh X", "mo them X nganh moi", danh sach sau dau ':'
    raw_chunks: list[str] = []

    for m in re.finditer(r"(?i)nganh\s+([A-ZÀ-Ỵa-zà-ỵ0-9\-\+\./,&()\s]{3,120})", cleaned):
        raw_chunks.append(m.group(1))

    for m in re.finditer(r"(?i)(?:bao gom|gồm|gom|mo them|mở thêm|co cac nganh|có các ngành)\s*:\s*([^\.\n]{8,350})", cleaned):
        raw_chunks.append(m.group(1))

    candidates: list[str] = []
    seen: set[str] = set()
    stop_words = {
        "năm",
        "phương thức",
        "xét tuyển",
        "tuyển sinh",
        "thpt",
        "điểm",
        "chứng chỉ",
        "quy chế",
        "học phí",
        "chỉ tiêu",
        "kết quả",
    }

    for chunk in raw_chunks:
        parts = re.split(r"\s*[;\|\n]\s*|\s*,\s*|\s+và\s+|\s+-\s+", chunk)
        for part in parts:
            p = compact_text(part).strip(" .:-")
            if not p:
                continue
            low = p.lower()
            if len(p) < 3 or len(p) > 70:
                continue
            if any(sw in low for sw in stop_words):
                continue
            if re.fullmatch(r"[0-9\W_]+", p):
                continue
            norm = low
            if norm in seen:
                continue
            seen.add(norm)
            candidates.append(p)

    return candidates


def topn_with_ellipsis(items: list[str], n: int = 5) -> str:
    unique_items: list[str] = []
    seen: set[str] = set()
    for it in items:
        key = compact_text(it).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique_items.append(compact_text(it))
    if not unique_items:
        return ""
    if len(unique_items) <= n:
        return ", ".join(unique_items)
    return ", ".join(unique_items[:n]) + ", ..."


def parse_tuition_values_million(text: str) -> list[float]:
    if not text:
        return []
    src = text.lower().replace(",", ".")
    values: list[float] = []

    # 30 triệu, 30-40 triệu, 30 đến 40 triệu
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(?:-|–|den|đến)\s*(\d+(?:\.\d+)?)\s*triệu", src):
        a = float(m.group(1))
        b = float(m.group(2))
        values.extend([a, b])

    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*triệu", src):
        values.append(float(m.group(1)))

    # 785.000 đồng/tín chỉ -> đổi ra triệu đồng
    for m in re.finditer(r"(\d{1,3}(?:\.\d{3})+)\s*đồng", text):
        raw = m.group(1).replace(".", "")
        try:
            v = float(raw) / 1_000_000
            if v > 0:
                values.append(v)
        except ValueError:
            pass

    cleaned: list[float] = []
    for v in values:
        if 0 < v < 2000:
            cleaned.append(round(v, 3))
    return cleaned


def make_record_index(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    indexed: list[dict[str, Any]] = []
    for rec in records:
        code = compact_text(rec.get("ma-truong")).upper() or "UNK"
        name = compact_text(rec.get("ten-truong")) or "Trường chưa rõ tên"
        short_name = compact_text(rec.get("ten-viet-tat"))
        province = compact_text(rec.get("dia-chi-tinh"))
        plan = preserve_text(rec.get("de-an-tuyen-sinh"))
        tuition = preserve_text(rec.get("hoc-phi"))
        programs = extract_program_candidates(plan)
        tuition_values = parse_tuition_values_million(tuition)
        indexed.append(
            {
                "code": code,
                "name": name,
                "short_name": short_name,
                "province": province,
                "plan": plan,
                "tuition": tuition,
                "programs": programs,
                "tuition_values": tuition_values,
            }
        )
    return indexed


def load_cutoff_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    return [x for x in raw if isinstance(x, dict)]


def build_cutoff_index(cutoff_records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for row in cutoff_records:
        code = compact_text(row.get("ma-truong")).upper()
        if not code:
            continue
        out.setdefault(code, []).append(row)
    return out


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (ValueError, TypeError):
        return None


def qa_global_province(indexed: list[dict[str, Any]]) -> list[QAItem]:
    province_map: dict[str, list[str]] = {}
    for row in indexed:
        province = row["province"]
        if not province:
            continue
        for p in [compact_text(x) for x in province.split(",") if compact_text(x)]:
            province_map.setdefault(p, [])
            if row["name"] not in province_map[p]:
                province_map[p].append(row["name"])

    items: list[QAItem] = []
    for province, schools in province_map.items():
        answer = f"Một số trường ở {province}: {topn_with_ellipsis(schools, 5)}"
        for q in variants(
            f"Các trường ở {province} là gì?",
            f"Có những trường nào tại {province}?",
            f"Gợi ý trường ở {province}.",
        ):
            items.append(qa_item(q, answer, "global_schools_by_province", "ALL", "Toàn bộ trường", "complete", 0.9, ["global", "province", "top5"]))
    return items


def qa_global_method_keywords(indexed: list[dict[str, Any]]) -> list[QAItem]:
    method_keywords = ["ielts", "sat", "act", "hsa", "tsa", "v-act", "học bạ", "hoc ba"]
    items: list[QAItem] = []

    for kw in method_keywords:
        schools: list[str] = []
        for row in indexed:
            if kw.lower() in row["plan"].lower():
                schools.append(row["name"])
        if not schools:
            continue
        answer = f"Một số trường có đề cập {kw.upper()}: {topn_with_ellipsis(schools, 5)}"
        for q in variants(
            f"Trường nào nhận {kw.upper()}?",
            f"Trường nào có {kw.upper()} trong phương thức xét tuyển?",
            f"Các trường dùng {kw.upper()} để xét tuyển là gì?",
        ):
            items.append(qa_item(q, answer, "global_method_keyword", "ALL", "Toàn bộ trường", "complete", 0.86, ["global", "method", "keyword", "top5"]))
    return items


def qa_global_program_keyword(indexed: list[dict[str, Any]]) -> list[QAItem]:
    canonical_keywords = {
        "ai": ["ai", "trí tuệ nhân tạo", "tri tue nhan tao", "khoa học dữ liệu", "khoa hoc du lieu", "machine learning"],
        "cntt": ["cntt", "công nghệ thông tin", "cong nghe thong tin", "khoa học máy tính", "khoa hoc may tinh", "it"],
        "kinh tế quốc tế": ["kinh tế quốc tế", "kinh te quoc te", "international business"],
        "marketing": ["marketing", "tiếp thị", "tiep thi"],
        "y khoa": ["y khoa", "bác sĩ", "bac si", "y học", "y hoc"],
        "logistics": ["logistics", "chuỗi cung ứng", "chuoi cung ung", "supply chain"],
    }

    items: list[QAItem] = []
    for label, keys in canonical_keywords.items():
        schools: list[str] = []
        for row in indexed:
            joined = " | ".join(row["programs"]).lower()
            if any(k in joined for k in keys):
                schools.append(row["name"])
        if not schools:
            continue
        answer = f"Một số trường có ngành liên quan {label}: {topn_with_ellipsis(schools, 5)}"
        for q in variants(
            f"Trường nào đào tạo ngành {label}?",
            f"Ngành liên quan {label} học ở đâu?",
            f"Gợi ý trường có ngành {label}.",
        ):
            items.append(qa_item(q, answer, "global_program_keyword", "ALL", "Toàn bộ trường", "complete", 0.84, ["global", "program", "keyword", "top5"]))
    return items


def qa_global_province_program(indexed: list[dict[str, Any]]) -> list[QAItem]:
    demand_cases = [
        ("it", ["cntt", "công nghệ thông tin", "cong nghe thong tin", "khoa học máy tính", "khoa hoc may tinh", "it"]),
        ("ai", ["ai", "trí tuệ nhân tạo", "tri tue nhan tao", "khoa học dữ liệu", "khoa hoc du lieu"]),
        ("kinh tế", ["kinh tế", "kinh te", "tài chính", "tai chinh", "quản trị", "quan tri"]),
        ("y", ["y", "dược", "duoc", "điều dưỡng", "dieu duong"]),
    ]

    provinces: set[str] = set()
    for row in indexed:
        for p in [compact_text(x) for x in row["province"].split(",") if compact_text(x)]:
            provinces.add(p)

    items: list[QAItem] = []
    for province in sorted(provinces):
        for label, keys in demand_cases:
            schools: list[str] = []
            for row in indexed:
                if province.lower() not in row["province"].lower():
                    continue
                joined = " | ".join(row["programs"]).lower()
                if any(k in joined for k in keys):
                    schools.append(row["name"])
            if not schools:
                continue
            answer = f"Gợi ý một số trường ở {province} có nhóm ngành {label}: {topn_with_ellipsis(schools, 5)}"
            for q in variants(
                f"Muốn học {label.upper()} ở {province} thì chọn trường nào?",
                f"Trường ở {province} có ngành {label.upper()} là gì?",
            ):
                items.append(qa_item(q, answer, "global_recommend_by_province_program", "ALL", "Toàn bộ trường", "complete", 0.82, ["global", "recommend", "province", "program", "top5"]))
    return items


def qa_global_tuition(indexed: list[dict[str, Any]]) -> list[QAItem]:
    buckets = [20.0, 30.0, 40.0, 50.0]
    items: list[QAItem] = []

    for threshold in buckets:
        schools: list[str] = []
        for row in indexed:
            vals = row["tuition_values"]
            if not vals:
                continue
            if min(vals) <= threshold:
                schools.append(row["name"])
        if not schools:
            continue
        answer = f"Một số trường có học phí từ mức {threshold:g} triệu trở xuống (theo dữ liệu mô tả): {topn_with_ellipsis(schools, 5)}"
        for q in variants(
            f"Trường nào học phí dưới {threshold:g} triệu?",
            f"Gợi ý trường có học phí không quá {threshold:g} triệu.",
        ):
            items.append(qa_item(q, answer, "global_tuition_under_threshold", "ALL", "Toàn bộ trường", "partial", 0.75, ["global", "tuition", "filter", "top5"]))

    # Mẫu truy vấn đánh giá cao/thấp theo ngành Y
    y_schools: list[str] = []
    for row in indexed:
        joined = " | ".join(row["programs"]).lower()
        if any(k in joined for k in ["y", "dược", "duoc", "điều dưỡng", "dieu duong"]):
            y_schools.append(row["name"])
    if y_schools:
        items.append(
            qa_item(
                "Ngành Y học phí cao không?",
                "Nhóm ngành Y thường có học phí ở mức trung bình đến cao tùy trường. Một số trường có đào tạo nhóm ngành Y: "
                + topn_with_ellipsis(y_schools, 5),
                "global_tuition_y_major",
                "ALL",
                "Toàn bộ trường",
                "partial",
                0.68,
                ["global", "tuition", "program", "y"],
            )
        )
    return items


def qa_global_missing_negative(indexed: list[dict[str, Any]]) -> list[QAItem]:
    items: list[QAItem] = []
    for row in indexed:
        name = row["name"]
        code = row["code"]
        if not row["plan"]:
            items.append(
                qa_item(
                    f"{name} chưa có đề án thì sao?",
                    f"Hiện chưa thấy đề án tuyển sinh của {name} trong dữ liệu hiện tại. Bạn nên xem thông báo chính thức từ trường hoặc nguồn đề án đầy đủ để cập nhật mới nhất.",
                    "negative_missing_admission",
                    code,
                    name,
                    "missing",
                    0.9,
                    ["negative", "missing", "admission"],
                )
            )
        if "học bạ" not in row["plan"].lower() and "hoc ba" not in row["plan"].lower():
            items.append(
                qa_item(
                    f"{name} có xét học bạ không?",
                    f"Trong dữ liệu hiện tại, chưa thấy đề cập rõ phương thức xét học bạ của {name}. Bạn nên kiểm tra đề án tuyển sinh chi tiết của trường để xác nhận.",
                    "negative_hoc_ba_not_found",
                    code,
                    name,
                    "partial",
                    0.82,
                    ["negative", "method", "hoc_ba"],
                )
            )
    return items


def qa_hard_negative(indexed: list[dict[str, Any]]) -> list[QAItem]:
    items: list[QAItem] = []

    all_provinces: list[str] = sorted(
        {
            compact_text(p)
            for row in indexed
            for p in row["province"].split(",")
            if compact_text(p)
        }
    )

    method_checks = ["ielts", "sat", "act", "hsa", "tsa", "v-act", "học bạ"]
    major_groups: list[tuple[str, list[str]]] = [
        ("Y", ["y", "dược", "duoc", "điều dưỡng", "dieu duong", "răng", "rang"]),
        ("CNTT", ["cntt", "công nghệ thông tin", "cong nghe thong tin", "it", "khoa học máy tính", "khoa hoc may tinh"]),
        ("Logistics", ["logistics", "chuỗi cung ứng", "chuoi cung ung", "supply chain"]),
        ("Luật", ["luật", "luat", "pháp luật", "phap luat"]),
    ]

    for row in indexed:
        code = row["code"]
        name = row["name"]
        province_text = row["province"]
        plan_text = row["plan"].lower()
        programs_text = " | ".join(row["programs"]).lower()

        # 1) Sai tỉnh
        wrong_province = ""
        for p in all_provinces:
            if p.lower() not in province_text.lower():
                wrong_province = p
                break
        if wrong_province:
            items.append(
                qa_item(
                    f"{name} ở {wrong_province} đúng không?",
                    f"Không. Theo dữ liệu hiện tại, {name} thuộc khu vực: {province_text or 'chưa rõ'}.",
                    "hard_negative_wrong_province",
                    code,
                    name,
                    "complete" if province_text else "partial",
                    0.94,
                    ["hard_negative", "province", "correction"],
                )
            )

        # 2) Sai ngành
        for label, keys in major_groups:
            if not any(k in programs_text for k in keys):
                items.append(
                    qa_item(
                        f"{name} có đào tạo ngành {label} không?",
                        f"Trong dữ liệu hiện tại, chưa thấy {name} có ngành thuộc nhóm {label}. Bạn nên kiểm tra đề án tuyển sinh chi tiết để xác nhận cập nhật mới nhất.",
                        "hard_negative_wrong_major",
                        code,
                        name,
                        "partial",
                        0.86,
                        ["hard_negative", "major", "correction"],
                    )
                )
                break

        # 3) Sai phương thức
        for kw in method_checks:
            if kw not in plan_text:
                items.append(
                    qa_item(
                        f"{name} có xét tuyển bằng {kw.upper()} không?",
                        f"Trong dữ liệu hiện tại, chưa thấy đề cập rõ {kw.upper()} trong phương thức xét tuyển của {name}. Bạn nên xem đề án tuyển sinh đầy đủ để xác nhận.",
                        "hard_negative_wrong_method",
                        code,
                        name,
                        "partial",
                        0.87,
                        ["hard_negative", "method", "correction"],
                    )
                )
                break

    return items


def qa_profile(record: dict[str, Any], aliases: list[str]) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    short_name = compact_text(record.get("ten-viet-tat"))
    province = compact_text(record.get("dia-chi-tinh"))
    address = preserve_text(record.get("dia-chi-cu-the"))

    answer = (
        f"Thông tin cơ bản của {name}: mã trường {code}; viết tắt {short_name or 'chưa rõ'}; "
        f"tỉnh/thành {province or 'chưa rõ'}; địa chỉ {address or 'chưa rõ'}."
    )
    items: list[QAItem] = []
    for alias in aliases:
        for q in variants(
            f"Thông tin cơ bản của {alias} là gì?",
            f"{alias} ở đâu, mã trường là gì?",
            f"Cho mình thông tin trường {alias}.",
            f"Mã trường của {alias} là gì?",
            f"{alias} viết tắt là gì?",
            f"Địa chỉ cụ thể của {alias} ở đâu?",
        ):
            items.append(qa_item(q, answer, "university_profile", code, name, "complete", 0.95, ["profile", "address", "code"]))

    # Canonical fact-lookup (structured by field)
    if address:
        for alias in aliases:
            for q in variants(
                f"{alias} ở đâu?",
                f"Địa chỉ của {alias} là gì?",
                f"{alias} nằm ở đâu?",
            ):
                items.append(
                    qa_item(
                        q,
                        f"{name} có địa chỉ: {address}.",
                        "fact_address",
                        code,
                        name,
                        "complete",
                        0.99,
                        ["fact", "address", "lookup"],
                        entity_type="fact",
                        entity_field="address",
                    )
                )

    if code:
        for alias in aliases:
            for q in variants(
                f"Mã trường của {alias} là gì?",
                f"{alias} mã trường là gì?",
                f"Code trường {alias} là gì?",
            ):
                items.append(
                    qa_item(
                        q,
                        f"Mã trường của {name} là: {code}.",
                        "fact_code",
                        code,
                        name,
                        "complete",
                        0.99,
                        ["fact", "code", "lookup"],
                        entity_type="fact",
                        entity_field="code",
                    )
                )

    if short_name:
        for alias in aliases:
            for q in variants(
                f"Tên viết tắt của {alias} là gì?",
                f"{alias} viết tắt là gì?",
                f"{alias} gọi tắt là gì?",
            ):
                items.append(
                    qa_item(
                        q,
                        f"Tên viết tắt của {name} là: {short_name}.",
                        "fact_short_name",
                        code,
                        name,
                        "complete",
                        0.99,
                        ["fact", "short_name", "lookup"],
                        entity_type="fact",
                        entity_field="short_name",
                    )
                )

    if province:
        for alias in aliases:
            for q in variants(
                f"{alias} thuộc tỉnh/thành nào?",
                f"{alias} ở tỉnh nào?",
                f"{alias} ở thành phố nào?",
            ):
                items.append(
                    qa_item(
                        q,
                        f"{name} thuộc khu vực/tỉnh-thành: {province}.",
                        "fact_province",
                        code,
                        name,
                        "complete",
                        0.99,
                        ["fact", "province", "lookup"],
                        entity_type="fact",
                        entity_field="province",
                    )
                )

    if code:
        items.append(
            qa_item(
                f"Mã {code} là trường nào?",
                f"Mã trường {code} tương ứng với {name}.",
                "lookup_by_code",
                code,
                name,
                "complete",
                0.98,
                ["lookup", "code"],
            )
        )

    # Contrastive negatives for fact lookup
    contrastive_provinces = ["Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ"]
    for wp in contrastive_provinces:
        if province and wp.lower() in province.lower():
            continue
        for alias in aliases[:2]:
            items.append(
                qa_item(
                    f"{alias} ở {wp} đúng không?",
                    f"Không. Theo dữ liệu hiện tại, {name} thuộc khu vực: {province or 'chưa rõ'}.",
                    "fact_province_contrastive_negative",
                    code,
                    name,
                    "complete" if province else "partial",
                    0.93,
                    ["fact", "province", "contrastive", "negative"],
                    entity_type="fact",
                    entity_field="province",
                    is_contrastive=True,
                )
            )
        break

    return items


def qa_intro(record: dict[str, Any], aliases: list[str]) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    intro = preserve_text(record.get("gioi-thieu"))
    items: list[QAItem] = []

    if not intro:
        for alias in aliases:
            items.append(
                qa_item(
                    f"Giới thiệu tổng quan về {alias}.",
                    fallback_missing_message("giới thiệu", name),
                    "intro_missing",
                    code,
                    name,
                    "missing",
                    0.2,
                    ["intro", "missing"],
                )
            )
        return items

    for alias in aliases:
        for q in variants(
            f"Giới thiệu về {alias}.",
            f"Thông tin tổng quan trường {alias} là gì?",
            f"{alias} có lịch sử và điểm nổi bật nào?",
        ):
            items.append(qa_item(q, intro, "intro_full", code, name, "complete", 0.92, ["intro", "overview"]))

    paras = split_paragraphs(intro)
    for i, p in enumerate(paras[:40], start=1):
        for alias in aliases[:3]:
            items.append(
                qa_item(
                    f"Cho mình chi tiết phần {i} giới thiệu của {alias}.",
                    p,
                    "intro_segment",
                    code,
                    name,
                    "complete",
                    0.88,
                    ["intro", "segment"],
                )
            )
    return items


def qa_admission(record: dict[str, Any], aliases: list[str]) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    plan = preserve_text(record.get("de-an-tuyen-sinh"))
    items: list[QAItem] = []

    if not plan:
        for alias in aliases:
            items.append(
                qa_item(
                    f"Đề án tuyển sinh của {alias} như thế nào?",
                    fallback_missing_message("đề án tuyển sinh", name),
                    "admission_missing",
                    code,
                    name,
                    "missing",
                    0.2,
                    ["admission", "missing"],
                )
            )
        return items

    for alias in aliases:
        for q in variants(
            f"Thông tin tuyển sinh của {alias} là gì?",
            f"Đề án tuyển sinh của {alias} như thế nào?",
            f"{alias} có những phương thức xét tuyển nào?",
            f"Điều kiện xét tuyển vào {alias} là gì?",
            f"Hồ sơ và quy trình đăng ký vào {alias} như thế nào?",
            f"Tóm tắt nội dung đề án tuyển sinh của {alias}.",
        ):
            items.append(qa_item(q, plan, "admission_full", code, name, "complete", 0.93, ["admission", "methods", "rules"]))

    method_lines = lines_with_keywords(
        plan,
        [
            "phương thức",
            "xét tuyển",
            "đối tượng",
            "điều kiện",
            "tổ hợp",
            "chỉ tiêu",
            "sat",
            "act",
            "ielts",
            "toefl",
            "toeic",
            "hsa",
            "tsa",
            "v-act",
            "quy chế",
        ],
    )
    for i, line in enumerate(method_lines[:80], start=1):
        for alias in aliases[:3]:
            items.append(
                qa_item(
                    f"Chi tiết phương thức/yêu cầu {i} trong đề án của {alias} là gì?",
                    line,
                    "admission_method_detail",
                    code,
                    name,
                    "complete",
                    0.86,
                    ["admission", "methods", "detail"],
                )
            )

    paras = split_paragraphs(plan)
    for i, p in enumerate(paras[:80], start=1):
        for alias in aliases[:2]:
            items.append(
                qa_item(
                    f"Cho mình nội dung phần {i} của đề án tuyển sinh {alias}.",
                    p,
                    "admission_segment",
                    code,
                    name,
                    "complete",
                    0.84,
                    ["admission", "segment"],
                )
            )

    return items


def qa_tuition(record: dict[str, Any], aliases: list[str]) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    tuition = preserve_text(record.get("hoc-phi"))
    items: list[QAItem] = []

    if not tuition:
        for alias in aliases:
            items.append(
                qa_item(
                    f"Học phí của {alias} là bao nhiêu?",
                    fallback_missing_message("học phí", name),
                    "tuition_missing",
                    code,
                    name,
                    "missing",
                    0.2,
                    ["tuition", "missing"],
                )
            )
        return items

    for alias in aliases:
        for q in variants(
            f"Học phí của {alias} là bao nhiêu?",
            f"Mức học phí dự kiến tại {alias} như thế nào?",
            f"Học {alias} tốn khoảng bao nhiêu tiền?",
            f"Học phí các chương trình của {alias} có chênh lệch không?",
            f"{alias} có lộ trình tăng học phí không?",
        ):
            items.append(qa_item(q, tuition, "tuition_full", code, name, "complete", 0.93, ["tuition", "cost"]))

    fee_lines = lines_with_keywords(
        tuition,
        ["triệu", "tín chỉ", "năm", "học kỳ", "chương trình", "tăng", "nghị định", "%"],
    )
    for i, line in enumerate(fee_lines[:60], start=1):
        for alias in aliases[:3]:
            items.append(
                qa_item(
                    f"Chi tiết học phí {i} của {alias} là gì?",
                    line,
                    "tuition_detail",
                    code,
                    name,
                    "complete",
                    0.88,
                    ["tuition", "detail"],
                )
            )

    return items


def qa_cutoff_school_level(record: dict[str, Any], aliases: list[str], cutoff_index: dict[str, list[dict[str, Any]]]) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    rows = cutoff_index.get(code, [])
    items: list[QAItem] = []

    if not rows:
        for alias in aliases:
            for q in variants(
                f"Điểm chuẩn THPT của {alias} là bao nhiêu?",
                f"{alias} năm nay lấy bao nhiêu điểm?",
            ):
                items.append(
                    qa_item(
                        q,
                        f"Hiện chưa có dữ liệu điểm chuẩn THPT của {name} trong bộ dữ liệu hiện tại.",
                        "cutoff_missing",
                        code,
                        name,
                        "missing",
                        0.25,
                        ["cutoff", "missing"],
                    )
                )
        return items

    rows_sorted = sorted(rows, key=lambda x: safe_float(x.get("diem-chuan")) or -1, reverse=True)
    top_rows = rows_sorted[:5]
    top_text_parts: list[str] = []
    for r in top_rows:
        major = compact_text(r.get("ten-nganh")) or "chưa rõ ngành"
        score = safe_float(r.get("diem-chuan"))
        if score is None:
            continue
        top_text_parts.append(f"{major}: {score:g}")
    top_text = "; ".join(top_text_parts) if top_text_parts else "chưa có chi tiết điểm"
    if len(rows_sorted) > 5:
        top_text += "; ..."

    answer_top = f"Điểm chuẩn THPT tiêu biểu của {name}: {top_text}"
    for alias in aliases:
        for q in variants(
            f"Điểm chuẩn của {alias} là bao nhiêu?",
            f"{alias} năm nay lấy bao nhiêu điểm?",
            f"Top ngành điểm chuẩn cao của {alias} là gì?",
        ):
            items.append(qa_item(q, answer_top, "cutoff_school_top5", code, name, "complete", 0.9, ["cutoff", "school", "top5"]))

    # chi tiết theo ngành
    for r in rows_sorted[:80]:
        major = compact_text(r.get("ten-nganh"))
        score = safe_float(r.get("diem-chuan"))
        combo = compact_text(r.get("to-hop"))
        note = compact_text(r.get("ghi-chu"))
        major_code = compact_text(r.get("ma-nganh"))
        if not major or score is None:
            continue
        answer = f"Điểm chuẩn THPT ngành {major} của {name} là {score:g}. Tổ hợp: {combo or 'chưa rõ'}. Mã ngành: {major_code or 'chưa rõ'}."
        if note:
            answer += f" Ghi chú: {note}."
        for alias in aliases[:3]:
            for q in variants(
                f"Điểm chuẩn ngành {major} của {alias} là bao nhiêu?",
                f"{alias} ngành {major} lấy bao nhiêu điểm?",
            ):
                items.append(qa_item(q, answer, "cutoff_major_detail", code, name, "complete", 0.95, ["cutoff", "major", "detail"]))

    return items


def qa_cutoff_global(cutoff_records: list[dict[str, Any]], records: list[dict[str, Any]]) -> list[QAItem]:
    code_to_name: dict[str, str] = {}
    for rec in records:
        code = compact_text(rec.get("ma-truong")).upper()
        name = compact_text(rec.get("ten-truong"))
        if code and name:
            code_to_name[code] = name

    by_major: dict[str, list[tuple[str, float, str]]] = {}
    by_code: dict[str, list[tuple[str, float]]] = {}
    for row in cutoff_records:
        code = compact_text(row.get("ma-truong")).upper()
        major = compact_text(row.get("ten-nganh"))
        score = safe_float(row.get("diem-chuan"))
        if not code or not major or score is None:
            continue
        school_name = code_to_name.get(code, code)
        by_major.setdefault(major, []).append((school_name, score, code))
        by_code.setdefault(code, []).append((major, score))

    items: list[QAItem] = []

    # trường nào điểm chuẩn cao/thấp
    school_avg: list[tuple[str, float]] = []
    for code, pairs in by_code.items():
        vals = [s for _, s in pairs]
        if not vals:
            continue
        school_name = code_to_name.get(code, code)
        school_avg.append((school_name, sum(vals) / len(vals)))
    school_avg.sort(key=lambda x: x[1], reverse=True)
    if school_avg:
        top_text = topn_with_ellipsis([f"{n} ({v:.2f})" for n, v in school_avg], 5)
        items.append(
            qa_item(
                "Trường nào có mặt bằng điểm chuẩn THPT cao?",
                f"Một số trường có mặt bằng điểm chuẩn THPT cao (tham chiếu trung bình dữ liệu): {top_text}",
                "cutoff_global_school_avg_top",
                "ALL",
                "Toàn bộ trường",
                "partial",
                0.72,
                ["cutoff", "global", "top5"],
            )
        )

    # ngành học ở đâu theo điểm chuẩn
    for major, arr in list(by_major.items())[:500]:
        arr_sorted = sorted(arr, key=lambda x: x[1], reverse=True)
        txt = topn_with_ellipsis([f"{school} ({score:g})" for school, score, _ in arr_sorted], 5)
        for q in variants(
            f"Ngành {major} điểm chuẩn ở các trường là bao nhiêu?",
            f"Học ngành {major} thì các trường lấy điểm khoảng bao nhiêu?",
        ):
            items.append(
                qa_item(
                    q,
                    f"Một số trường có dữ liệu điểm chuẩn THPT ngành {major}: {txt}",
                    "cutoff_global_major_top5",
                    "ALL",
                    "Toàn bộ trường",
                    "complete",
                    0.86,
                    ["cutoff", "global", "major", "top5"],
                )
            )

    return items


def qa_cutoff_comparison(cutoff_records: list[dict[str, Any]], records: list[dict[str, Any]]) -> list[QAItem]:
    code_to_name: dict[str, str] = {}
    for rec in records:
        code = compact_text(rec.get("ma-truong")).upper()
        name = compact_text(rec.get("ten-truong"))
        if code and name:
            code_to_name[code] = name

    by_school: dict[str, list[tuple[str, float]]] = {}
    by_major: dict[str, list[tuple[str, float, str]]] = {}
    for row in cutoff_records:
        code = compact_text(row.get("ma-truong")).upper()
        major = compact_text(row.get("ten-nganh"))
        score = safe_float(row.get("diem-chuan"))
        if not code or not major or score is None:
            continue
        school_name = code_to_name.get(code, code)
        by_school.setdefault(code, []).append((major, score))
        by_major.setdefault(major, []).append((school_name, score, code))

    items: list[QAItem] = []

    # So sánh 2 trường theo điểm trung bình
    school_avg: list[tuple[str, str, float]] = []
    for code, pairs in by_school.items():
        vals = [s for _, s in pairs]
        if not vals:
            continue
        school_avg.append((code_to_name.get(code, code), code, sum(vals) / len(vals)))
    school_avg.sort(key=lambda x: x[2], reverse=True)

    for i in range(min(20, max(0, len(school_avg) - 1))):
        s1, c1, a1 = school_avg[i]
        s2, c2, a2 = school_avg[i + 1]
        diff = abs(a1 - a2)
        better = s1 if a1 >= a2 else s2
        answer = (
            f"So sánh mặt bằng điểm chuẩn THPT (trung bình dữ liệu): {s1} ~ {a1:.2f}, {s2} ~ {a2:.2f}. "
            f"Chênh lệch khoảng {diff:.2f} điểm, nhỉnh hơn: {better}."
        )
        for q in variants(
            f"So sánh điểm chuẩn giữa {s1} và {s2}.",
            f"{s1} với {s2} thì trường nào điểm chuẩn cao hơn?",
        ):
            items.append(
                qa_item(
                    q,
                    answer,
                    "cutoff_compare_two_schools",
                    "ALL",
                    "Toàn bộ trường",
                    "partial",
                    0.8,
                    ["cutoff", "compare", "schools"],
                )
            )

    # So sánh 2 ngành trong cùng trường
    for code, pairs in by_school.items():
        if len(pairs) < 2:
            continue
        school_name = code_to_name.get(code, code)
        sorted_pairs = sorted(pairs, key=lambda x: x[1], reverse=True)
        top_major, top_score = sorted_pairs[0]
        low_major, low_score = sorted_pairs[-1]
        answer = (
            f"Tại {school_name}, ngành {top_major} có điểm chuẩn {top_score:g} và ngành {low_major} có điểm chuẩn {low_score:g}. "
            f"Chênh lệch khoảng {abs(top_score - low_score):g} điểm."
        )
        for q in variants(
            f"So sánh điểm chuẩn 2 ngành tại {school_name}.",
            f"Ở {school_name}, ngành nào điểm cao và thấp hơn rõ rệt?",
        ):
            items.append(
                qa_item(
                    q,
                    answer,
                    "cutoff_compare_two_majors_same_school",
                    code,
                    school_name,
                    "complete",
                    0.9,
                    ["cutoff", "compare", "majors", "school"],
                )
            )

    # So sánh cùng 1 ngành giữa 2 trường
    for major, arr in list(by_major.items())[:500]:
        if len(arr) < 2:
            continue
        arr_sorted = sorted(arr, key=lambda x: x[1], reverse=True)
        s1, sc1, _ = arr_sorted[0]
        s2, sc2, _ = arr_sorted[1]
        answer = (
            f"Với ngành {major}, theo dữ liệu hiện có: {s1} lấy {sc1:g}, {s2} lấy {sc2:g}. "
            f"Chênh lệch khoảng {abs(sc1 - sc2):g} điểm."
        )
        for q in variants(
            f"So sánh điểm chuẩn ngành {major} giữa các trường.",
            f"Ngành {major} ở trường nào cao điểm hơn?",
        ):
            items.append(
                qa_item(
                    q,
                    answer,
                    "cutoff_compare_same_major_two_schools",
                    "ALL",
                    "Toàn bộ trường",
                    "complete",
                    0.88,
                    ["cutoff", "compare", "major", "schools"],
                )
            )

    return items


def qa_cutoff_compare_by_subject_group(cutoff_records: list[dict[str, Any]], records: list[dict[str, Any]]) -> list[QAItem]:
    code_to_name: dict[str, str] = {}
    for rec in records:
        code = compact_text(rec.get("ma-truong")).upper()
        name = compact_text(rec.get("ten-truong"))
        if code and name:
            code_to_name[code] = name

    # key: (school_code, major_name) -> list of (to_hop, score)
    group_map: dict[tuple[str, str], list[tuple[str, float]]] = {}
    for row in cutoff_records:
        code = compact_text(row.get("ma-truong")).upper()
        major = compact_text(row.get("ten-nganh"))
        to_hop = compact_text(row.get("to-hop"))
        score = safe_float(row.get("diem-chuan"))
        if not code or not major or not to_hop or score is None:
            continue
        # tách từng tổ hợp trong cùng dòng
        combos = [compact_text(x) for x in re.split(r"\s*,\s*", to_hop) if compact_text(x)]
        if not combos:
            continue
        key = (code, major)
        group_map.setdefault(key, [])
        for cb in combos:
            group_map[key].append((cb, score))

    items: list[QAItem] = []

    # So sánh trong cùng trường + cùng ngành
    for (code, major), arr in list(group_map.items())[:2500]:
        school_name = code_to_name.get(code, code)
        # gộp tổ hợp trùng, lấy max score quan sát được cho tổ hợp
        by_combo: dict[str, float] = {}
        for cb, sc in arr:
            by_combo[cb] = max(by_combo.get(cb, -1.0), sc)
        if len(by_combo) < 2:
            continue

        sorted_combo = sorted(by_combo.items(), key=lambda x: x[1], reverse=True)
        top_cb, top_sc = sorted_combo[0]
        low_cb, low_sc = sorted_combo[-1]
        diff = abs(top_sc - low_sc)

        if diff == 0:
            answer = (
                f"Với ngành {major} tại {school_name}, các tổ hợp đang có cùng mức điểm chuẩn khoảng {top_sc:g}. "
                f"Một số tổ hợp: {topn_with_ellipsis([x[0] for x in sorted_combo], 5)}"
            )
        else:
            answer = (
                f"Với ngành {major} tại {school_name}, tổ hợp {top_cb} có điểm {top_sc:g} cao hơn tổ hợp {low_cb} ({low_sc:g}) "
                f"khoảng {diff:g} điểm."
            )

        for q in variants(
            f"Cùng ngành {major} ở {school_name} thì tổ hợp nào điểm cao hơn?",
            f"So sánh điểm theo tổ hợp của ngành {major} tại {school_name}.",
            f"Ngành {major} ở {school_name}: tổ hợp nào lợi điểm hơn?",
        ):
            items.append(
                qa_item(
                    q,
                    answer,
                    "cutoff_compare_subject_groups_same_major",
                    code,
                    school_name,
                    "complete",
                    0.9,
                    ["cutoff", "compare", "subject_group", "major"],
                )
            )

    # So sánh tổ hợp theo ngành ở quy mô toàn cục
    major_combo_map: dict[str, dict[str, list[float]]] = {}
    for row in cutoff_records:
        major = compact_text(row.get("ten-nganh"))
        to_hop = compact_text(row.get("to-hop"))
        score = safe_float(row.get("diem-chuan"))
        if not major or not to_hop or score is None:
            continue
        combos = [compact_text(x) for x in re.split(r"\s*,\s*", to_hop) if compact_text(x)]
        if not combos:
            continue
        major_combo_map.setdefault(major, {})
        for cb in combos:
            major_combo_map[major].setdefault(cb, []).append(score)

    for major, combo_scores in list(major_combo_map.items())[:500]:
        if len(combo_scores) < 2:
            continue
        avg_combo = [(cb, sum(vals) / len(vals)) for cb, vals in combo_scores.items() if vals]
        if len(avg_combo) < 2:
            continue
        avg_combo.sort(key=lambda x: x[1], reverse=True)
        top_cb, top_avg = avg_combo[0]
        low_cb, low_avg = avg_combo[-1]
        diff = abs(top_avg - low_avg)
        answer = (
            f"Với ngành {major} (tham chiếu dữ liệu hiện có), tổ hợp {top_cb} có mức điểm trung bình khoảng {top_avg:.2f}, "
            f"cao hơn {low_cb} ({low_avg:.2f}) khoảng {diff:.2f} điểm."
        )
        for q in variants(
            f"Cùng ngành {major} thì tổ hợp nào điểm cao hơn?",
            f"Ngành {major}: so sánh điểm theo tổ hợp.",
        ):
            items.append(
                qa_item(
                    q,
                    answer,
                    "cutoff_compare_subject_groups_global",
                    "ALL",
                    "Toàn bộ trường",
                    "partial",
                    0.78,
                    ["cutoff", "compare", "subject_group", "global"],
                )
            )

    return items


def qa_cross_field(record: dict[str, Any], aliases: list[str]) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    intro = preserve_text(record.get("gioi-thieu"))
    plan = preserve_text(record.get("de-an-tuyen-sinh"))
    tuition = preserve_text(record.get("hoc-phi"))
    address = preserve_text(record.get("dia-chi-cu-the"))

    packed = (
        f"Thông tin tổng hợp về {name}:\n"
        f"- Mã trường: {code}\n"
        f"- Địa chỉ: {address or 'chưa có'}\n"
        f"- Giới thiệu: {intro or 'chưa có'}\n"
        f"- Đề án tuyển sinh: {plan or 'chưa có'}\n"
        f"- Học phí: {tuition or 'chưa có'}"
    )

    items: list[QAItem] = []
    for alias in aliases:
        for q in variants(
            f"Tổng hợp thông tin quan trọng của {alias}.",
            f"Cho mình đầy đủ thông tin về {alias} gồm giới thiệu, tuyển sinh, học phí.",
            f"Nếu tư vấn nhanh về {alias} thì cần biết gì?",
            f"{alias} có phù hợp với mình không, cho mình thông tin tổng quan.",
        ):
            items.append(qa_item(q, packed, "school_full_pack", code, name, "complete", 0.85, ["full", "admission", "tuition", "intro"]))
    return items


def qa_program_school_level(
    record: dict[str, Any],
    aliases: list[str],
    cutoff_index: dict[str, list[dict[str, Any]]],
) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    plan = preserve_text(record.get("de-an-tuyen-sinh"))

    programs = extract_program_candidates(plan)
    # Bổ sung ngành từ file điểm chuẩn THPT để tăng độ phủ thực tế
    cutoff_rows = cutoff_index.get(code, [])
    cutoff_programs: list[str] = []
    for row in cutoff_rows:
        p = compact_text(row.get("ten-nganh"))
        if p:
            cutoff_programs.append(p)
    if cutoff_programs:
        merged = programs + cutoff_programs
        seen: set[str] = set()
        programs = []
        for p in merged:
            k = compact_text(p).lower()
            if not k or k in seen:
                continue
            seen.add(k)
            programs.append(compact_text(p))

    items: list[QAItem] = []

    if not programs:
        for alias in aliases:
            items.append(
                qa_item(
                    f"{alias} có những ngành gì?",
                    fallback_missing_message("ngành đào tạo", name),
                    "school_programs_missing",
                    code,
                    name,
                    "missing",
                    0.25,
                    ["program", "school", "missing"],
                )
            )
        return items

    program_text = topn_with_ellipsis(programs, 5)
    answer = f"{name} có các ngành tiêu biểu: {program_text}"
    for alias in aliases:
        for q in variants(
            f"{alias} có những ngành gì?",
            f"Trường {alias} đào tạo ngành nào?",
            f"Danh sách ngành của {alias} là gì?",
        ):
            items.append(
                qa_item(
                    q,
                    answer,
                    "school_programs_top5",
                    code,
                    name,
                    "complete",
                    0.82,
                    ["program", "school", "top5"],
                )
            )
    return items


def qa_program_global(records: list[dict[str, Any]]) -> list[QAItem]:
    program_to_schools: dict[str, list[str]] = {}

    for rec in records:
        school_name = compact_text(rec.get("ten-truong"))
        if not school_name:
            continue
        plan = preserve_text(rec.get("de-an-tuyen-sinh"))
        programs = extract_program_candidates(plan)
        for p in programs:
            key = compact_text(p)
            if not key:
                continue
            program_to_schools.setdefault(key, [])
            if school_name not in program_to_schools[key]:
                program_to_schools[key].append(school_name)

    items: list[QAItem] = []
    for program_name, schools in program_to_schools.items():
        if len(schools) < 2:
            continue
        school_text = topn_with_ellipsis(schools, 5)
        answer = f"Một số trường đào tạo ngành {program_name}: {school_text}"
        for q in variants(
            f"Trường nào đào tạo ngành {program_name}?",
            f"Ngành {program_name} học ở trường nào?",
            f"Gợi ý trường đào tạo {program_name}.",
        ):
            items.append(
                qa_item(
                    q,
                    answer,
                    "program_to_schools_top5",
                    "ALL",
                    "Toàn bộ trường",
                    "complete",
                    0.8,
                    ["program", "global", "top5"],
                )
            )
    return items


def generate_for_school(record: dict[str, Any], cutoff_index: dict[str, list[dict[str, Any]]]) -> list[QAItem]:
    code = compact_text(record.get("ma-truong")).upper() or "UNK"
    name = compact_text(record.get("ten-truong")) or "Trường chưa rõ tên"
    short_name = compact_text(record.get("ten-viet-tat"))
    aliases = school_aliases(name, short_name, code)

    items: list[QAItem] = []
    items.extend(qa_profile(record, aliases))
    items.extend(qa_intro(record, aliases))
    items.extend(qa_admission(record, aliases))
    items.extend(qa_cutoff_school_level(record, aliases, cutoff_index))
    items.extend(qa_tuition(record, aliases))
    items.extend(qa_program_school_level(record, aliases, cutoff_index))
    items.extend(qa_cross_field(record, aliases))
    return unique_qa(items)


def load_records(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("Input JSON phải là mảng các trường")
    return [x for x in raw if isinstance(x, dict)]


def write_jsonl(path: Path, items: list[QAItem]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(asdict(item), ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate exhaustive Q&A dataset from truong.json")
    parser.add_argument("--input", default="../truong.json", help="Path to truong.json")
    parser.add_argument("--cutoff-input", default="../data/diem_chuan_THPT.json", help="Path to diem_chuan_THPT.json")
    parser.add_argument("--output", default="./storage/qa_dataset.jsonl", help="Output JSONL path")
    parser.add_argument("--hard-negative-min-ratio", type=float, default=0.20, help="Minimum desired hard-negative ratio")
    parser.add_argument("--hard-negative-max-ratio", type=float, default=0.30, help="Maximum desired hard-negative ratio")
    parser.add_argument("--balance-seed", type=int, default=42, help="Random seed for hard-negative balancing")
    args = parser.parse_args()

    records = load_records(Path(args.input))
    cutoff_records = load_cutoff_records(Path(args.cutoff_input))
    cutoff_index = build_cutoff_index(cutoff_records)
    indexed = make_record_index(records)
    all_items: list[QAItem] = []
    for i, rec in enumerate(records, start=1):
        school_items = generate_for_school(rec, cutoff_index)
        all_items.extend(school_items)
        if i % 20 == 0:
            print(f"[gen-qa] processed {i}/{len(records)} schools, total QA={len(all_items)}")

    global_program_items = qa_program_global(records)
    all_items.extend(global_program_items)
    all_items.extend(qa_global_province(indexed))
    all_items.extend(qa_global_tuition(indexed))
    all_items.extend(qa_global_method_keywords(indexed))
    all_items.extend(qa_global_program_keyword(indexed))
    all_items.extend(qa_global_province_program(indexed))
    all_items.extend(qa_cutoff_global(cutoff_records, records))
    all_items.extend(qa_cutoff_comparison(cutoff_records, records))
    all_items.extend(qa_cutoff_compare_by_subject_group(cutoff_records, records))
    all_items.extend(qa_global_missing_negative(indexed))
    all_items.extend(qa_hard_negative(indexed))

    all_items = unique_qa(all_items)
    before_total = len(all_items)
    before_neg = len([x for x in all_items if is_hard_negative(x)])
    all_items = balance_hard_negative_ratio(
        all_items,
        min_ratio=args.hard_negative_min_ratio,
        max_ratio=args.hard_negative_max_ratio,
        seed=args.balance_seed,
    )
    all_items = unique_qa(all_items)
    after_total = len(all_items)
    after_neg = len([x for x in all_items if is_hard_negative(x)])
    output = Path(args.output)
    write_jsonl(output, all_items)
    print(f"Generated {len(all_items)} QA pairs from {len(records)} schools")
    if before_total > 0:
        print(
            "Hard-negative ratio: "
            f"before={before_neg}/{before_total} ({(before_neg / before_total):.2%}), "
            f"after={after_neg}/{after_total} ({(after_neg / after_total if after_total else 0):.2%})"
        )
    print(f"Output: {output.resolve()}")


if __name__ == "__main__":
    main()
