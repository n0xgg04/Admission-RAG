from __future__ import annotations

import json
import re
import unicodedata
from collections import deque
from pathlib import Path
from threading import Lock
from uuid import uuid4

from app.core.config import settings
from app.models.chat import ChatResponse
from app.services.llm import openrouter_service
from app.services.retrieval import retrieval_service


def _build_fallback_hint(university_code: str | None) -> str:
    school = university_code.upper() if university_code else "trường bạn đang hỏi"
    return (
        f"Nếu thông tin chưa đủ cho {school}, hãy nói tự nhiên rằng hiện chưa có đủ thông tin "
        "để trả lời chính xác. "
        "Thông tin chỉ áp dụng cho mùa tuyển sinh 2025. Không bịa số liệu."
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
    return "Lưu ý: thông tin hiện có chỉ áp dụng cho tuyển sinh năm 2025."


def _normalize_text(text: str) -> str:
    s = unicodedata.normalize("NFD", text or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


_cutoff_rows_cache: list[dict] | None = None


def _load_cutoff_rows() -> list[dict]:
    global _cutoff_rows_cache
    if _cutoff_rows_cache is not None:
        return _cutoff_rows_cache

    candidates = [
        Path(settings.data_dir) / "diem_chuan_THPT.json",
        Path("data") / "diem_chuan_THPT.json",
        Path("../data") / "diem_chuan_THPT.json",
    ]
    for p in candidates:
        if not p.exists():
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(raw, list):
            _cutoff_rows_cache = [r for r in raw if isinstance(r, dict)]
            return _cutoff_rows_cache

    _cutoff_rows_cache = []
    return _cutoff_rows_cache


def _is_cutoff_query(query: str) -> bool:
    qn = _normalize_text(query)
    return "diem chuan" in qn or "lay bao nhieu diem" in qn


def _query_tokens(query: str) -> set[str]:
    stop = {
        "diem",
        "chuan",
        "nganh",
        "truong",
        "dai",
        "hoc",
        "hoc",
        "vien",
        "bao",
        "nhieu",
        "la",
        "nam",
        "tuyen",
        "sinh",
        "tai",
        "cua",
        "va",
    }
    return {t for t in _normalize_text(query).split() if len(t) >= 2 and t not in stop}


def _lookup_cutoff_from_clean_data(query: str, university_code: str | None) -> str | None:
    if not university_code or not _is_cutoff_query(query):
        return None

    rows = [
        r
        for r in _load_cutoff_rows()
        if str(r.get("ma-truong") or "").strip().upper() == university_code.upper()
    ]
    if not rows:
        return None

    q_tokens = _query_tokens(query)
    if not q_tokens:
        return None

    scored: list[tuple[float, dict]] = []
    for row in rows:
        major = str(row.get("ten-nganh") or "")
        major_tokens = {t for t in _normalize_text(major).split() if len(t) >= 2}
        if not major_tokens:
            continue
        overlap = len(q_tokens & major_tokens)
        if overlap <= 0:
            continue
        score = overlap + overlap / max(1, len(major_tokens))
        scored.append((score, row))

    if not scored:
        return None

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [row for _, row in scored[:5]]

    lines = []
    for row in top:
        major = str(row.get("ten-nganh") or "").strip()
        major_code = str(row.get("ma-nganh") or "").strip()
        combo = str(row.get("to-hop") or "").strip()
        score = row.get("diem-chuan")
        note = str(row.get("ghi-chu") or "").strip()
        line = f"- {major}"
        if major_code:
            line += f" ({major_code})"
        line += f": {score}"
        if combo:
            line += f" | Tổ hợp: {combo}"
        if note:
            line += f" | Ghi chú: {note}"
        lines.append(line)

    return "Mình có thông tin điểm chuẩn gần nhất như sau:\n" + "\n".join(lines)


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
    recent_user_queries: list[str] | None = None,
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
                "Xin lỗi, hiện mình chưa có đủ thông tin để trả lời chính xác câu hỏi này.",
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
                "Xin lỗi, hiện mình chưa có đủ thông tin để trả lời chính xác câu hỏi này.",
                False,
                "empty-hit-fallback",
            )

    fallback_hint = _build_fallback_hint(university_code)
    try:
        answer = openrouter_service.generate(
            query=query,
            context_blocks=lines,
            recent_user_queries=recent_user_queries,
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
    def __init__(self) -> None:
        self._sessions: dict[str, deque[str]] = {}
        self._lock = Lock()

    def _ensure_session_id(self, session_id: str | None) -> str:
        if session_id and session_id.strip():
            return session_id.strip()
        return f"sess-{uuid4().hex[:12]}"

    def _get_recent_queries(self, session_id: str) -> list[str]:
        with self._lock:
            turns = self._sessions.get(session_id)
            if not turns:
                return []
            return list(turns)

    def _push_query(self, session_id: str, query: str) -> None:
        with self._lock:
            turns = self._sessions.get(session_id)
            if turns is None:
                turns = deque(maxlen=5)
                self._sessions[session_id] = turns
            turns.append(query)

    def answer(
        self,
        query: str,
        session_id: str | None = None,
        university_code: str | None = None,
    ) -> ChatResponse:
        session = self._ensure_session_id(session_id)
        recent_queries = self._get_recent_queries(session)
        resolved_code = retrieval_service._resolve_university_code(query, university_code)
        hits = retrieval_service.search(
            query=query,
            university_code=resolved_code,
        )

        direct_cutoff_answer = _lookup_cutoff_from_clean_data(query, resolved_code)
        if direct_cutoff_answer and len(hits) <= 1:
            self._push_query(session, query)
            return ChatResponse(
                answer=direct_cutoff_answer,
                session_id=session,
                used_chunks=len(hits),
                data_sufficient=True,
                note="direct-cutoff-clean-data",
            )

        answer, sufficient, note = _render_answer_from_hits(
            query=query,
            hits=hits,
            university_code=resolved_code,
            recent_user_queries=recent_queries,
        )
        self._push_query(session, query)

        return ChatResponse(
            answer=answer,
            session_id=session,
            used_chunks=len(hits),
            data_sufficient=sufficient,
            note=note,
        )


chat_service = ChatService()
