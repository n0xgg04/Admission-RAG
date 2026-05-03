from __future__ import annotations

import json
import math
import logging
import re
import unicodedata
from difflib import SequenceMatcher, get_close_matches
from collections import Counter
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.search import SearchHit
from app.services.embedding import embedding_service
from app.services.store import vector_store

logger = logging.getLogger(__name__)


def _first_row(value: Any) -> list[Any]:
    if not isinstance(value, list) or not value:
        return []
    first = value[0]
    return first if isinstance(first, list) else []


def _metadata_to_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    return {}


class RetrievalService:
    _alias_cache: dict[str, str] | None = None
    _vocab_cache: set[str] | None = None

    @staticmethod
    def _norm(text: str) -> str:
        s = unicodedata.normalize("NFD", text or "")
        s = s.replace("đ", "d").replace("Đ", "D")
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        s = s.lower()
        s = re.sub(r"[^a-z0-9\s]", " ", s)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    @staticmethod
    def _tokens(text: str) -> list[str]:
        stop = {
            "truong",
            "dai",
            "hoc",
            "vien",
            "va",
            "tai",
            "la",
            "bao",
            "nhieu",
            "nam",
            "tuyen",
            "sinh",
        }
        return [t for t in RetrievalService._norm(text).split() if len(t) >= 2 and t not in stop]

    @classmethod
    def _get_vocab(cls) -> set[str]:
        if cls._vocab_cache is not None:
            return cls._vocab_cache

        vocab: set[str] = set()
        for s in cls._load_school_records():
            for field in [s.get("code", ""), s.get("short", ""), s.get("name", "")]:
                for tok in cls._norm(str(field)).split():
                    if len(tok) >= 3:
                        vocab.add(tok)

        for r in cls._load_cutoff_rows():
            for field in [r.get("ten-nganh", ""), r.get("ma-nganh", ""), r.get("to-hop", "")]:
                for tok in cls._norm(str(field)).split():
                    if len(tok) >= 3:
                        vocab.add(tok)

        cls._vocab_cache = vocab
        return vocab

    @classmethod
    def _fuzzy_normalize_query(cls, query: str) -> str:
        qn = cls._norm(query)
        if not qn:
            return ""

        vocab = cls._get_vocab()
        if not vocab:
            return qn

        fixed: list[str] = []
        for tok in qn.split():
            if len(tok) < 3 or tok in vocab:
                fixed.append(tok)
                continue
            # Conservative fuzzy correction for minor typos.
            candidates = get_close_matches(tok, vocab, n=1, cutoff=0.86)
            fixed.append(candidates[0] if candidates else tok)
        return " ".join(fixed)

    @classmethod
    def _apply_aliases(cls, normalized_query: str) -> str:
        aliases = cls._get_aliases()
        tokens = normalized_query.split()
        expanded: list[str] = []
        for t in tokens:
            repl = aliases.get(t)
            if repl:
                expanded.extend(repl.split())
            else:
                expanded.append(t)
        return re.sub(r"\s+", " ", " ".join(expanded)).strip()

    @classmethod
    def _expand_query_variants(cls, query: str) -> list[str]:
        raw = " ".join((query or "").split()).strip()
        normalized = cls._norm(raw)
        fuzzy_normalized = cls._fuzzy_normalize_query(raw)
        alias_expanded = cls._apply_aliases(normalized) if normalized else ""
        alias_expanded_fuzzy = cls._apply_aliases(fuzzy_normalized) if fuzzy_normalized else ""

        variants: list[str] = []
        for candidate in [raw, normalized, fuzzy_normalized, alias_expanded, alias_expanded_fuzzy]:
            c = " ".join((candidate or "").split()).strip()
            if c and c not in variants:
                variants.append(c)

        return variants[:5]

    @staticmethod
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

    @staticmethod
    def _load_cutoff_rows() -> list[dict[str, Any]]:
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
                return [r for r in raw if isinstance(r, dict)]
        return []

    @staticmethod
    def _clean_alias_tokens(text: str) -> list[str]:
        stop = {"truong", "dai", "hoc", "vien", "va", "tai", "tp", "phuong", "quan"}
        return [t for t in RetrievalService._norm(text).split() if len(t) >= 2 and t not in stop]

    @classmethod
    def _build_dynamic_aliases(cls) -> dict[str, str]:
        alias_map: dict[str, str] = {}
        collisions: set[str] = set()

        def put(alias: str, expansion: str) -> None:
            a = cls._norm(alias)
            e = cls._norm(expansion)
            if len(a) < 3 or not e:
                return
            old = alias_map.get(a)
            if old is None:
                alias_map[a] = e
            elif old != e:
                collisions.add(a)

        for s in cls._load_school_records():
            code = str(s.get("code") or "").strip()
            short = str(s.get("short") or "").strip()
            name = str(s.get("name") or "").strip()
            name_norm = cls._norm(name)
            if not name_norm:
                continue

            put(code, name)
            put(short, name)
            toks = cls._clean_alias_tokens(name)
            if len(toks) >= 2:
                put("".join(tok[0] for tok in toks), name)
                put(" ".join(toks[-2:]), name)
            if len(toks) >= 3:
                put(" ".join(toks[-3:]), name)

        for r in cls._load_cutoff_rows():
            major = str(r.get("ten-nganh") or "").strip()
            if not major:
                continue
            toks = cls._clean_alias_tokens(major)
            if len(toks) >= 2:
                put("".join(tok[0] for tok in toks), major)

        for a in collisions:
            alias_map.pop(a, None)

        return alias_map

    @classmethod
    def _get_aliases(cls) -> dict[str, str]:
        if cls._alias_cache is None:
            cls._alias_cache = cls._build_dynamic_aliases()
        return cls._alias_cache

    def _resolve_university_code(self, query: str, explicit_code: str | None) -> str | None:
        if explicit_code:
            return explicit_code.upper()

        qn = self._fuzzy_normalize_query(query)
        if not qn:
            return None

        qt = set(self._tokens(query))
        best_code = None
        best_score = 0.0
        for s in self._load_school_records():
            code = s.get("code", "")
            name = s.get("name", "")
            short = s.get("short", "")
            if not code:
                continue

            exact = 0.0
            for k in [code, short, name]:
                nk = self._norm(k)
                if nk and nk in qn:
                    exact = max(exact, 10.0 + len(nk) / 100.0)

            nt = set(self._tokens(name))
            overlap = len(qt & nt)
            token_score = overlap + overlap / max(1, len(nt))
            score = max(exact, token_score)
            if score > best_score:
                best_score = score
                best_code = code

        if best_score >= 2.0:
            return best_code

        # Fuzzy fallback: nearest school name by normalized similarity.
        best_sim = 0.0
        best_sim_code = None
        for s in self._load_school_records():
            code = s.get("code", "")
            name = self._norm(s.get("name", ""))
            short = self._norm(s.get("short", ""))
            if not code:
                continue
            sim_name = SequenceMatcher(None, qn, name).ratio() if name else 0.0
            sim_short = SequenceMatcher(None, qn, short).ratio() if short else 0.0
            sim = max(sim_name, sim_short)
            if sim > best_sim:
                best_sim = sim
                best_sim_code = code

        return best_sim_code if best_sim >= 0.62 else None

    @staticmethod
    def _where_filter(
        university_code: str | None,
        method_id: str | None,
        program_code: str | None,
        program_type: str | None,
    ) -> dict | None:
        clauses = [{"chunk_type": "qa_pair"}]
        if university_code:
            clauses.append({"university_code": university_code.upper()})
        if method_id:
            clauses.append({"method_id": method_id})
        if program_code:
            clauses.append({"program_code": program_code})
        if program_type:
            clauses.append({"program_type": program_type})

        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    @staticmethod
    def _bm25_score(query: str, docs: list[str]) -> list[float]:
        q_tokens = RetrievalService._tokens(query)
        if not q_tokens or not docs:
            return [0.0 for _ in docs]

        doc_tokens = [RetrievalService._tokens(d) for d in docs]
        avgdl = sum(len(t) for t in doc_tokens) / max(1, len(doc_tokens))
        df = Counter()
        for toks in doc_tokens:
            df.update(set(toks))

        N = len(docs)
        k1 = 1.5
        b = 0.75
        scores: list[float] = []
        for toks in doc_tokens:
            tf = Counter(toks)
            dl = len(toks)
            s = 0.0
            for term in q_tokens:
                if term not in tf:
                    continue
                idf = math.log(1 + (N - df.get(term, 0) + 0.5) / (df.get(term, 0) + 0.5))
                num = tf[term] * (k1 + 1)
                den = tf[term] + k1 * (1 - b + b * dl / max(1e-9, avgdl))
                s += idf * (num / den)
            scores.append(s)

        mx = max(scores) if scores else 0.0
        if mx <= 0:
            return [0.0 for _ in scores]
        return [s / mx for s in scores]

    @staticmethod
    def _is_fact_query(query: str) -> bool:
        q = RetrievalService._norm(query)
        markers = [
            "diem chuan",
            "diem nganh",
            "ma nganh",
            "to hop",
            "hoc phi",
            "chi phi",
            "phuong thuc",
            "xet tuyen",
            "o dau",
            "dia chi",
            "ma truong",
        ]
        return any(m in q for m in markers)

    def search(
        self,
        query: str,
        top_k: int | None = None,
        university_code: str | None = None,
        method_id: str | None = None,
        program_code: str | None = None,
        program_type: str | None = None,
    ) -> list[SearchHit]:
        k = top_k or settings.top_k
        candidate_k = max(settings.retrieval_candidate_k, k)

        resolved_code = self._resolve_university_code(query, university_code)
        where = self._where_filter(resolved_code, method_id, program_code, program_type)

        collection = vector_store.get_collection()
        variants = self._expand_query_variants(query)
        merged: dict[str, SearchHit] = {}

        for v_idx, qv in enumerate(variants):
            query_vector = embedding_service.embed_texts([qv])[0]
            result = collection.query(query_embeddings=[query_vector], n_results=candidate_k, where=where)

            ids = _first_row(result.get("ids"))
            docs = _first_row(result.get("documents"))
            metas = _first_row(result.get("metadatas"))
            distances = _first_row(result.get("distances"))

            variant_weight = 1.0 - 0.08 * v_idx
            for idx, chunk_id in enumerate(ids):
                distance = distances[idx] if idx < len(distances) else 1.0
                vector_score = max(0.0, 1.0 - float(distance)) * variant_weight
                hit = SearchHit(
                    chunk_id=chunk_id,
                    score=vector_score,
                    text=docs[idx] if idx < len(docs) else "",
                    metadata=_metadata_to_dict(metas[idx]) if idx < len(metas) else {},
                )

                old = merged.get(chunk_id)
                if old is None or hit.score > old.score:
                    merged[chunk_id] = hit

        hits = list(merged.values())

        if not hits:
            return []

        # Prefer QA-pair text as display context for question-only chunks.
        pair_map: dict[str, str] = {}
        for h in hits:
            gid = str(h.metadata.get("qa_group_id") or "")
            ctype = str(h.metadata.get("chunk_type") or "")
            if gid and ctype == "qa_pair" and h.text:
                pair_map[gid] = h.text
        for h in hits:
            gid = str(h.metadata.get("qa_group_id") or "")
            ctype = str(h.metadata.get("chunk_type") or "")
            if gid and ctype == "qa_question" and gid in pair_map:
                h.text = pair_map[gid]

        # Merge per QA group, keep best hit.
        grouped: dict[str, SearchHit] = {}
        for h in hits:
            gid = str(h.metadata.get("qa_group_id") or "")
            key = gid if gid else h.chunk_id
            old = grouped.get(key)
            if old is None or h.score > old.score:
                grouped[key] = h
        hits = list(grouped.values())

        bm25_scores = self._bm25_score(query, [h.text for h in hits])
        fact_query = self._is_fact_query(query)
        w_vec, w_bm25 = (0.55, 0.45) if fact_query else (0.7, 0.3)
        for h, b in zip(hits, bm25_scores, strict=False):
            h.score = min(1.0, w_vec * h.score + w_bm25 * b)

        hits.sort(key=lambda h: h.score, reverse=True)

        # Scientific debug: top-20 retrieval trace.
        for i, h in enumerate(hits[:20], start=1):
            preview = " ".join(h.text.split())[:220]
            logger.info(
                "[retrieval-debug] rank=%d chunk_id=%s score=%.4f u=%s type=%s text=%s",
                i,
                h.chunk_id,
                h.score,
                str(h.metadata.get("university_code") or ""),
                str(h.metadata.get("chunk_type") or ""),
                preview,
            )
        return hits[:k]


retrieval_service = RetrievalService()
