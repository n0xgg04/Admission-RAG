from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from app.core.config import settings
from app.models.chat import ChatResponse
from app.services.llm import openrouter_service
from app.services.retrieval import retrieval_service


def _build_fallback_hint(university_code: str | None) -> str:
    school = university_code.upper() if university_code else "trường bạn đang hỏi"
    return (
        f"Nếu dữ liệu chưa đủ cho {school}, hãy trả lời lịch sự rằng hiện chưa có đủ thông tin "
        "trong bộ dữ liệu hiện tại. Dữ liệu chỉ áp dụng cho mùa tuyển sinh 2025. Không bịa số liệu."
    )


def _extract_years(query: str) -> list[int]:
    years: list[int] = []
    for m in re.findall(r"\b(19\d{2}|20\d{2})\b", query):
        y = int(m)
        if y not in years:
            years.append(y)
    return years


def _year_scope_notice(query: str) -> str | None:
    years = _extract_years(query)
    if not years:
        return None
    if all(y == 2025 for y in years):
        return None
    return "Lưu ý: bộ dữ liệu hiện tại chỉ bao phủ thông tin tuyển sinh năm 2025."


def _normalize_text(text: str) -> str:
    s = unicodedata.normalize("NFD", text or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _load_school_records() -> list[dict[str, str]]:
    candidates = [
        Path(settings.data_dir) / "truong.json",
        Path("data") / "truong.json",
        Path("../data") / "truong.json",
    ]
    for p in candidates:
        if not p.exists():
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(raw, list):
            continue
        rows: list[dict[str, str]] = []
        for r in raw:
            if not isinstance(r, dict):
                continue
            rows.append(
                {
                    "code": str(r.get("ma-truong") or "").strip().upper(),
                    "name": str(r.get("ten-truong") or "").strip(),
                    "short": str(r.get("ten-viet-tat") or "").strip(),
                }
            )
        return rows
    return []


def _detect_school_code_from_query(query: str) -> str | None:
    qn = _normalize_text(query)
    if not qn:
        return None
    schools = _load_school_records()
    if not schools:
        return None

    stop = {"truong", "dai", "hoc", "hoc", "vien", "cong", "nghe", "va", "tai", "tp"}
    q_tokens = {t for t in qn.split() if len(t) >= 2 and t not in stop}

    best_code = None
    best_score = 0.0
    for s in schools:
        code = s.get("code", "")
        name = s.get("name", "")
        short = s.get("short", "")
        if not code:
            continue

        exact = 0.0
        for k in [code, short, name]:
            nk = _normalize_text(k)
            if nk and nk in qn:
                exact = max(exact, 10.0 + len(nk) / 100.0)

        nt = {_normalize_text(t) for t in name.split()}
        nt = {t for t in nt if t and t not in stop}
        overlap = len(q_tokens & nt)
        token_score = overlap + (overlap / max(1, len(nt)))
        score = max(exact, token_score)
        if score > best_score:
            best_score = score
            best_code = code

    if best_score >= 2.0:
        return best_code
    return None


def _soft_insufficient_answer(query: str, university_code: str | None) -> str:
    hint = _build_fallback_hint(university_code)
    return openrouter_service.generate(
        query=query, context_blocks=["Không có ngữ cảnh phù hợp."], fallback_hint=hint
    )


def _render_answer_from_hits(
    query: str,
    hits: list,
    university_code: str | None,
) -> tuple[str, bool, str | None]:
    year_notice = _year_scope_notice(query)

    if not hits:
        try:
            answer = _soft_insufficient_answer(query, university_code)
            if year_notice:
                answer = f"{year_notice}\n\n{answer}"
            return (answer, False, "no-hit")
        except Exception:
            return (
                "Xin lỗi, hiện chưa đủ dữ liệu trong bộ crawl để trả lời chính xác câu hỏi này.",
                False,
                "no-hit-fallback",
            )

    lines: list[str] = []
    for hit in hits[:3]:
        text = " ".join(hit.text.split())
        if text:
            lines.append(text[:700])

    if not lines:
        try:
            answer = _soft_insufficient_answer(query, university_code)
            if year_notice:
                answer = f"{year_notice}\n\n{answer}"
            return (answer, False, "empty-hit")
        except Exception:
            return (
                "Xin lỗi, hiện chưa đủ dữ liệu trong bộ crawl để trả lời chính xác câu hỏi này.",
                False,
                "empty-hit-fallback",
            )

    fallback_hint = _build_fallback_hint(university_code)
    try:
        answer = openrouter_service.generate(
            query=query,
            context_blocks=lines,
            fallback_hint=fallback_hint,
        )
    except Exception:
        answer = "\n\n".join(lines)

    if year_notice:
        answer = f"{year_notice}\n\n{answer}"

    if "không đủ dữ liệu" in answer.lower():
        return (answer, False, "insufficient-context")
    return (answer, True, None)


class ChatService:
    def answer(
        self,
        query: str,
        session_id: str | None = None,
        university_code: str | None = None,
    ) -> ChatResponse:
        resolved_code = university_code or _detect_school_code_from_query(query)
        hits = retrieval_service.search(
            query=query,
            university_code=resolved_code,
        )
        answer, sufficient, note = _render_answer_from_hits(
            query=query,
            hits=hits,
            university_code=resolved_code,
        )

        return ChatResponse(
            answer=answer,
            session_id=session_id,
            used_chunks=len(hits),
            data_sufficient=sufficient,
            note=note,
        )


chat_service = ChatService()
