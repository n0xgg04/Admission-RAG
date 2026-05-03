import json
import logging
from pathlib import Path
from typing import Any, cast

from chromadb.api.types import Embedding, Metadata

from app.core.config import settings
from app.models.ingest import IngestResponse
from app.services.embedding import embedding_service
from app.services.store import vector_store

logger = logging.getLogger(__name__)


def _compact_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return " ".join(value.split())
    return " ".join(str(value).split())


def _qa_to_documents(qa: dict[str, Any], idx: int) -> list[tuple[str, str, Metadata]]:
    question = _compact_text(qa.get("question"))
    answer = _compact_text(qa.get("answer"))
    university_code = _compact_text(qa.get("university_code")).upper()
    university_name = _compact_text(qa.get("university_name"))
    intent = _compact_text(qa.get("intent"))
    data_status = _compact_text(qa.get("data_status"))
    confidence = qa.get("confidence")
    method_id = _compact_text(qa.get("method_id"))
    program_code = _compact_text(qa.get("program_code"))
    program_type = _compact_text(qa.get("program_type"))
    entity_type = _compact_text(qa.get("entity_type"))
    entity_field = _compact_text(qa.get("entity_field"))
    is_contrastive = bool(qa.get("is_contrastive") or False)
    tags = qa.get("tags") or []
    tags_text = ", ".join([_compact_text(t) for t in tags if _compact_text(t)])
    is_global = university_code == "ALL"
    is_hard_negative = intent.startswith("hard_negative") or "hard_negative" in tags_text

    base_id = f"{university_code or 'UNK'}:qa:{idx}"
    pair_id = f"{base_id}:pair"
    q_id = f"{base_id}:q"
    pair_text = f"Hỏi: {question}\nĐáp: {answer}"

    def infer_scope() -> str:
        return "global" if is_global else "local"

    def infer_domain() -> str:
        s = intent.lower()
        if s.startswith("fact_"):
            return "fact"
        if "cutoff" in s:
            return "cutoff"
        if "tuition" in s:
            return "tuition"
        if "compare" in s:
            return "compare"
        if "admission" in s or "method" in s:
            return "admission"
        if "program" in s:
            return "program"
        return "general"

    metadata_dict: dict[str, str | int | float | bool] = {
        "university_code": university_code,
        "university_name": university_name,
        "admission_year": "2025",
        "method_id": method_id,
        "program_code": program_code,
        "program_type": program_type,
        "intent": intent,
        "data_status": data_status,
        "tags": tags_text,
        "entity_type": entity_type,
        "entity_field": entity_field,
        "is_contrastive": is_contrastive,
        "is_global": is_global,
        "is_hard_negative": is_hard_negative,
        "scope": infer_scope(),
        "domain": infer_domain(),
        "source_dataset": "qa_2025_clean",
        "qa_group_id": base_id,
        "chunk_type": "qa_pair",
    }
    if isinstance(confidence, int | float):
        metadata_dict["confidence"] = float(confidence)

    question_meta = dict(metadata_dict)
    question_meta["chunk_type"] = "qa_question"
    question_meta["answer_text"] = answer

    return [
        (pair_id, pair_text, cast(Metadata, metadata_dict)),
        (q_id, question, cast(Metadata, question_meta)),
    ]


def _is_valid_qa(qa: dict[str, Any]) -> bool:
    question = _compact_text(qa.get("question"))
    answer = _compact_text(qa.get("answer"))
    code = _compact_text(qa.get("university_code"))
    if not question or not answer:
        return False
    if len(question) < 5 or len(answer) < 5:
        return False
    if not code:
        return False
    return True


class IngestService:
    def run(self, data_dir: str | None = None, rebuild_index: bool = False) -> IngestResponse:
        qa_path = Path(data_dir or settings.qa_dataset_path)
        if not qa_path.exists():
            return IngestResponse(
                status="error",
                universities_processed=0,
                chunks_created=0,
                collection_size=0,
                message=f"QA dataset not found at {qa_path}",
            )

        if rebuild_index:
            logger.info(
                "[ingest] rebuild_index=true, resetting collection '%s'", settings.chroma_collection
            )
            vector_store.reset()

        collection = vector_store.get_collection()
        qa_lines = qa_path.read_text(encoding="utf-8").splitlines()
        total_lines = len(qa_lines)
        logger.info("[ingest] start indexing QA dataset: %s (%d lines)", qa_path, total_lines)

        batch_size = 500
        ids: list[str] = []
        docs: list[str] = []
        metadatas: list[Metadata] = []
        processed = 0
        skipped = 0
        schools: set[str] = set()

        def flush_batch() -> None:
            nonlocal ids, docs, metadatas
            if not ids:
                return
            vectors = cast(list[Embedding], embedding_service.embed_texts(docs))
            collection.upsert(
                ids=ids,
                documents=docs,
                metadatas=metadatas,
                embeddings=vectors,
            )
            ids = []
            docs = []
            metadatas = []

        for idx, line in enumerate(qa_lines):
            raw = line.strip()
            if not raw:
                continue
            qa = json.loads(raw)
            if not isinstance(qa, dict) or not _is_valid_qa(qa):
                skipped += 1
                continue
            docs_for_qa = _qa_to_documents(qa, idx)
            for doc_id, doc_text, metadata in docs_for_qa:
                ids.append(doc_id)
                docs.append(doc_text)
                metadatas.append(metadata)
                code = str(metadata.get("university_code") or "")
                if code:
                    schools.add(code)
                processed += 1

            if len(ids) >= batch_size:
                flush_batch()
                logger.info("[ingest] progress: %d/%d QA items indexed", processed, total_lines)

        flush_batch()
        logger.info("[ingest] completed: %d/%d QA items indexed", processed, total_lines)
        if skipped:
            logger.info("[ingest] skipped %d invalid QA rows", skipped)

        collection_size = collection.count()
        logger.info(
            "[ingest] collection '%s' now has %d vectors across %d schools",
            settings.chroma_collection,
            collection_size,
            len(schools),
        )

        return IngestResponse(
            status="ok",
            universities_processed=len(schools),
            chunks_created=processed,
            collection_size=collection_size,
            message="Ingest completed from QA dataset and persisted to Chroma.",
        )


ingest_service = IngestService()
