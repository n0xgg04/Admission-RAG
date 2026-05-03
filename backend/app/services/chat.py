from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
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
    s = s.replace("đ", "d").replace("Đ", "D")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


_school_rows_cache: list[dict] | None = None


def _load_school_rows() -> list[dict]:
    global _school_rows_cache
    if _school_rows_cache is not None:
        return _school_rows_cache

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
        if isinstance(raw, list):
            _school_rows_cache = [r for r in raw if isinstance(r, dict)]
            return _school_rows_cache

    _school_rows_cache = []
    return _school_rows_cache


def _resolve_university_code_loose(query: str) -> str | None:
    qn = _normalize_text(query)
    if not qn:
        return None

    tokens = {t for t in qn.split() if len(t) >= 2}
    stop = {
        "truong",
        "dai",
        "hoc",
        "vien",
        "cua",
        "la",
        "bao",
        "nhieu",
        "diem",
        "chuan",
        "cong",
        "nghe",
        "thong",
        "tin",
    }
    tokens = {t for t in tokens if t not in stop}

    # 1) Alias phrase match first (deterministic, stronger than fuzzy score)
    phrase_to_code: dict[str, str] = {}
    phrase_collisions: set[str] = set()

    def add_phrase(phrase: str, code: str) -> None:
        p = _normalize_text(phrase)
        if len(p.split()) < 2:
            return
        old = phrase_to_code.get(p)
        if old is None:
            phrase_to_code[p] = code
            return
        if old != code:
            phrase_collisions.add(p)
    for r in _load_school_rows():
        code = str(r.get("ma-truong") or "").strip().upper()
        name = str(r.get("ten-truong") or "").strip()
        short = str(r.get("ten-viet-tat") or "").strip()
        if not code:
            continue

        name_norm = _normalize_text(name)
        short_norm = _normalize_text(short)
        if name_norm:
            add_phrase(name_norm, code)

            # remove common prefixes to build natural alias phrase
            compact = name_norm
            for prefix in ["truong dai hoc ", "dai hoc ", "hoc vien ", "truong "]:
                if compact.startswith(prefix):
                    compact = compact[len(prefix) :].strip()
            if compact:
                add_phrase(compact, code)
                toks = compact.split()
                # Add suffix phrases to catch natural mentions like
                # "trường bưu chính viễn thông" without full official name.
                for n in range(2, min(5, len(toks)) + 1):
                    add_phrase(" ".join(toks[-n:]), code)

        if short_norm:
            add_phrase(short_norm, code)

    for p in phrase_collisions:
        phrase_to_code.pop(p, None)

    best_phrase_code = None
    best_phrase_len = 0
    for phrase, code in phrase_to_code.items():
        if not phrase:
            continue
        if re.search(rf"\b{re.escape(phrase)}\b", qn):
            plen = len(phrase.split())
            if plen > best_phrase_len:
                best_phrase_len = plen
                best_phrase_code = code
    if best_phrase_code and best_phrase_len >= 2:
        return best_phrase_code

    best_code = None
    best_score = 0.0
    for r in _load_school_rows():
        code = str(r.get("ma-truong") or "").strip().upper()
        name = str(r.get("ten-truong") or "").strip()
        short = str(r.get("ten-viet-tat") or "").strip()
        if not code:
            continue

        name_norm = _normalize_text(name)
        short_norm = _normalize_text(short)
        name_tokens = {t for t in name_norm.split() if len(t) >= 2 and t not in stop}

        overlap = len(tokens & name_tokens)
        overlap_score = overlap + overlap / max(1, len(name_tokens)) if name_tokens else 0.0
        sim_name = SequenceMatcher(None, qn, name_norm).ratio() if name_norm else 0.0
        sim_short = SequenceMatcher(None, qn, short_norm).ratio() if short_norm else 0.0
        score = max(overlap_score, 1.6 * max(sim_name, sim_short))

        if score > best_score:
            best_score = score
            best_code = code

    return best_code if best_score >= 1.15 else None


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
        resolved_code_main = retrieval_service._resolve_university_code(query, university_code)
        resolved_code_loose = _resolve_university_code_loose(query)
        resolved_code = resolved_code_main or resolved_code_loose

        hits = retrieval_service.search(
            query=query,
            university_code=resolved_code,
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
