from __future__ import annotations

from collections.abc import Mapping
from typing import Any
import re

from app.core.config import settings
from app.models.search import SearchHit
from app.services.embedding import embedding_service
from app.services.store import vector_store


def _where_filter(
    university_code: str | None,
    method_id: str | None,
    program_code: str | None,
    program_type: str | None,
    include_hard_negative: bool = False,
) -> dict:
    clauses = []
    if university_code:
        clauses.append({"university_code": university_code.upper()})
    if method_id:
        clauses.append({"method_id": method_id})
    if program_code:
        clauses.append({"program_code": program_code})
    if program_type:
        clauses.append({"program_type": program_type})
    if not include_hard_negative:
        clauses.append({"is_hard_negative": False})
    clauses.append({"chunk_type": "qa_pair"})

    if not clauses:
        return {}
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def _query_intent_where_hint(query: str) -> dict | None:
    q = query.lower()
    # Ưu tiên fact ngành khi hỏi "có những ngành gì"
    if any(k in q for k in ["những ngành gì", "ngành nào", "danh sách ngành", "đào tạo ngành"]):
        return {"$or": [{"intent": "school_programs_top5"}, {"intent": "program_to_schools_top5"}]}
    if any(k in q for k in ["ở đâu", "địa chỉ", "thuộc tỉnh", "viết tắt", "mã trường"]):
        return {
            "$or": [
                {"intent": "fact_address"},
                {"intent": "fact_province"},
                {"intent": "fact_short_name"},
                {"intent": "fact_code"},
                {"intent": "university_profile"},
            ]
        }
    if any(k in q for k in ["điểm chuẩn", "lấy bao nhiêu điểm"]):
        return {
            "$or": [
                {"intent": "cutoff_major_detail"},
                {"intent": "cutoff_school_top5"},
                {"intent": "cutoff_compare_two_schools"},
                {"intent": "cutoff_compare_same_major_two_schools"},
                {"intent": "cutoff_compare_subject_groups_same_major"},
                {"intent": "cutoff_compare_subject_groups_global"},
            ]
        }
    if any(k in q for k in ["ielts", "sat", "act", "hsa", "tsa", "v-act", "học bạ", "hoc ba"]):
        return {
            "$or": [
                {"intent": "global_method_keyword"},
                {"intent": "admission_method_detail"},
                {"intent": "negative_hoc_ba_not_found"},
            ]
        }
    if any(k in q for k in ["học phí", "hoc phi", "chi phí", "duoi", "không quá", "khong qua"]):
        return {
            "$or": [
                {"intent": "tuition_full"},
                {"intent": "tuition_detail"},
                {"intent": "global_tuition_under_threshold"},
                {"intent": "global_tuition_y_major"},
            ]
        }
    if any(k in q for k in ["so sánh", "so sanh"]):
        return {
            "$or": [
                {"intent": "cutoff_compare_two_schools"},
                {"intent": "cutoff_compare_two_majors_same_school"},
                {"intent": "cutoff_compare_same_major_two_schools"},
                {"intent": "cutoff_compare_subject_groups_same_major"},
                {"intent": "cutoff_compare_subject_groups_global"},
            ]
        }
    return None


def _first_row(value: Any) -> list[Any]:
    if not isinstance(value, list) or not value:
        return []
    first = value[0]
    if isinstance(first, list):
        return first
    return []


def _metadata_to_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    return {}


class RetrievalService:
    @staticmethod
    def _normalize_query(query: str) -> str:
        q = " ".join(query.split())
        # Dataset only covers 2025, remove explicit year noise.
        q = re.sub(r"\b(19|20)\d{2}\b", "", q)
        q = re.sub(r"\bnăm\s*\b", "", q, flags=re.IGNORECASE)
        q = re.sub(r"\s+", " ", q).strip()
        return q or query.strip()

    @staticmethod
    def _token_overlap(a: str, b: str) -> float:
        ta = {x for x in re.findall(r"[\wÀ-ỹ]+", a.lower()) if len(x) >= 2}
        tb = {x for x in re.findall(r"[\wÀ-ỹ]+", b.lower()) if len(x) >= 2}
        if not ta or not tb:
            return 0.0
        return len(ta & tb) / max(1, len(ta))

    @staticmethod
    def _intent_bonus(query: str, metadata: dict[str, Any]) -> float:
        q = query.lower()
        intent = str(metadata.get("intent") or "").lower()
        bonus = 0.0
        if any(k in q for k in ["ở đâu", "địa chỉ", "địa điểm", "nằm ở", "ở tỉnh"]):
            if intent in {"university_profile", "lookup_by_code"}:
                bonus += 0.08
        if any(k in q for k in ["điểm chuẩn", "lấy bao nhiêu điểm", "to-hop", "tổ hợp"]):
            if "cutoff" in intent:
                bonus += 0.08
        if any(k in q for k in ["học phí", "chi phí"]):
            if "tuition" in intent:
                bonus += 0.08
        return bonus

    @staticmethod
    def _query_wants_negative(query: str) -> bool:
        q = query.lower()
        negative_markers = [
            "không có",
            "chưa có",
            "có xét",
            "đúng không",
            "có phải",
            "hay không",
        ]
        return any(m in q for m in negative_markers)

    def _query_once(
        self,
        query: str,
        k: int,
        where: dict | None,
    ) -> list[SearchHit]:
        collection = vector_store.get_collection()
        query_vector = embedding_service.embed_texts([query])[0]
        result = collection.query(
            query_embeddings=[query_vector],
            n_results=k,
            where=where,
        )

        ids = _first_row(result.get("ids"))
        docs = _first_row(result.get("documents"))
        metas = _first_row(result.get("metadatas"))
        distances = _first_row(result.get("distances"))

        hits: list[SearchHit] = []
        for idx, chunk_id in enumerate(ids):
            distance = distances[idx] if idx < len(distances) else 1.0
            score = max(0.0, 1.0 - float(distance))
            hits.append(
                SearchHit(
                    chunk_id=chunk_id,
                    score=score,
                    text=docs[idx] if idx < len(docs) else "",
                    metadata=_metadata_to_dict(metas[idx]) if idx < len(metas) else {},
                )
            )
        return hits

    @staticmethod
    def _and_where(base: dict | None, hint: dict | None) -> dict | None:
        if not base and not hint:
            return None
        if base and not hint:
            return base
        if hint and not base:
            return hint
        return {"$and": [base, hint]}

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
        include_hard_negative = self._query_wants_negative(query)
        base_where = _where_filter(
            university_code,
            method_id,
            program_code,
            program_type,
            include_hard_negative=include_hard_negative,
        )
        hint_where = _query_intent_where_hint(query)
        where = self._and_where(base_where if base_where else None, hint_where)

        normalized = self._normalize_query(query)
        base_hits = self._query_once(query=query, k=max(k, 8), where=where if where else None)
        if normalized != query:
            base_hits.extend(
                self._query_once(
                    query=normalized,
                    k=max(k, 8),
                    where=where if where else None,
                )
            )

        # Merge duplicate chunks (keep best score)
        merged: dict[str, SearchHit] = {}
        for hit in base_hits:
            old = merged.get(hit.chunk_id)
            if old is None or hit.score > old.score:
                merged[hit.chunk_id] = hit

        # Lightweight lexical rerank to align with cleaned QA text
        reranked: list[SearchHit] = []
        for hit in merged.values():
            overlap = self._token_overlap(normalized, hit.text)
            hit.score = min(
                1.0,
                hit.score
                + 0.12 * overlap
                + self._intent_bonus(normalized, hit.metadata),
            )
            reranked.append(hit)

        reranked.sort(key=lambda h: h.score, reverse=True)
        return reranked[:k]


retrieval_service = RetrievalService()
