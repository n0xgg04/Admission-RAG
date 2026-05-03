from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.search import SearchHit
from app.services.embedding import embedding_service
from app.services.store import vector_store


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
    @staticmethod
    def _norm(text: str) -> str:
        s = unicodedata.normalize("NFD", text or "")
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

    def _resolve_university_code(self, query: str, explicit_code: str | None) -> str | None:
        if explicit_code:
            return explicit_code.upper()

        qn = self._norm(query)
        if not qn:
            return None

        hard_alias_to_code = {
            "buu chinh vien thong": "BVH",
            "ngoai thuong": "NTH",
            "bach khoa ha noi": "BKA",
            "kinh te quoc dan": "KHA",
            "hoc vien ngan hang": "NHH",
        }
        for alias, code in hard_alias_to_code.items():
            if alias in qn:
                return code

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

        return best_code if best_score >= 2.0 else None

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
        query_vector = embedding_service.embed_texts([query])[0]
        result = collection.query(query_embeddings=[query_vector], n_results=candidate_k, where=where)

        ids = _first_row(result.get("ids"))
        docs = _first_row(result.get("documents"))
        metas = _first_row(result.get("metadatas"))
        distances = _first_row(result.get("distances"))

        hits: list[SearchHit] = []
        for idx, chunk_id in enumerate(ids):
            distance = distances[idx] if idx < len(distances) else 1.0
            vector_score = max(0.0, 1.0 - float(distance))
            hits.append(
                SearchHit(
                    chunk_id=chunk_id,
                    score=vector_score,
                    text=docs[idx] if idx < len(docs) else "",
                    metadata=_metadata_to_dict(metas[idx]) if idx < len(metas) else {},
                )
            )

        if not hits:
            return []

        bm25_scores = self._bm25_score(query, [h.text for h in hits])
        for h, b in zip(hits, bm25_scores, strict=False):
            h.score = min(1.0, 0.7 * h.score + 0.3 * b)

        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:k]


retrieval_service = RetrievalService()
