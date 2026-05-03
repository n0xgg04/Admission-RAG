from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.services.retrieval import retrieval_service  # noqa: E402


@dataclass
class TestCase:
    query: str
    expected_code: str | None = None
    expected_intents: list[str] | None = None
    note: str | None = None


DEFAULT_CASES: list[TestCase] = [
    TestCase("trường bưu chính viễn thông ở đâu?", expected_code="BVH", expected_intents=["fact_address", "university_profile"]),
    TestCase("trường bưu chính viễn thông có những ngành gì?", expected_code="BVH", expected_intents=["school_programs_top5"]),
    TestCase("mã trường của đại học kinh tế quốc dân là gì?", expected_code="KHA", expected_intents=["fact_code", "university_profile"]),
    TestCase("đại học bách khoa hà nội viết tắt là gì?", expected_code="BKA", expected_intents=["fact_short_name", "university_profile"]),
    TestCase("học viện ngân hàng thuộc tỉnh thành nào?", expected_code="NHH", expected_intents=["fact_province", "university_profile"]),
    TestCase("điểm chuẩn ngành marketing của neu là bao nhiêu?", expected_code="KHA", expected_intents=["cutoff_major_detail", "cutoff_school_top5"]),
    TestCase("trường nào nhận ielts?", expected_intents=["global_method_keyword"]),
    TestCase("trường nào học phí dưới 30 triệu?", expected_intents=["global_tuition_under_threshold"]),
    TestCase("muốn học it ở hà nội thì chọn trường nào?", expected_intents=["global_recommend_by_province_program"]),
    TestCase("trường nào đào tạo ngành y khoa?", expected_intents=["global_program_keyword", "program_to_schools_top5"]),
    TestCase("so sánh điểm chuẩn giữa neu và hust", expected_intents=["cutoff_compare_two_schools"]),
    TestCase("cùng ngành marketing thì tổ hợp nào điểm cao hơn?", expected_intents=["cutoff_compare_subject_groups_global"]),
    TestCase("học phí của ptit là bao nhiêu?", expected_code="BVH", expected_intents=["tuition_full", "tuition_detail"]),
    TestCase("đề án tuyển sinh của ftu như thế nào?", expected_code="NTH", expected_intents=["admission_full"]),
    TestCase("ftu có xét học bạ không?", expected_code="NTH", expected_intents=["negative_hoc_ba_not_found", "admission_method_detail"]),
]


def _load_cases(path: Path | None) -> list[TestCase]:
    if path is None:
        return DEFAULT_CASES
    raw = json.loads(path.read_text(encoding="utf-8"))
    out: list[TestCase] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        out.append(
            TestCase(
                query=str(row.get("query") or "").strip(),
                expected_code=(str(row.get("expected_code")).strip().upper() if row.get("expected_code") else None),
                expected_intents=list(row.get("expected_intents") or []),
                note=str(row.get("note") or "") or None,
            )
        )
    return [c for c in out if c.query]


def _hit_passes(hit: Any, case: TestCase) -> bool:
    md = getattr(hit, "metadata", {}) or {}
    code = str(md.get("university_code") or "").upper()
    intent = str(md.get("intent") or "")

    code_ok = True
    intent_ok = True
    if case.expected_code:
        code_ok = code == case.expected_code
    if case.expected_intents:
        intent_ok = intent in set(case.expected_intents)
    return code_ok and intent_ok


def _summarize_hit(hit: Any) -> str:
    md = getattr(hit, "metadata", {}) or {}
    code = md.get("university_code", "")
    intent = md.get("intent", "")
    score = getattr(hit, "score", 0.0)
    text = getattr(hit, "text", "")
    preview = " ".join(str(text).split())[:120]
    return f"score={score:.3f} code={code} intent={intent} text={preview}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate vector retrieval quality on predefined queries")
    parser.add_argument("--top-k", type=int, default=8, help="Top K retrieval results")
    parser.add_argument("--cases", default=None, help="Optional JSON file of test cases")
    parser.add_argument("--show-hits", type=int, default=3, help="How many hits to print per query")
    args = parser.parse_args()

    case_path = Path(args.cases) if args.cases else None
    cases = _load_cases(case_path)
    if not cases:
        raise SystemExit("No test cases provided")

    passed = 0
    for i, case in enumerate(cases, start=1):
        hits = retrieval_service.search(query=case.query, top_k=args.top_k)
        ok = any(_hit_passes(h, case) for h in hits)
        if ok:
            passed += 1
        status = "PASS" if ok else "FAIL"
        print(f"\n[{i:02d}] {status} :: {case.query}")
        if case.expected_code or case.expected_intents:
            print(
                " expected:",
                {
                    "expected_code": case.expected_code,
                    "expected_intents": case.expected_intents or [],
                },
            )
        for h in hits[: args.show_hits]:
            print("  -", _summarize_hit(h))

    total = len(cases)
    acc = passed / total if total else 0.0
    print("\n=== SUMMARY ===")
    print(f"Passed: {passed}/{total}")
    print(f"Accuracy: {acc:.2%}")


if __name__ == "__main__":
    main()
